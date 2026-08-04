/* ============================================
   LOWPASS — Budget Expense Receipts API

   GET: List expense_receipts for a tour (?tour_id=uuid).
        Order by date desc, receipt_number desc.
   POST: Create receipt. Auto-generate receipt_number (R-001, R-002, ...).
        If in_budget and linked_line_item_id, add cost to line item actual (math spec §11).
   PATCH: Update receipt. Apply in_budget toggle to line item actual (§11).
   DELETE: Delete receipt; if was in_budget, subtract from line item (§11).
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { syncActualCostIfNoOverride } from '@/lib/budget/transactions';

/** RC-5 page range as a spreadable fragment — `{}` when there isn't one. */
function pageRange(from: unknown, to: unknown): Record<string, number> {
  const f = Number(from);
  const t = Number(to);
  if (!Number.isFinite(f) || !Number.isFinite(t) || f < 1 || t < f) return {};
  return { page_from: f, page_to: t };
}

function parseReceiptNumber(receiptNumber: string): number {
  const match = (receiptNumber ?? '').match(/^R-?(\d+)$/i);
  return match ? parseInt(match[1], 10) : 0;
}

function formatReceiptNumber(n: number): string {
  return `R-${String(n).padStart(3, '0')}`;
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);

  // B2 — workspace-scoped receipt SEARCH (⌘K). When `q` is present we search the
  // user's OWN workspace receipts (financial/PII never leave the workspace — the
  // explicit workspace_id filter + RLS), pre-filtering candidates by ILIKE over
  // vendor / description / extracted_text / receipt_number; the ⌘K provider
  // fuzzy-ranks them. No tour_id required (search spans the workspace's tours).
  const q = searchParams.get('q');
  if (q != null) {
    // Strip characters that break PostgREST's `.or(...)` grammar (commas, parens)
    // and escape ILIKE wildcards. Search is a contains-match, so this is lossless
    // enough for ⌘K.
    const term = q.trim().replace(/[(),]/g, ' ').trim();
    if (term.length < 2) return NextResponse.json({ receipts: [] });
    const like = `%${term.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    const { data, error } = await supabase
      .from('expense_receipts')
      .select('id, tour_id, receipt_number, vendor, date, category, cost_tour_currency')
      .eq('workspace_id', profile.workspace_id)
      .or(`vendor.ilike.${like},description.ilike.${like},extracted_text.ilike.${like},receipt_number.ilike.${like}`)
      .order('date', { ascending: false, nullsFirst: false })
      .limit(30);
    if (error) {
      // Don't surface raw OCR/PII in the error; log only a generic message.
      console.error('[receipts-search] query failed:', error.message);
      return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }
    return NextResponse.json({ receipts: data ?? [] });
  }

  const tourId = searchParams.get('tour_id');
  if (!tourId) {
    return NextResponse.json({ error: 'tour_id is required' }, { status: 400 });
  }

  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('workspace_id', profile.workspace_id)
    .single();

  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('expense_receipts')
    .select('*')
    .eq('workspace_id', profile.workspace_id)
    .eq('tour_id', tourId)
    .order('date', { ascending: false, nullsFirst: true })
    .order('receipt_number', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ receipts: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  let body: {
    tour_id: string;
    date?: string | null;
    vendor?: string | null;
    category?: string | null;
    description?: string | null;
    payment_method?: string;
    cost_tour_currency?: number;
    cost_home_currency?: number;
    receipt_file_url?: string | null;
    in_budget?: boolean;
    linked_line_item_id?: string | null;
    notes?: string | null;
    /* RC-5 — which pages of receipt_file_url this receipt covers, when one
       uploaded PDF held several receipts. NULL/absent = the whole file. */
    page_from?: number | null;
    page_to?: number | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { tour_id } = body;
  if (!tour_id) {
    return NextResponse.json({ error: 'tour_id is required' }, { status: 400 });
  }

  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tour_id)
    .eq('workspace_id', profile.workspace_id)
    .single();

  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  const inBudget = !!body.in_budget;
  const linkedLineItemId = body.linked_line_item_id ?? null;
  const costTour = Number(body.cost_tour_currency) || 0;

  /* BUD-01 — atomic-ish per-tour numbering. The next R-00n is max+1 over the
     tour's existing receipts; we DON'T swallow the read error (a silent failure
     used to yield maxNum 0 → duplicate "R-001"), and we RETRY on a UNIQUE
     violation (migration 209's expense_receipts_tour_receipt_number_key) so two
     near-simultaneous attaches can't collide. */
  const baseRow = {
    tour_id,
    workspace_id: profile.workspace_id,
    date: body.date ?? null,
    vendor: body.vendor ?? null,
    category: body.category ?? null,
    description: body.description ?? null,
    payment_method: body.payment_method ?? 'card',
    cost_tour_currency: costTour,
    cost_home_currency: Number(body.cost_home_currency) || 0,
    receipt_file_url: body.receipt_file_url ?? null,
    in_budget: inBudget,
    linked_line_item_id: linkedLineItemId,
    notes: body.notes ?? null,
    /* RC-5 — page range within a shared file; the 252 CHECK enforces
       both-or-neither. OMITTED entirely when there is no range, rather than
       written as null: an ordinary single-file receipt then inserts fine on a
       database where 252 has not been applied yet, so the deploy and the
       migration are independent. Only the multi-document split needs the
       columns, and that is the only path that sends them. */
    ...pageRange(body.page_from, body.page_to),
  };

  let created: Record<string, unknown> | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: existingReceipts, error: readError } = await supabase
      .from('expense_receipts')
      .select('receipt_number')
      .eq('tour_id', tour_id)
      .eq('workspace_id', profile.workspace_id);
    if (readError) {
      return NextResponse.json({ error: readError.message }, { status: 500 });
    }
    let maxNum = 0;
    for (const r of existingReceipts ?? []) {
      const n = parseReceiptNumber(r.receipt_number as string);
      if (n > maxNum) maxNum = n;
    }
    const receiptNumber = formatReceiptNumber(maxNum + 1);

    const { data: row, error: insertError } = await supabase
      .from('expense_receipts')
      .insert({ ...baseRow, receipt_number: receiptNumber })
      .select()
      .single();

    if (!insertError && row) {
      created = row;
      break;
    }
    // 23505 = unique_violation: another receipt grabbed this number — recompute.
    if (insertError && insertError.code === '23505') continue;
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  if (!created) {
    return NextResponse.json({ error: 'Could not allocate a receipt number' }, { status: 500 });
  }

  /* RQ-4 — was: actual_cost += costTour, a direct write. Creating a receipt row
     records a DOCUMENT; it does not spend money. The amount becomes money when a
     transaction is written (POST /line-items/{id}/transactions), and actual_cost
     follows from the transaction sum. Adding here double-counted the moment a
     transaction was also created, and bypassed the override guard either way. */

  return NextResponse.json(created);
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  let body: {
    id: string;
    in_budget?: boolean;
    linked_line_item_id?: string | null;
    cost_tour_currency?: number;
    date?: string | null;
    vendor?: string | null;
    category?: string | null;
    description?: string | null;
    payment_method?: string;
    cost_home_currency?: number;
    receipt_file_url?: string | null;
    notes?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { id, ...updates } = body;
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('expense_receipts')
    .select('in_budget, linked_line_item_id, cost_tour_currency')
    .eq('id', id)
    .eq('workspace_id', profile.workspace_id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
  }

  const prevLinkedId = existing.linked_line_item_id as string | null;
  const newLinkedId = updates.linked_line_item_id !== undefined ? updates.linked_line_item_id : prevLinkedId;

  /* RQ-4 — was: subtract prevCost from the old line, add newCost to the new one,
     both as direct actual_cost writes. Two bugs in one block.

     It double-counted. The apply path already writes a TRANSACTION for the
     receipt's amount, and actual_cost is the sum of transactions — so editing any
     field on a filed receipt (which is exactly what the Receipts bank does) added
     the amount a second time. Toggling in_budget off and on again could add it
     repeatedly. And both writes bypassed actual_cost_override.

     Receipts carry no money of their own. The only money write in this feature is
     POST /line-items/{id}/transactions; actual_cost follows from it. Below we
     re-sync any line this receipt joined or left, so their stored actuals are
     provably the sum of the transactions that remain. */

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.date !== undefined) payload.date = updates.date;
  if (updates.vendor !== undefined) payload.vendor = updates.vendor;
  if (updates.category !== undefined) payload.category = updates.category;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.payment_method !== undefined) payload.payment_method = updates.payment_method;
  if (updates.cost_tour_currency !== undefined) payload.cost_tour_currency = updates.cost_tour_currency;
  if (updates.cost_home_currency !== undefined) payload.cost_home_currency = updates.cost_home_currency;
  if (updates.receipt_file_url !== undefined) payload.receipt_file_url = updates.receipt_file_url;
  if (updates.in_budget !== undefined) payload.in_budget = updates.in_budget;
  if (updates.linked_line_item_id !== undefined) payload.linked_line_item_id = updates.linked_line_item_id;
  if (updates.notes !== undefined) payload.notes = updates.notes;

  const { data, error } = await supabase
    .from('expense_receipts')
    .update(payload)
    .eq('id', id)
    .eq('workspace_id', profile.workspace_id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  /* Re-sync every line this receipt touched — the one it left and the one it
     joined. Numerically a no-op when things were already consistent; a repair
     when they weren't. Best-effort: never fail an edit over a recompute. */
  for (const lineId of new Set([prevLinkedId, newLinkedId].filter(Boolean) as string[])) {
    await syncActualCostIfNoOverride(supabase, lineId, 1).catch(() => {});
  }

  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  let body: { id: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('expense_receipts')
    .select('in_budget, linked_line_item_id, cost_tour_currency')
    .eq('id', body.id)
    .eq('workspace_id', profile.workspace_id)
    .single();

  const linkedLineId = existing?.linked_line_item_id ?? null;

  const { error } = await supabase
    .from('expense_receipts')
    .delete()
    .eq('id', body.id)
    .eq('workspace_id', profile.workspace_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  /* RQ-4 — this block used to hand-write actual_cost:
       actual_cost = max(0, actual_cost - receipt.cost_tour_currency)
     which broke the invariant twice over.

     1. It was a DIRECT actual_cost write, bypassing the reconcile and the
        actual_cost_override guard — the exact thing the receipt path exists to
        avoid everywhere else.
     2. It was WRONG. budget_line_item_transactions.receipt_id is
        ON DELETE SET NULL (migration 104), so deleting a receipt does NOT delete
        its transaction — the money stays spent and still counts toward the sum.
        Subtracting the receipt's cost on top of that understated the line, and
        the error healed unpredictably the next time anything re-synced.

     The correct behaviour: deleting a receipt deletes the EVIDENCE, not the
     spend. The transaction survives, so the number should not move. We call the
     one sanctioned sync so the stored actual is provably the sum of the
     transactions that remain — a no-op when things were already consistent, and
     a repair when they weren't. Deleting the transaction is a separate,
     explicit action on the transactions route. */
  if (linkedLineId) {
    await syncActualCostIfNoOverride(supabase, linkedLineId, 1).catch(() => {
      /* best-effort: the receipt is already gone, and the next transaction
         write re-syncs. Never fail the delete over a recompute. */
    });
  }

  return new Response(null, { status: 204 });
}

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
import { createServerSupabaseClient } from '@/lib/supabase-server';

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

  if (inBudget && linkedLineItemId && costTour !== 0) {
    const { data: lineItem } = await supabase
      .from('budget_line_items')
      .select('id, actual_cost')
      .eq('id', linkedLineItemId)
      .eq('workspace_id', profile.workspace_id)
      .single();
    if (lineItem) {
      const newActual = (Number(lineItem.actual_cost) || 0) + costTour;
      await supabase
        .from('budget_line_items')
        .update({ actual_cost: newActual, updated_at: new Date().toISOString() })
        .eq('id', linkedLineItemId)
        .eq('workspace_id', profile.workspace_id);
    }
  }

  return NextResponse.json(created);
}

export async function PATCH(request: Request) {
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

  const prevInBudget = !!existing.in_budget;
  const prevLinkedId = existing.linked_line_item_id as string | null;
  const prevCost = Number(existing.cost_tour_currency) || 0;
  const newInBudget = updates.in_budget !== undefined ? !!updates.in_budget : prevInBudget;
  const newLinkedId = updates.linked_line_item_id !== undefined ? updates.linked_line_item_id : prevLinkedId;
  const newCost = updates.cost_tour_currency !== undefined ? Number(updates.cost_tour_currency) : prevCost;

  if (prevInBudget && prevLinkedId && prevCost !== 0) {
    const { data: lineItem } = await supabase
      .from('budget_line_items')
      .select('id, actual_cost')
      .eq('id', prevLinkedId)
      .eq('workspace_id', profile.workspace_id)
      .single();
    if (lineItem) {
      const newActual = Math.max(0, (Number(lineItem.actual_cost) || 0) - prevCost);
      await supabase
        .from('budget_line_items')
        .update({ actual_cost: newActual, updated_at: new Date().toISOString() })
        .eq('id', prevLinkedId)
        .eq('workspace_id', profile.workspace_id);
    }
  }
  if (newInBudget && newLinkedId && newCost !== 0) {
    const { data: lineItem } = await supabase
      .from('budget_line_items')
      .select('id, actual_cost')
      .eq('id', newLinkedId)
      .eq('workspace_id', profile.workspace_id)
      .single();
    if (lineItem) {
      const newActual = (Number(lineItem.actual_cost) || 0) + newCost;
      await supabase
        .from('budget_line_items')
        .update({ actual_cost: newActual, updated_at: new Date().toISOString() })
        .eq('id', newLinkedId)
        .eq('workspace_id', profile.workspace_id);
    }
  }

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
  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
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

  if (existing?.in_budget && existing?.linked_line_item_id) {
    const cost = Number(existing.cost_tour_currency) || 0;
    if (cost !== 0) {
      const { data: lineItem } = await supabase
        .from('budget_line_items')
        .select('id, actual_cost')
        .eq('id', existing.linked_line_item_id)
        .eq('workspace_id', profile.workspace_id)
        .single();
      if (lineItem) {
        const newActual = Math.max(0, (Number(lineItem.actual_cost) || 0) - cost);
        await supabase
          .from('budget_line_items')
          .update({ actual_cost: newActual, updated_at: new Date().toISOString() })
          .eq('id', existing.linked_line_item_id)
          .eq('workspace_id', profile.workspace_id);
      }
    }
  }

  const { error } = await supabase
    .from('expense_receipts')
    .delete()
    .eq('id', body.id)
    .eq('workspace_id', profile.workspace_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return new Response(null, { status: 204 });
}

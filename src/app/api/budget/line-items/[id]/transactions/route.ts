/* ============================================
   LOWPASS — GET/POST /api/budget/line-items/[id]/transactions
   (Budget Phase A §A1)

   List + create transactions for a line item.

   Auth chain:
     requireUserAndWorkspace          (cookie session + workspace_id)
     resolveLineItemContext(lineId)   (line item belongs to that workspace)
     requireTourInWorkspace(tour)     (defence-in-depth: confirms tour
                                       row is in the same workspace —
                                       catches the unlikely race where
                                       line_items.workspace_id drifts
                                       from tours.workspace_id)

   Reuse from §SAFE so future endpoints get the same shape.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  requireUserAndWorkspace,
  requireTourInWorkspace,
} from '@/lib/auth/workspace-check';
import {
  resolveLineItemContext,
  type BudgetLineItemTransaction,
} from '@/lib/budget/transactions';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: lineItemId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireUserAndWorkspace(supabase);
  if ('error' in auth) return auth.error;

  const ctx = await resolveLineItemContext(supabase, lineItemId, auth.workspaceId);
  if (!ctx.ok) return ctx.response;
  const tourGate = await requireTourInWorkspace(supabase, ctx.tour_id, auth.workspaceId);
  if (tourGate) return tourGate;

  const { data, error } = await supabase
    .from('budget_line_item_transactions')
    .select('*')
    .eq('line_item_id', lineItemId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ transactions: (data ?? []) as BudgetLineItemTransaction[] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: lineItemId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireUserAndWorkspace(supabase);
  if ('error' in auth) return auth.error;

  const ctx = await resolveLineItemContext(supabase, lineItemId, auth.workspaceId);
  if (!ctx.ok) return ctx.response;
  const tourGate = await requireTourInWorkspace(supabase, ctx.tour_id, auth.workspaceId);
  if (tourGate) return tourGate;

  let body: {
    vendor_name?: unknown;
    amount?: unknown;
    currency?: unknown;
    paid_at?: unknown;
    receipt_id?: unknown;
    notes?: unknown;
    sort_order?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  /* Validation: vendor_name + amount required. Currency
     defaults to the line item's currency when omitted.
     Amount must be ≥ 0; the schema allows negatives but the
     §A1 spec gates negatives out at the API layer (refunds /
     adjustments are a Phase B+ concern). */
  const vendor =
    typeof body.vendor_name === 'string' ? body.vendor_name.trim() : '';
  if (!vendor) {
    return NextResponse.json({ error: 'vendor_name required' }, { status: 400 });
  }
  const amountRaw = Number(body.amount);
  if (!Number.isFinite(amountRaw) || amountRaw < 0) {
    return NextResponse.json({ error: 'amount must be a non-negative number' }, { status: 400 });
  }
  const currency =
    typeof body.currency === 'string' && body.currency.trim()
      ? body.currency.trim()
      : ctx.currency;
  const paid_at =
    typeof body.paid_at === 'string' && body.paid_at.trim() ? body.paid_at.trim() : null;
  const receipt_id =
    typeof body.receipt_id === 'string' && body.receipt_id.trim()
      ? body.receipt_id.trim()
      : null;
  const notes = typeof body.notes === 'string' ? body.notes : null;
  const sort_order =
    typeof body.sort_order === 'number' && Number.isFinite(body.sort_order)
      ? Math.floor(body.sort_order)
      : await nextSortOrder(supabase, lineItemId);

  const { data, error } = await supabase
    .from('budget_line_item_transactions')
    .insert({
      workspace_id: auth.workspaceId,
      line_item_id: lineItemId,
      vendor_name: vendor,
      amount: amountRaw,
      currency,
      paid_at,
      receipt_id,
      notes,
      sort_order,
    })
    .select('*')
    .single<BudgetLineItemTransaction>();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? 'Could not create transaction' },
      { status: 500 },
    );
  }
  return NextResponse.json({ transaction: data }, { status: 201 });
}

/** Next sort_order = max(existing) + 1, or 0 if no rows. */
async function nextSortOrder(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  lineItemId: string,
): Promise<number> {
  const { data } = await supabase
    .from('budget_line_item_transactions')
    .select('sort_order')
    .eq('line_item_id', lineItemId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle<{ sort_order: number }>();
  return data ? data.sort_order + 1 : 0;
}

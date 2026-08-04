/* ============================================
   LOWPASS — PATCH /api/budget/transactions/[id]/reorder
   (Budget Phase A §A1)

   Sets the transaction's sort_order to a caller-supplied
   integer. Separate endpoint from the generic PATCH so the
   drag-reorder client code has a tightly-scoped contract
   (no risk of accidentally setting other fields during a
   drag).

   Body: { sort_order: number }

   Validation: sort_order must be a finite integer ≥ 0.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireWrite } from '@/lib/auth/workspace-check';
import {
  resolveTransactionLineItem,
  type BudgetLineItemTransaction,
} from '@/lib/budget/transactions';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const ctx = await resolveTransactionLineItem(supabase, id, auth.workspaceId);
  if (!ctx.ok) return ctx.response;

  let body: { sort_order?: unknown };
  try {
    body = (await request.json()) as { sort_order?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const next = Number(body.sort_order);
  if (!Number.isFinite(next) || next < 0) {
    return NextResponse.json(
      { error: 'sort_order must be a non-negative integer' },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from('budget_line_item_transactions')
    .update({ sort_order: Math.floor(next), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single<BudgetLineItemTransaction>();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? 'Could not reorder' },
      { status: 500 },
    );
  }
  return NextResponse.json({ transaction: data });
}

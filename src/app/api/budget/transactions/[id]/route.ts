/* ============================================
   LOWPASS — PATCH/DELETE /api/budget/transactions/[id]
   (Budget Phase A §A1)

   Update or delete an individual transaction. The line_item +
   workspace auth chain lives in resolveTransactionLineItem;
   the response shape is the updated transaction (PATCH) or
   `{ ok: true }` (DELETE).

   DELETE is RLS-gated to workspace admins by the migration
   policy. The route returns 403 if the underlying DELETE
   affects zero rows for an authenticated non-admin user —
   matches the migration's policy guard.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireUserAndWorkspace } from '@/lib/auth/workspace-check';
import {
  resolveTransactionLineItem,
  syncActualCostIfNoOverride,
  type BudgetLineItemTransaction,
  type TransactionInput,
} from '@/lib/budget/transactions';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireUserAndWorkspace(supabase);
  if ('error' in auth) return auth.error;
  const ctx = await resolveTransactionLineItem(supabase, id, auth.workspaceId);
  if (!ctx.ok) return ctx.response;

  let body: TransactionInput & Record<string, unknown>;
  try {
    body = (await request.json()) as TransactionInput & Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  /* Build the patch object from supplied fields only — caller
     can update one field at a time (the slide-over commits on
     each input blur). Validation matches POST. */
  const patch: Record<string, unknown> = {};
  if (typeof body.vendor_name === 'string') {
    const v = body.vendor_name.trim();
    if (!v) {
      return NextResponse.json({ error: 'vendor_name cannot be empty' }, { status: 400 });
    }
    patch.vendor_name = v;
  }
  if (body.amount !== undefined) {
    const a = Number(body.amount);
    if (!Number.isFinite(a) || a < 0) {
      return NextResponse.json(
        { error: 'amount must be a non-negative number' },
        { status: 400 },
      );
    }
    patch.amount = a;
  }
  if (body.currency !== undefined) {
    patch.currency =
      typeof body.currency === 'string' && body.currency.trim()
        ? body.currency.trim()
        : null;
  }
  if (body.paid_at !== undefined) {
    patch.paid_at =
      typeof body.paid_at === 'string' && body.paid_at.trim()
        ? body.paid_at.trim()
        : null;
  }
  if (body.receipt_id !== undefined) {
    patch.receipt_id =
      typeof body.receipt_id === 'string' && body.receipt_id.trim()
        ? body.receipt_id.trim()
        : null;
  }
  if (body.notes !== undefined) {
    patch.notes = typeof body.notes === 'string' ? body.notes : null;
  }
  if (typeof body.sort_order === 'number' && Number.isFinite(body.sort_order)) {
    patch.sort_order = Math.floor(body.sort_order);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ transaction: ctx.transaction });
  }
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('budget_line_item_transactions')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single<BudgetLineItemTransaction>();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? 'Could not update transaction' },
      { status: 500 },
    );
  }
  /* §A3 — if the amount changed, sync the line's actual_cost
     unless an override is active. patch.amount is only set when
     the PATCH body included an amount; other-field edits (vendor /
     notes / paid_at / sort_order) leave the sum untouched. */
  if (patch.amount !== undefined) {
    const delta = Number(data.amount) - Number(ctx.transaction.amount);
    await syncActualCostIfNoOverride(supabase, ctx.line_item_id, delta);
  }
  return NextResponse.json({ transaction: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireUserAndWorkspace(supabase);
  if ('error' in auth) return auth.error;
  const ctx = await resolveTransactionLineItem(supabase, id, auth.workspaceId);
  if (!ctx.ok) return ctx.response;

  /* RLS DELETE policy gates this to workspace admins. The
     delete will silently no-op for non-admins — we re-select
     after to detect that and return 403. */
  const { error } = await supabase
    .from('budget_line_item_transactions')
    .delete()
    .eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: stillThere } = await supabase
    .from('budget_line_item_transactions')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (stillThere) {
    return NextResponse.json(
      { error: 'Workspace admin required to delete transactions' },
      { status: 403 },
    );
  }
  /* §A3 — delta is negative since we removed the row's amount.
     Auto-sync the line's actual_cost unless an override is in
     place. */
  await syncActualCostIfNoOverride(
    supabase,
    ctx.line_item_id,
    -Number(ctx.transaction.amount || 0),
  );
  return NextResponse.json({ ok: true });
}

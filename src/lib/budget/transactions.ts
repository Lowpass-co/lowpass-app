/* ============================================
   LOWPASS — Budget line-item transactions (Phase A §A1)

   Types + auth helpers shared between the transaction CRUD
   endpoints. The migration is in 104; this file is the TS
   surface the routes + slide-over component consume.
   ============================================ */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface BudgetLineItemTransaction {
  id: string;
  workspace_id: string;
  line_item_id: string;
  vendor_name: string;
  amount: number;
  /** NULL on the row = inherit from line item. */
  currency: string | null;
  /** YYYY-MM-DD when set. */
  paid_at: string | null;
  receipt_id: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Body shape accepted by POST/PATCH. All fields optional on
 *  PATCH; POST requires vendor_name + amount. Validated per-
 *  route. */
export interface TransactionInput {
  vendor_name?: string;
  amount?: number;
  currency?: string | null;
  paid_at?: string | null;
  receipt_id?: string | null;
  notes?: string | null;
  sort_order?: number;
}

/** Compute the effective actual cost the grid + variance
 *  column will use. Single-source-of-truth helper so the API
 *  + future server-rendered views agree on the rule. Spec
 *  §A1 derivation rule, copy-paste safe to inline elsewhere
 *  too. */
export function effectiveActualCost(
  transactions: Pick<BudgetLineItemTransaction, 'amount'>[],
  fallbackActual: number | null | undefined,
): number {
  if (transactions.length > 0) {
    return transactions.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }
  return Number(fallbackActual ?? 0);
}

/** Look up a line item by id, scoped to the user's workspace,
 *  and return its tour_id + workspace_id. Returns a NextResponse
 *  on failure for the caller to relay unchanged.
 *
 *  Used by every transaction CRUD endpoint — the line item
 *  is the security boundary, not the transaction. A
 *  transaction.id alone is opaque; the caller's auth must
 *  prove ownership of the line item it's hanging off. */
export async function resolveLineItemContext(
  supabase: SupabaseClient,
  lineItemId: string,
  callerWorkspaceId: string,
): Promise<
  | { ok: true; tour_id: string; workspace_id: string; currency: string | null }
  | { ok: false; response: NextResponse }
> {
  if (!lineItemId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'line_item id required' }, { status: 400 }),
    };
  }
  const { data: row } = await supabase
    .from('budget_line_items')
    .select('id, tour_id, workspace_id, currency')
    .eq('id', lineItemId)
    .maybeSingle<{
      id: string;
      tour_id: string;
      workspace_id: string;
      currency: string | null;
    }>();
  if (!row) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Line item not found' }, { status: 404 }),
    };
  }
  if (row.workspace_id !== callerWorkspaceId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Wrong workspace' }, { status: 403 }),
    };
  }
  return {
    ok: true,
    tour_id: row.tour_id,
    workspace_id: row.workspace_id,
    currency: row.currency,
  };
}

/** Same shape as resolveLineItemContext but starting from a
 *  transaction id. Looks up the transaction, then resolves its
 *  line item context. */
export async function resolveTransactionLineItem(
  supabase: SupabaseClient,
  transactionId: string,
  callerWorkspaceId: string,
): Promise<
  | { ok: true; transaction: BudgetLineItemTransaction; line_item_id: string }
  | { ok: false; response: NextResponse }
> {
  if (!transactionId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'transaction id required' }, { status: 400 }),
    };
  }
  const { data: tx } = await supabase
    .from('budget_line_item_transactions')
    .select('*')
    .eq('id', transactionId)
    .maybeSingle<BudgetLineItemTransaction>();
  if (!tx) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Transaction not found' }, { status: 404 }),
    };
  }
  if (tx.workspace_id !== callerWorkspaceId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Wrong workspace' }, { status: 403 }),
    };
  }
  return { ok: true, transaction: tx, line_item_id: tx.line_item_id };
}

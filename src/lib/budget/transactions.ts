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

/** Render-time state for the Actual cell + slide-over field.
 *  Phase B §B0 — `isOverride` reads the explicit
 *  `actual_cost_override` flag from the row (migration 105),
 *  replacing the §A3 inference of "actual_cost differs from
 *  sum." The inference broke the create-then-add flow: typing
 *  $1000 in Actual, then adding transactions summing to
 *  $1300, looked like an override but the user never asked
 *  for one — they wanted the sum to win.
 *
 *  - `value` is what the grid + slide-over render
 *    (= actual_cost; auto-sync keeps it == transaction_sum
 *    unless the flag is true).
 *  - `isOverride` reflects the explicit flag.
 *  - `transactionSum` is the target value of the Sync action.
 *  - `transactionCount` powers the multi-txn 📎 indicator. */
export interface ActualState {
  value: number;
  isOverride: boolean;
  transactionSum: number;
  transactionCount: number;
}

export function getActualState(line: {
  actual_cost?: number | null;
  actual_cost_override?: boolean | null;
  transaction_sum?: number | null;
  transaction_count?: number | null;
}): ActualState {
  const actual = Number(line.actual_cost ?? 0);
  const count = Number(line.transaction_count ?? 0);
  const sum = Number(line.transaction_sum ?? 0);
  /* Override flag is the source of truth. Transient drift
     between actual and sum (e.g. between server auto-sync and
     client refetch) is not treated as override. */
  const isOverride = Boolean(line.actual_cost_override);
  return {
    value: actual,
    isOverride,
    transactionSum: sum,
    transactionCount: count,
  };
}

/** Single-source-of-truth value for legacy call sites that just
 *  want the number to render. Equivalent to getActualState(line).value
 *  — kept as a thin wrapper so the §A2 call sites stay
 *  one-liners. */
export function getEffectiveActual(line: {
  actual_cost?: number | null;
  actual_cost_override?: boolean | null;
  transaction_sum?: number | null;
  transaction_count?: number | null;
}): number {
  return getActualState(line).value;
}

/** Cent-precision equality. NUMERIC(12, 2) round-trips through
 *  JS Number losslessly for any realistic budget value, but
 *  accumulated float arithmetic (e.g. summing 100+ transactions)
 *  can drift sub-cent. Compare as fixed-2 strings to avoid
 *  false "override" markers from $0.001 drift. */
function numericEqual(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
  return a.toFixed(2) === b.toFixed(2);
}

/** §B0 — server-side auto-sync. When the transactions for a
 *  line item change, update the line's actual_cost to the new
 *  sum UNLESS the explicit actual_cost_override flag is set.
 *
 *  Reads the flag from the row (migration 105). Replaces the
 *  §A3 "previous actual matched previous sum" inference which
 *  broke the create-then-add flow (typing $1000 in Actual,
 *  then adding $1300 in transactions, looked like an override
 *  but wasn't).
 *
 *  The `deltaApplied` parameter is kept in the signature so
 *  the call sites in the 3 transaction CRUD endpoints don't
 *  need a rewrite — it's used only to skip the work when the
 *  write was a no-op (reorder etc.). The actual sync decision
 *  is now flag-driven, not delta-driven.
 *
 *  The slide-over's "Sync to transactions sum" button is how
 *  the user clears the override. */
export async function syncActualCostIfNoOverride(
  supabase: SupabaseClient,
  lineItemId: string,
  deltaApplied: number,
): Promise<void> {
  if (deltaApplied === 0) return;
  const { data: line } = await supabase
    .from('budget_line_items')
    .select('actual_cost, actual_cost_override')
    .eq('id', lineItemId)
    .maybeSingle<{ actual_cost: number | null; actual_cost_override: boolean }>();
  if (!line) return;

  const aggregates = await fetchTransactionAggregates(supabase, [lineItemId]);
  const newCount = aggregates.get(lineItemId)?.count ?? 0;

  /* §B0 spec: "cleared by deleting all transactions". The
     override concept doesn't apply with zero transactions —
     actual_cost is just whatever the user typed. Silently
     clear a stale override flag here so the marker doesn't
     keep rendering on a no-txn line. actual_cost itself is
     preserved (deleting all txns shouldn't zero the user's
     value). */
  if (newCount === 0) {
    if (line.actual_cost_override) {
      await supabase
        .from('budget_line_items')
        .update({ actual_cost_override: false })
        .eq('id', lineItemId);
    }
    return;
  }

  /* Explicit override — preserve actual_cost regardless of the
     transaction change. The slide-over's Sync button is how
     the user clears the override. */
  if (line.actual_cost_override) return;

  const newSum = aggregates.get(lineItemId)?.sum ?? 0;
  if (numericEqual(Number(line.actual_cost ?? 0), newSum)) return;
  await supabase
    .from('budget_line_items')
    .update({ actual_cost: newSum })
    .eq('id', lineItemId);
}

/** Aggregate of transactions for a single line item. */
export interface LineTransactionAggregate {
  line_item_id: string;
  sum: number;
  count: number;
}

/** Bulk-fetch transaction aggregates for a set of line items.
 *  One round-trip; returns a map keyed on line_item_id.
 *
 *  Used by §A2's budget page + getBudgetPanelData to attach
 *  `effective_actual_cost` + `transaction_count` to every
 *  rendered line without loading the full transaction rows.
 *  RLS scopes the query to the caller's workspace. */
export async function fetchTransactionAggregates(
  supabase: SupabaseClient,
  lineItemIds: string[],
): Promise<Map<string, LineTransactionAggregate>> {
  const map = new Map<string, LineTransactionAggregate>();
  if (lineItemIds.length === 0) return map;
  /* PostgREST has no GROUP BY in REST. Fetch the rows we need
     and aggregate client-side. The transactions table is
     narrow (12 cols) and bounded — typical line item has
     1-10 transactions, so this is small even for big budgets. */
  const { data } = await supabase
    .from('budget_line_item_transactions')
    .select('line_item_id, amount')
    .in('line_item_id', lineItemIds);
  for (const row of (data ?? []) as Array<{ line_item_id: string; amount: number }>) {
    const existing = map.get(row.line_item_id);
    if (existing) {
      existing.sum += Number(row.amount || 0);
      existing.count += 1;
    } else {
      map.set(row.line_item_id, {
        line_item_id: row.line_item_id,
        sum: Number(row.amount || 0),
        count: 1,
      });
    }
  }
  return map;
}

/** Decorate a line-items array with transaction_sum +
 *  transaction_count. §A3 renamed `effective_actual_cost` →
 *  `transaction_sum` because the "displayed value" lives on
 *  `actual_cost` post-auto-sync — `transaction_sum` is the
 *  separate piece the helper uses to detect overrides + drive
 *  the Sync button. Returns a new array; originals untouched. */
export async function enrichLinesWithTransactionAggregates<
  L extends { id: string },
>(supabase: SupabaseClient, lines: L[]): Promise<
  Array<L & { transaction_sum: number; transaction_count: number }>
> {
  const ids = lines.map((l) => l.id);
  const aggregates = await fetchTransactionAggregates(supabase, ids);
  return lines.map((line) => {
    const agg = aggregates.get(line.id);
    return {
      ...line,
      transaction_sum: agg?.sum ?? 0,
      transaction_count: agg?.count ?? 0,
    };
  });
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

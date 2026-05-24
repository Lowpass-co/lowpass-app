/* ============================================================
   MIGRATION 104 — budget_line_item_transactions
   (Budget Phase A §A1)

   Vendor-level breakdown rows for a budget line item. The
   line item's actual_cost column becomes an effective
   fallback — when transactions exist for a line item, the
   sum of transaction amounts is the canonical actual cost.

   Spec drift note: the §A1 handover referenced
   public.receipts(id) for the receipt_id FK. The codebase's
   table is public.expense_receipts (migration 017 + everywhere
   in src/app/api/budget/receipts/*). Adapted to
   expense_receipts(id) below — same intent, correct table.

   Idempotent. Safe to re-run.
   ============================================================ */

CREATE TABLE IF NOT EXISTS public.budget_line_item_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  line_item_id UUID NOT NULL REFERENCES public.budget_line_items(id) ON DELETE CASCADE,
  vendor_name TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT,                          -- NULL = inherit from line item
  paid_at DATE,
  receipt_id UUID REFERENCES public.expense_receipts(id) ON DELETE SET NULL,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_budget_line_item_transactions_line_item
  ON public.budget_line_item_transactions (line_item_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_budget_line_item_transactions_workspace
  ON public.budget_line_item_transactions (workspace_id);

ALTER TABLE public.budget_line_item_transactions ENABLE ROW LEVEL SECURITY;

/* Canonical 4-policy workspace RLS. DROP+CREATE so re-runs
   pick up any policy edits without erroring on the second
   apply. */
DROP POLICY IF EXISTS budget_line_item_transactions_select ON public.budget_line_item_transactions;
CREATE POLICY budget_line_item_transactions_select ON public.budget_line_item_transactions
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS budget_line_item_transactions_insert ON public.budget_line_item_transactions;
CREATE POLICY budget_line_item_transactions_insert ON public.budget_line_item_transactions
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS budget_line_item_transactions_update ON public.budget_line_item_transactions;
CREATE POLICY budget_line_item_transactions_update ON public.budget_line_item_transactions
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id())
    WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS budget_line_item_transactions_delete ON public.budget_line_item_transactions;
CREATE POLICY budget_line_item_transactions_delete ON public.budget_line_item_transactions
  FOR DELETE USING (
    workspace_id = public.get_my_workspace_id()
    AND public.is_workspace_admin()
  );

/* ============================================================
   BACKFILL — preserve existing actual_cost data

   For every line item with a positive actual_cost AND no
   existing transactions, insert one "(legacy entry)" row at
   sort_order=0. Adam re-labels the vendor manually as he
   revisits each line item in the slide-over.

   actual_cost is NUMERIC NOT NULL DEFAULT 0 (migration 017),
   so the IS NOT NULL clause is redundant but kept verbatim
   from the spec.
   ============================================================ */
INSERT INTO public.budget_line_item_transactions
  (workspace_id, line_item_id, vendor_name, amount, currency, sort_order)
SELECT
  li.workspace_id,
  li.id,
  '(legacy entry)',
  li.actual_cost,
  li.currency,
  0
FROM public.budget_line_items li
WHERE li.actual_cost IS NOT NULL
  AND li.actual_cost > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.budget_line_item_transactions t
    WHERE t.line_item_id = li.id
  );

/* ============================================================
   DOWN MIGRATION (manual)
   ----------------------------------------------------------
   DROP TABLE IF EXISTS public.budget_line_item_transactions CASCADE;
   -- actual_cost values on budget_line_items are preserved
   -- through the up-migration, so a rollback leaves the legacy
   -- data fully recoverable.
   ============================================================ */

/* ============================================================
   APPLY 104 in Supabase SQL Editor (Budget Phase A §A1)

   Creates budget_line_item_transactions + workspace RLS,
   then backfills one transaction per legacy actual_cost
   value so existing data carries forward.

   Spec drift: receipt_id FK targets expense_receipts (codebase
   table name), not the spec's "receipts".

   Idempotent. Safe to re-run.

   Verify backfill count after apply:
     SELECT count(*) FROM public.budget_line_item_transactions
       WHERE vendor_name = '(legacy entry)';
   ============================================================ */

CREATE TABLE IF NOT EXISTS public.budget_line_item_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  line_item_id UUID NOT NULL REFERENCES public.budget_line_items(id) ON DELETE CASCADE,
  vendor_name TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT,
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

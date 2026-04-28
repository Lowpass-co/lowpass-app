-- ============================================
-- LOWPASS — Canonical expenses (mobile receipts, UX19)
-- Paths: storage bucket `receipts` → {workspace_id}/{expense_id}/{filename}
-- `show_id` references routing (same convention as deal_memos).
-- ============================================

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  show_id uuid REFERENCES public.routing(id) ON DELETE SET NULL,

  amount numeric(12, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'GBP',

  category text NOT NULL,
  description text,

  spent_at timestamptz NOT NULL DEFAULT now(),
  city text,
  country text,

  receipt_url text,
  receipt_filename text,

  submitted_by uuid REFERENCES auth.users(id),
  submitted_at timestamptz NOT NULL DEFAULT now(),

  person_id uuid REFERENCES public.persons(id) ON DELETE SET NULL,

  status text NOT NULL DEFAULT 'submitted',

  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expenses_workspace_id_idx ON public.expenses(workspace_id);
CREATE INDEX IF NOT EXISTS expenses_tour_id_idx ON public.expenses(tour_id);
CREATE INDEX IF NOT EXISTS expenses_show_id_idx ON public.expenses(show_id);
CREATE INDEX IF NOT EXISTS expenses_person_id_idx ON public.expenses(person_id);
CREATE INDEX IF NOT EXISTS expenses_spent_at_idx ON public.expenses(spent_at);

ALTER TABLE public.budget_line_items
  ADD COLUMN IF NOT EXISTS expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS budget_line_items_expense_id_idx ON public.budget_line_items(expense_id);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS expenses_select ON public.expenses;
CREATE POLICY expenses_select ON public.expenses
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS expenses_insert ON public.expenses;
CREATE POLICY expenses_insert ON public.expenses
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS expenses_update ON public.expenses;
CREATE POLICY expenses_update ON public.expenses
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS expenses_delete ON public.expenses;
CREATE POLICY expenses_delete ON public.expenses
  FOR DELETE USING (
    workspace_id = public.get_my_workspace_id()
    AND public.is_workspace_admin()
  );

DROP TRIGGER IF EXISTS expenses_updated_at ON public.expenses;
CREATE TRIGGER expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- Storage: receipts bucket --------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "receipts_storage_select" ON storage.objects;
CREATE POLICY "receipts_storage_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'receipts'
    AND split_part(name, '/', 1) = public.get_my_workspace_id()::text
  );

DROP POLICY IF EXISTS "receipts_storage_insert" ON storage.objects;
CREATE POLICY "receipts_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'receipts'
    AND auth.uid() IS NOT NULL
    AND split_part(name, '/', 1) = public.get_my_workspace_id()::text
  );

DROP POLICY IF EXISTS "receipts_storage_update" ON storage.objects;
CREATE POLICY "receipts_storage_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'receipts'
    AND split_part(name, '/', 1) = public.get_my_workspace_id()::text
  );

DROP POLICY IF EXISTS "receipts_storage_delete" ON storage.objects;
CREATE POLICY "receipts_storage_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'receipts'
    AND split_part(name, '/', 1) = public.get_my_workspace_id()::text
  );

-- APPLY 106 in Supabase SQL Editor (Payroll Sprint §P1)
--
-- Three column additions + payroll-pdfs storage bucket +
-- workspace-scoped RLS by path prefix.
--
-- Markdown comment blocks were the cause of the §A1 paste
-- crash via the dashboard's trailing-quote bug — this file
-- uses only -- line comments. Idempotent; safe to re-run.

ALTER TABLE public.personnel_rates
  ADD COLUMN IF NOT EXISTS internal_rate NUMERIC(10, 2);

ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS brand_color TEXT DEFAULT '#FF4500';

ALTER TABLE public.routing
  ADD COLUMN IF NOT EXISTS acl_per_diem_amount NUMERIC(10, 2);

INSERT INTO storage.buckets (id, name, public)
VALUES ('payroll-pdfs', 'payroll-pdfs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS payroll_pdfs_select ON storage.objects;
CREATE POLICY payroll_pdfs_select ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'payroll-pdfs'
    AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text
  );

DROP POLICY IF EXISTS payroll_pdfs_insert ON storage.objects;
CREATE POLICY payroll_pdfs_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'payroll-pdfs'
    AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text
  );

DROP POLICY IF EXISTS payroll_pdfs_update ON storage.objects;
CREATE POLICY payroll_pdfs_update ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'payroll-pdfs'
    AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text
  );

DROP POLICY IF EXISTS payroll_pdfs_delete ON storage.objects;
CREATE POLICY payroll_pdfs_delete ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'payroll-pdfs'
    AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text
    AND public.is_workspace_admin()
  );

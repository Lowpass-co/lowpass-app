/* ============================================================
   MIGRATION 106 — payroll product (Payroll Sprint §P1)

   Schema additions for the payroll product build. Three small
   extensions to existing tables + one storage bucket. NO new
   payroll-domain tables: `payroll_entries` (migration 017)
   already encodes the (personnel_id, week_start) grain with
   day_statuses JSONB + advance_fee, which fully covers the
   advances + day-type spec'd in the §P1 brief.

   What this migration adds:
     1. personnel_rates.internal_rate
        Workspace-internal "Lowpass rate" (Adam's term). Used in
        combined all-staff PDFs (§P6) — substitutes show_rate
        when present so internal P&L picks up margin-aware
        numbers. Sensitive; UI gates visibility to workspace
        admins (server-side check on PATCH too).

     2. artists.brand_color
        Hex used for branded payroll PDF chrome (§P5/§P6). Per-
        artist brand. Defaults to Lowpass orange so unset
        artists still render branded.

     3. routing.acl_per_diem_amount
        Per-row override for the ACL Per Diem festival rule
        (per the Apps Script lines 530-555 — festival days get
        a flat per-diem in place of both rate AND base per-
        diem). Null = no override; non-null = the flat amount
        applied to every assigned person on that date. Admins
        toggle per festival date.

     4. storage.buckets row 'payroll-pdfs'
        Bucket for generated payroll PDFs. Path convention:
        `payroll-pdfs/{workspace_id}/{tour_id}/{week_start}/
        {filename}`. Workspace-scoped RLS by path prefix.

   Idempotent. Safe to re-run.
   ============================================================ */

ALTER TABLE public.personnel_rates
  ADD COLUMN IF NOT EXISTS internal_rate NUMERIC(10, 2);

COMMENT ON COLUMN public.personnel_rates.internal_rate IS
  'Workspace-internal rate (Adam''s "Lowpass rate"). Substitutes show_rate in combined all-staff PDFs for internal P&L. Sensitive — UI + API gate visibility to workspace admins.';

ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS brand_color TEXT DEFAULT '#FF4500';

COMMENT ON COLUMN public.artists.brand_color IS
  'Hex color used for branded outputs (payroll PDFs, future rider PDF chrome). Defaults to Lowpass orange so unset artists still render branded.';

ALTER TABLE public.routing
  ADD COLUMN IF NOT EXISTS acl_per_diem_amount NUMERIC(10, 2);

COMMENT ON COLUMN public.routing.acl_per_diem_amount IS
  'Festival per-diem override (Apps Script "ACL Per Diem" rule). Non-null = flat per-diem amount overriding both rate + base per_diem for every assigned person on this date. Null = use the normal rate + per_diem.';

/* Storage bucket. ON CONFLICT keeps re-runs idempotent. The
   public flag stays FALSE — PDFs are signed-URL-only. */
INSERT INTO storage.buckets (id, name, public)
VALUES ('payroll-pdfs', 'payroll-pdfs', false)
ON CONFLICT (id) DO NOTHING;

/* Workspace-scoped storage RLS via the standard path-prefix
   pattern. payroll-pdfs/{workspace_id}/... — the
   get_my_workspace_id() helper from migration 004 is the
   gate.

   DROP-then-CREATE keeps the policies re-runnable in case the
   pattern needs tweaking. */
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

/* ============================================================
   DOWN MIGRATION (manual)
   ----------------------------------------------------------
   ALTER TABLE public.personnel_rates DROP COLUMN IF EXISTS internal_rate;
   ALTER TABLE public.artists DROP COLUMN IF EXISTS brand_color;
   ALTER TABLE public.routing DROP COLUMN IF EXISTS acl_per_diem_amount;
   DROP POLICY IF EXISTS payroll_pdfs_select ON storage.objects;
   DROP POLICY IF EXISTS payroll_pdfs_insert ON storage.objects;
   DROP POLICY IF EXISTS payroll_pdfs_update ON storage.objects;
   DROP POLICY IF EXISTS payroll_pdfs_delete ON storage.objects;
   DELETE FROM storage.buckets WHERE id = 'payroll-pdfs';
   ============================================================ */

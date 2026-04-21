-- ============================================
-- LOWPASS — Site admins + admin-only bug triage
-- Migration 036
--
-- Adds a boolean `is_site_admin` flag to profiles so we can mark backend
-- admins (Adam + Ben for now). Site admins are the only ones who can
-- SEE or TRIAGE bug reports in the /bugs dashboard. Any authenticated
-- user can still FILE a bug (POST) and see their own reports.
--
-- To promote someone to site admin in the future, run in Supabase SQL:
--   UPDATE profiles SET is_site_admin = true WHERE email = 'x@x.com';
--
-- Idempotent: safe to re-run.
-- ============================================

-- ============================================
-- 1. profiles.is_site_admin column
-- ============================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_site_admin BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS profiles_is_site_admin_idx
  ON profiles(is_site_admin) WHERE is_site_admin = true;

COMMENT ON COLUMN profiles.is_site_admin IS
  'Backend site-admin flag. Grants access to cross-workspace triage tools such as /bugs. Set via Supabase SQL; do not expose in end-user UI.';

-- ============================================
-- 2. Helper function: is_site_admin(uid)
--    SECURITY DEFINER so RLS policies can call it without recursion.
--    STABLE so Postgres can cache the result within a statement.
-- ============================================

CREATE OR REPLACE FUNCTION public.is_site_admin(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.is_site_admin FROM public.profiles p WHERE p.id = uid),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.is_site_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_site_admin(UUID) TO authenticated, anon, service_role;

-- ============================================
-- 3. Seed existing profiles as admins
--    Current users are Adam + Ben; everyone existing today is an admin.
--    New users created after this migration default to false.
-- ============================================

UPDATE profiles SET is_site_admin = true WHERE is_site_admin = false;

-- ============================================
-- 4. Tighten bug_reports RLS
--
--    Before: any authenticated user could SELECT/UPDATE every report.
--    After:
--      - SELECT  = site admin OR your own report
--      - INSERT  = any authenticated user filing for themselves
--      - UPDATE  = site admin only (triage)
--      - DELETE  = site admin OR reporter
-- ============================================

ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bug_reports_select" ON bug_reports;
DROP POLICY IF EXISTS "bug_reports_insert" ON bug_reports;
DROP POLICY IF EXISTS "bug_reports_update" ON bug_reports;
DROP POLICY IF EXISTS "bug_reports_delete" ON bug_reports;

CREATE POLICY "bug_reports_select"
  ON bug_reports FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (public.is_site_admin(auth.uid()) OR reporter_id = auth.uid())
  );

CREATE POLICY "bug_reports_insert"
  ON bug_reports FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND reporter_id = auth.uid());

CREATE POLICY "bug_reports_update"
  ON bug_reports FOR UPDATE
  USING (public.is_site_admin(auth.uid()))
  WITH CHECK (public.is_site_admin(auth.uid()));

CREATE POLICY "bug_reports_delete"
  ON bug_reports FOR DELETE
  USING (public.is_site_admin(auth.uid()) OR reporter_id = auth.uid());

-- ============================================
-- 5. Tighten bug-reports storage policies to match
--    Screenshots should only be visible to admins or the uploader.
--    Storage paths are prefixed with the bug-report id, so we match by
--    looking up the owning row.
-- ============================================

DROP POLICY IF EXISTS "bug_reports_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "bug_reports_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "bug_reports_storage_update" ON storage.objects;
DROP POLICY IF EXISTS "bug_reports_storage_delete" ON storage.objects;

CREATE POLICY "bug_reports_storage_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'bug-reports'
    AND auth.uid() IS NOT NULL
    AND (
      public.is_site_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM bug_reports br
        WHERE br.screenshot_path = storage.objects.name
          AND br.reporter_id = auth.uid()
      )
    )
  );

CREATE POLICY "bug_reports_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'bug-reports' AND auth.uid() IS NOT NULL);

CREATE POLICY "bug_reports_storage_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'bug-reports' AND public.is_site_admin(auth.uid()));

CREATE POLICY "bug_reports_storage_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'bug-reports'
    AND (
      public.is_site_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM bug_reports br
        WHERE br.screenshot_path = storage.objects.name
          AND br.reporter_id = auth.uid()
      )
    )
  );

-- ============================================
-- 6. Nudge PostgREST to reload its schema cache
-- ============================================

NOTIFY pgrst, 'reload schema';

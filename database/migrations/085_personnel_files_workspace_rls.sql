-- ============================================
-- LOWPASS — Personnel files bucket: tighten RLS (Sprint 9 §9)
-- Migration 085
--
-- The personnel-files bucket from migration 027 was created with
-- public: true and per-policy gating only at "auth.uid() IS NOT
-- NULL" — any authenticated user could read/write/delete from
-- ANY workspace's path. Adam's Sprint 9 §9 requirement is that
-- documents must be VERY secure: workspace-scoped reads + writes,
-- admin-only delete.
--
-- This migration:
--   1. Flips the bucket to public: false.
--   2. Replaces the four open policies with workspace-scoped ones
--      keyed on the path prefix `{workspace_id}/{personnel_id}/...`.
--   3. Gates writes behind operations.personnel.write grant
--      (admins/managers always pass via can_access).
--   4. Restricts deletes to workspace admins.
--
-- Bucket name is unchanged — existing object paths and the
-- /api/personnel/[id]/documents route continue to work without
-- modification. Re-running is safe (DROP POLICY IF EXISTS).
-- ============================================

-- 1. Make the bucket non-public. App reads use signed URLs from
-- the route layer; direct unauth fetches no longer work.
UPDATE storage.buckets
SET public = false,
    file_size_limit = 10485760,  -- 10 MB cap
    allowed_mime_types = ARRAY[
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf'
    ]
WHERE id = 'personnel-files';

-- 2. Replace the four loose policies.
DROP POLICY IF EXISTS "personnel_files_select" ON storage.objects;
DROP POLICY IF EXISTS "personnel_files_insert" ON storage.objects;
DROP POLICY IF EXISTS "personnel_files_update" ON storage.objects;
DROP POLICY IF EXISTS "personnel_files_delete" ON storage.objects;

-- SELECT: any workspace member can read documents whose path
-- prefix matches a workspace they're in. storage.foldername(name)
-- returns the path components as an array; [1] is the first
-- folder = workspace_id (per the route's path convention
-- `{workspace_id}/{personnel_id}/{filename}`).
CREATE POLICY "personnel_files_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'personnel-files'
    AND (storage.foldername(name))[1] IN (
      SELECT m.workspace_id::text
      FROM public.workspace_members m
      WHERE m.user_id = auth.uid()
    )
  );

-- INSERT: must be writing into the caller's active workspace
-- AND have operations.personnel.write grant (admins/managers
-- always pass via can_access).
CREATE POLICY "personnel_files_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'personnel-files'
    AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text
    AND public.can_access('page', 'operations.personnel', 'write')
  );

-- UPDATE: same write gate as INSERT.
CREATE POLICY "personnel_files_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'personnel-files'
    AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text
    AND public.can_access('page', 'operations.personnel', 'write')
  ) WITH CHECK (
    bucket_id = 'personnel-files'
    AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text
    AND public.can_access('page', 'operations.personnel', 'write')
  );

-- DELETE: workspace admin only. Sensitive — can't be recovered
-- once deleted, so the gate is stricter than write.
CREATE POLICY "personnel_files_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'personnel-files'
    AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text
    AND public.is_workspace_admin()
  );

-- ============================================
-- DOWN (manual rollback — restore the loose policies)
-- ============================================
-- DROP POLICY IF EXISTS "personnel_files_select" ON storage.objects;
-- DROP POLICY IF EXISTS "personnel_files_insert" ON storage.objects;
-- DROP POLICY IF EXISTS "personnel_files_update" ON storage.objects;
-- DROP POLICY IF EXISTS "personnel_files_delete" ON storage.objects;
-- UPDATE storage.buckets SET public = true WHERE id = 'personnel-files';
-- CREATE POLICY "personnel_files_select" ON storage.objects FOR SELECT
--   USING (bucket_id = 'personnel-files');
-- CREATE POLICY "personnel_files_insert" ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'personnel-files' AND (auth.uid() IS NOT NULL));
-- ... (repeat for UPDATE / DELETE)

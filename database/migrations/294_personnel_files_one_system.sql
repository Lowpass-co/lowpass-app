-- 294_personnel_files_one_system.sql
--
-- ONE PERMISSION SYSTEM (Nov 2026, Adam).
--
-- The old page grants (`can_access('page', …)` + member tags) are retired: the
-- app now asks only tour access (292/293) and the member's role. 293 rewrote
-- every tour table's rules, but two storage rules from 085 still asked the old
-- grant — uploading / replacing a crew document (bucket `personnel-files`).
--
-- They now ask the same thing the route asks (`requireWrite` with no area):
-- admin or manager of the workspace the path belongs to. People records are
-- workspace-wide, not per tour, so tour access has nothing to say here.
--
-- SELECT (any member of the path's workspace) and DELETE (workspace admin)
-- are unchanged.
--
-- Needs 292 (private.is_manager). Re-runnable: DROP IF EXISTS + CREATE.

DROP POLICY IF EXISTS "personnel_files_insert" ON storage.objects;
CREATE POLICY "personnel_files_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'personnel-files'
    AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text
    AND private.is_manager()
  );

DROP POLICY IF EXISTS "personnel_files_update" ON storage.objects;
CREATE POLICY "personnel_files_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'personnel-files'
    AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text
    AND private.is_manager()
  ) WITH CHECK (
    bucket_id = 'personnel-files'
    AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text
    AND private.is_manager()
  );

-- Check: no storage rule should still mention can_access. Expect 0 rows.
SELECT policyname
  FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects'
   AND (coalesce(qual, '') || coalesce(with_check, '')) ILIKE '%can_access%';

-- ============================================
-- DOWN (manual rollback — back to 085's grant check)
-- ============================================
-- DROP POLICY IF EXISTS "personnel_files_insert" ON storage.objects;
-- CREATE POLICY "personnel_files_insert" ON storage.objects
--   FOR INSERT WITH CHECK (
--     bucket_id = 'personnel-files'
--     AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text
--     AND public.can_access('page', 'operations.personnel', 'write')
--   );
-- DROP POLICY IF EXISTS "personnel_files_update" ON storage.objects;
-- CREATE POLICY "personnel_files_update" ON storage.objects
--   FOR UPDATE USING (
--     bucket_id = 'personnel-files'
--     AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text
--     AND public.can_access('page', 'operations.personnel', 'write')
--   ) WITH CHECK (
--     bucket_id = 'personnel-files'
--     AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text
--     AND public.can_access('page', 'operations.personnel', 'write')
--   );

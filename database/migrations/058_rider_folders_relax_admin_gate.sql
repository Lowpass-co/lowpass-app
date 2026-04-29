-- ============================================
-- LOWPASS — Relax rider_folders RLS: drop admin gate on artist-scope
-- Migration 058
--
-- The original 039_rider_folders.sql gated artist-scope writes behind
-- public.is_workspace_admin(), which checks profiles.role_id → roles.is_god.
-- In practice profiles.role_id is NULL for most users, so even the
-- workspace owner can't create artist-scope rider folders ('new row
-- violates row-level security policy for table rider_folders').
--
-- Workspace membership is a sufficient gate; tighten later if abuse
-- cases emerge. DELETE keeps its admin gate — destructive ops should
-- still be protected, and an admin can manually delete on a user's
-- behalf if the role linkage isn't wired.
-- ============================================

DROP POLICY IF EXISTS "rider_folders_insert" ON public.rider_folders;
CREATE POLICY "rider_folders_insert"
  ON public.rider_folders FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS "rider_folders_update" ON public.rider_folders;
CREATE POLICY "rider_folders_update"
  ON public.rider_folders FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());

-- DELETE policy keeps the admin gate from 039 — destructive ops should
-- still be protected. (No change applied here.)

-- ============================================
-- Down migration (commented out; use as reference if rolling back to 039)
-- ============================================
-- DROP POLICY IF EXISTS "rider_folders_insert" ON public.rider_folders;
-- CREATE POLICY "rider_folders_insert"
--   ON public.rider_folders FOR INSERT
--   WITH CHECK (
--     workspace_id = public.get_my_workspace_id() AND
--     (scope <> 'artist' OR public.is_workspace_admin())
--   );
--
-- DROP POLICY IF EXISTS "rider_folders_update" ON public.rider_folders;
-- CREATE POLICY "rider_folders_update"
--   ON public.rider_folders FOR UPDATE
--   USING (workspace_id = public.get_my_workspace_id())
--   WITH CHECK (
--     workspace_id = public.get_my_workspace_id() AND
--     (scope <> 'artist' OR public.is_workspace_admin())
--   );

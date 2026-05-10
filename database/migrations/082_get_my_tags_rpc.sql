-- ============================================
-- LOWPASS — get_my_tags_in_active_workspace RPC (Sprint 9 §5)
-- Migration 082
--
-- workspace_member_tags has admin-only RLS (per 078), so a
-- non-admin caller can't SELECT their own tags directly. The
-- TS-side server helpers in src/lib/permissions/server.ts need
-- the caller's tag list to evaluate tag-mediated permission
-- grants at the page-level gate without an RPC roundtrip per
-- check.
--
-- This SECURITY DEFINER RPC bypasses RLS and returns the
-- caller's tag_name array for their active workspace
-- (profiles.workspace_id). NULL caller / no membership / no
-- tags all return an empty array — fail closed for the gate.
-- ============================================

CREATE OR REPLACE FUNCTION public.get_my_tags_in_active_workspace()
RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT array_agg(t.tag_name ORDER BY t.tag_name)
      FROM public.profiles p
      JOIN public.workspace_members m
        ON m.user_id = p.id AND m.workspace_id = p.workspace_id
      JOIN public.workspace_member_tags t
        ON t.member_id = m.id
      WHERE p.id = auth.uid()
    ),
    ARRAY[]::TEXT[]
  )
$$;

REVOKE ALL ON FUNCTION public.get_my_tags_in_active_workspace() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_tags_in_active_workspace() TO authenticated;

COMMENT ON FUNCTION public.get_my_tags_in_active_workspace() IS
  'Sprint 9 §5 — returns the caller''s workspace_member_tags for the active workspace. Bypasses workspace_member_tags admin-only RLS via SECURITY DEFINER. Empty array for non-members.';

-- ============================================
-- DOWN (manual rollback)
-- ============================================
-- DROP FUNCTION IF EXISTS public.get_my_tags_in_active_workspace();

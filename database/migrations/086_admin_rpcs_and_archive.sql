-- ============================================
-- LOWPASS — Site admin area RPCs + workspace archive (Sprint 9 §10)
-- Migration 086
--
-- Two concerns combined in one migration because they share an
-- RLS surface (the workspaces table):
--   1. SECURITY DEFINER RPCs the /admin tabs call to read
--      cross-workspace data: list_all_users, list_user_memberships,
--      list_all_workspaces. Each gates on profiles.is_site_admin.
--   2. workspaces.archived_at TIMESTAMPTZ for soft-delete.
--      get_my_workspace_id() rewritten to fail closed when the
--      caller's active workspace is archived. workspaces SELECT
--      RLS updated to hide archived rows from non-site-admins.
--
-- The auto-switch-active-workspace-on-archive flow lives in
-- /api/admin/workspaces/[id] DELETE — server-side, not a DB
-- trigger — so the API can surface diagnostic info to the UI.
--
-- Idempotent: every CREATE / ALTER uses IF NOT EXISTS or CREATE
-- OR REPLACE. Re-applies cleanly.
-- ============================================

-- ============================================
-- 1. workspaces.archived_at
-- ============================================
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS workspaces_archived_idx
  ON public.workspaces (archived_at) WHERE archived_at IS NOT NULL;

COMMENT ON COLUMN public.workspaces.archived_at IS
  'Sprint 9 §10 — soft-delete timestamp. Non-null = archived. Hidden from non-site-admin RLS; get_my_workspace_id() returns NULL when the caller''s active workspace is archived.';

-- ============================================
-- 2. get_my_workspace_id() — fail-closed on archive
-- ============================================
-- Rewritten body adds: workspaces row must have archived_at IS
-- NULL. If the user's active workspace gets archived, every
-- query returning rows scoped via get_my_workspace_id() will
-- come back empty until they switch via the WorkspaceSwitcher.
CREATE OR REPLACE FUNCTION public.get_my_workspace_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.workspace_id
  FROM public.profiles p
  JOIN public.workspaces w ON w.id = p.workspace_id
  WHERE p.id = auth.uid()
    AND w.archived_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.workspace_members m
      WHERE m.user_id = p.id
        AND m.workspace_id = p.workspace_id
    )
$$;

COMMENT ON FUNCTION public.get_my_workspace_id() IS
  'Sprint 9 §10 — returns the caller''s active workspace_id only if (a) a workspace_members row exists AND (b) the workspace isn''t archived. Fails closed in both drift cases.';

-- ============================================
-- 3. workspaces SELECT RLS — hide archived from non-site-admins
-- ============================================
DROP POLICY IF EXISTS "Users can view own workspace" ON public.workspaces;
CREATE POLICY "Users can view own workspace"
  ON public.workspaces FOR SELECT
  USING (
    -- Site admins see everything (used by /admin/workspaces).
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_site_admin = TRUE
    )
    OR (
      -- Non-site-admins: only the workspaces they're a member of
      -- AND not archived.
      archived_at IS NULL
      AND EXISTS (
        SELECT 1 FROM public.workspace_members m
        WHERE m.user_id = auth.uid()
          AND m.workspace_id = workspaces.id
      )
    )
  );

-- ============================================
-- 4. list_all_users RPC
-- ============================================
CREATE OR REPLACE FUNCTION public.list_all_users(
  p_query TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'all',  -- 'all' | 'active' | 'suspended'
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  name TEXT,
  is_site_admin BOOLEAN,
  is_suspended BOOLEAN,
  created_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  workspace_count INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_search TEXT;
  v_limit INT := LEAST(GREATEST(p_limit, 1), 200);
  v_offset INT := GREATEST(p_offset, 0);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_site_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Forbidden — site admin only' USING ERRCODE = 'P0003';
  END IF;

  v_search := CASE
    WHEN p_query IS NULL OR length(trim(p_query)) = 0 THEN NULL
    ELSE '%' || lower(trim(p_query)) || '%'
  END;

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    p.name AS name,
    COALESCE(p.is_site_admin, FALSE) AS is_site_admin,
    -- banned_until > now() (or sentinel '9999-12-31') = suspended.
    (u.banned_until IS NOT NULL AND u.banned_until > now()) AS is_suspended,
    u.created_at,
    u.last_sign_in_at,
    COALESCE(
      (SELECT COUNT(*)::int FROM public.workspace_members m
       WHERE m.user_id = u.id),
      0
    ) AS workspace_count
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE
    (
      v_search IS NULL
      OR lower(u.email) LIKE v_search
      OR lower(COALESCE(p.name, '')) LIKE v_search
    )
    AND (
      p_status = 'all'
      OR (p_status = 'active' AND (u.banned_until IS NULL OR u.banned_until <= now()))
      OR (p_status = 'suspended' AND u.banned_until IS NOT NULL AND u.banned_until > now())
    )
  ORDER BY p.name NULLS LAST, u.email
  LIMIT v_limit OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.list_all_users(TEXT, TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_all_users(TEXT, TEXT, INT, INT) TO authenticated;

COMMENT ON FUNCTION public.list_all_users(TEXT, TEXT, INT, INT) IS
  'Sprint 9 §10 — cross-workspace user list for /admin/users. Site-admin only; raises P0003 otherwise.';

-- ============================================
-- 5. list_user_memberships RPC
-- ============================================
CREATE OR REPLACE FUNCTION public.list_user_memberships(p_user_id UUID)
RETURNS TABLE (
  membership_id UUID,
  workspace_id UUID,
  workspace_name TEXT,
  role TEXT,
  is_workspace_owner BOOLEAN,
  joined_at TIMESTAMPTZ,
  tags TEXT[],
  workspace_archived BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_site_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Forbidden — site admin only' USING ERRCODE = 'P0003';
  END IF;

  RETURN QUERY
  SELECT
    m.id AS membership_id,
    m.workspace_id,
    w.name AS workspace_name,
    m.role,
    m.is_workspace_owner,
    m.created_at AS joined_at,
    COALESCE(
      (SELECT array_agg(t.tag_name ORDER BY t.tag_name)
       FROM public.workspace_member_tags t
       WHERE t.member_id = m.id),
      ARRAY[]::TEXT[]
    ) AS tags,
    (w.archived_at IS NOT NULL) AS workspace_archived
  FROM public.workspace_members m
  JOIN public.workspaces w ON w.id = m.workspace_id
  WHERE m.user_id = p_user_id
  ORDER BY w.name;
END;
$$;

REVOKE ALL ON FUNCTION public.list_user_memberships(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_user_memberships(UUID) TO authenticated;

COMMENT ON FUNCTION public.list_user_memberships(UUID) IS
  'Sprint 9 §10 — every workspace_members row for a given user, with workspace name + tags + archived flag. Site-admin only.';

-- ============================================
-- 6. list_all_workspaces RPC
-- ============================================
CREATE OR REPLACE FUNCTION public.list_all_workspaces(
  p_query TEXT DEFAULT NULL,
  p_include_archived BOOLEAN DEFAULT FALSE,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  owner_id UUID,
  owner_name TEXT,
  created_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  member_count INT,
  tour_count INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search TEXT;
  v_limit INT := LEAST(GREATEST(p_limit, 1), 200);
  v_offset INT := GREATEST(p_offset, 0);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_site_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Forbidden — site admin only' USING ERRCODE = 'P0003';
  END IF;

  v_search := CASE
    WHEN p_query IS NULL OR length(trim(p_query)) = 0 THEN NULL
    ELSE '%' || lower(trim(p_query)) || '%'
  END;

  RETURN QUERY
  SELECT
    w.id,
    w.name,
    w.owner_id,
    p.name AS owner_name,
    w.created_at,
    w.archived_at,
    COALESCE(
      (SELECT COUNT(*)::int FROM public.workspace_members m WHERE m.workspace_id = w.id),
      0
    ) AS member_count,
    COALESCE(
      (SELECT COUNT(*)::int FROM public.tours t WHERE t.workspace_id = w.id),
      0
    ) AS tour_count
  FROM public.workspaces w
  LEFT JOIN public.profiles p ON p.id = w.owner_id
  WHERE (p_include_archived = TRUE OR w.archived_at IS NULL)
    AND (v_search IS NULL OR lower(w.name) LIKE v_search)
  ORDER BY w.name
  LIMIT v_limit OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.list_all_workspaces(TEXT, BOOLEAN, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_all_workspaces(TEXT, BOOLEAN, INT, INT) TO authenticated;

COMMENT ON FUNCTION public.list_all_workspaces(TEXT, BOOLEAN, INT, INT) IS
  'Sprint 9 §10 — cross-workspace listing for /admin/workspaces. Site-admin only.';

-- ============================================
-- DOWN (manual rollback)
-- ============================================
-- DROP FUNCTION IF EXISTS public.list_all_workspaces(TEXT, BOOLEAN, INT, INT);
-- DROP FUNCTION IF EXISTS public.list_user_memberships(UUID);
-- DROP FUNCTION IF EXISTS public.list_all_users(TEXT, TEXT, INT, INT);
-- DROP POLICY IF EXISTS "Users can view own workspace" ON public.workspaces;
-- CREATE POLICY "Users can view own workspace" ON public.workspaces
--   FOR SELECT USING (id = public.get_my_workspace_id());
-- (Restore the 079 get_my_workspace_id body that omits archived_at)
-- DROP INDEX IF EXISTS public.workspaces_archived_idx;
-- ALTER TABLE public.workspaces DROP COLUMN IF EXISTS archived_at;

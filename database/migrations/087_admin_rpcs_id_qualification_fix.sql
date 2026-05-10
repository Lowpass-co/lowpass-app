-- ============================================
-- LOWPASS — Admin RPC id-qualification fix (Sprint 9 §13.A.1)
-- Migration 087
--
-- Migration 086 created three SECURITY DEFINER admin RPCs whose
-- bodies reference an unqualified `id` column inside the
-- IF NOT EXISTS gate. Postgres cannot disambiguate between the
-- function's `id` OUT parameter (from RETURNS TABLE) and
-- profiles.id, so the RPCs error at runtime with:
--
--   "column reference \"id\" is ambiguous"
--
-- Symptom: /admin/users + /admin/workspaces both fail to load.
--
-- Fix: qualify every reference to profiles.id and
-- profiles.is_site_admin inside the gate. Function signatures
-- (RETURNS TABLE columns, parameters) are unchanged so
-- CREATE OR REPLACE works without DROP.
-- ============================================

CREATE OR REPLACE FUNCTION public.list_all_users(
  p_query TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'all',
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
  -- Sprint 9 §13.A.1 — qualified column references avoid the
  -- ambiguity with the function's `id` OUT parameter.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS pr
    WHERE pr.id = auth.uid() AND pr.is_site_admin = TRUE
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
    SELECT 1 FROM public.profiles AS pr
    WHERE pr.id = auth.uid() AND pr.is_site_admin = TRUE
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
    SELECT 1 FROM public.profiles AS pr
    WHERE pr.id = auth.uid() AND pr.is_site_admin = TRUE
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

-- ============================================
-- DOWN (manual rollback) — restore the buggy 086 versions
-- ============================================
-- Re-run the body from migration 086 to restore. Not recommended
-- — they error at runtime.

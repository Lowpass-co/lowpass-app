-- ============================================
-- LOWPASS — Workspace members RPCs (Sprint 9 §3)
-- Migration 080
--
-- Three SECURITY DEFINER RPCs that the Phase 3 members-management
-- UI calls. RLS on workspace_members is self-only per 078 (the
-- naive cross-member SELECT would recurse infinitely under RLS),
-- so any cross-member read goes through these functions which
-- bypass RLS and apply admin gating in the function body.
--
--   1. list_workspace_members(p_workspace_id)
--      Returns members + tags + grants + auth metadata for an
--      admin of the requested workspace. Empty for non-admins.
--
--   2. update_workspace_member(p_member_id, p_new_role, p_new_tags, p_new_grants)
--      Atomically updates role + replaces tags + replaces user-
--      direct grants for a member. Admin-only. Tag-mediated
--      grants are NOT touched (those are managed at the tag
--      level, not the member level).
--
--   3. accept_workspace_invite(p_token)
--      Validates an invite token, creates the workspace_members
--      row + tags + grants from the invite, marks invite
--      accepted, and conditionally sets profiles.workspace_id
--      (only if first workspace per Adam's refinement B).
--
-- All three have SET search_path = public, auth to prevent
-- search-path injection in the SECURITY DEFINER context.
-- ============================================

-- ============================================
-- 1. list_workspace_members
-- ============================================
CREATE OR REPLACE FUNCTION public.list_workspace_members(
  p_workspace_id UUID
)
RETURNS TABLE (
  member_id UUID,
  user_id UUID,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  role TEXT,
  is_workspace_owner BOOLEAN,
  joined_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  tags TEXT[],
  grants JSONB
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Admin gate: caller must be admin of the requested workspace.
  -- Non-admins get empty result set, never an error — matches
  -- RLS semantics elsewhere (data simply invisible).
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = p_workspace_id
      AND m.user_id = auth.uid()
      AND m.role = 'admin'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    m.id AS member_id,
    m.user_id,
    u.email::text AS email,
    p.name AS display_name,
    p.avatar_url,
    m.role,
    m.is_workspace_owner,
    m.created_at AS joined_at,
    u.last_sign_in_at,
    COALESCE(
      (SELECT array_agg(t.tag_name ORDER BY t.tag_name)
       FROM public.workspace_member_tags t
       WHERE t.member_id = m.id),
      ARRAY[]::TEXT[]
    ) AS tags,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
         'resource_type', g.resource_type,
         'resource_id', g.resource_id,
         'permission', g.permission
       ) ORDER BY g.resource_id, g.permission)
       FROM public.permission_grants g
       WHERE g.workspace_id = p_workspace_id
         AND g.subject_type = 'user'
         AND g.subject_id = m.user_id::text),
      '[]'::JSONB
    ) AS grants
  FROM public.workspace_members m
  LEFT JOIN public.profiles p ON p.id = m.user_id
  LEFT JOIN auth.users u ON u.id = m.user_id
  WHERE m.workspace_id = p_workspace_id
  ORDER BY
    m.is_workspace_owner DESC,
    CASE m.role WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 WHEN 'readonly' THEN 3 ELSE 4 END,
    p.name NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.list_workspace_members(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_workspace_members(UUID) TO authenticated;

COMMENT ON FUNCTION public.list_workspace_members(UUID) IS
  'Sprint 9 §3 — returns members + tags + grants + auth metadata for the requested workspace. Admin-gated; non-admins get empty result.';

-- ============================================
-- 2. update_workspace_member
-- ============================================
-- Atomic role + tags + user-direct grants update for one member.
-- Admin-only. Tags and grants are passed as full replacement sets
-- (the diff vs current state is computed inside the function).
CREATE OR REPLACE FUNCTION public.update_workspace_member(
  p_member_id UUID,
  p_new_role TEXT,
  p_new_tags TEXT[],
  p_new_grants JSONB
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_workspace_id UUID;
  v_target_user_id UUID;
  v_caller_id UUID;
  v_old_role TEXT;
  v_old_tags TEXT[];
  v_grant JSONB;
  v_tag TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = 'P0001';
  END IF;

  -- Resolve target member's workspace + user.
  SELECT m.workspace_id, m.user_id, m.role
    INTO v_workspace_id, v_target_user_id, v_old_role
  FROM public.workspace_members m
  WHERE m.id = p_member_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Member not found' USING ERRCODE = 'P0002';
  END IF;

  -- Admin gate: caller must be admin of the same workspace.
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = v_workspace_id
      AND m.user_id = v_caller_id
      AND m.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden — admin only' USING ERRCODE = 'P0003';
  END IF;

  -- Validate new role
  IF p_new_role NOT IN ('admin', 'manager', 'readonly') THEN
    RAISE EXCEPTION 'Invalid role: %', p_new_role USING ERRCODE = 'P0004';
  END IF;

  -- Snapshot existing tags for audit
  SELECT COALESCE(array_agg(tag_name ORDER BY tag_name), ARRAY[]::TEXT[])
    INTO v_old_tags
  FROM public.workspace_member_tags
  WHERE member_id = p_member_id;

  -- 1. Update role
  UPDATE public.workspace_members
  SET role = p_new_role
  WHERE id = p_member_id;

  -- 2. Replace tags. Delete then insert — workspace_member_tags
  -- has UNIQUE(member_id, tag_name) so this is safe.
  DELETE FROM public.workspace_member_tags WHERE member_id = p_member_id;
  IF p_new_tags IS NOT NULL AND array_length(p_new_tags, 1) > 0 THEN
    FOREACH v_tag IN ARRAY p_new_tags LOOP
      INSERT INTO public.workspace_member_tags (workspace_id, member_id, tag_name)
      VALUES (v_workspace_id, p_member_id, v_tag);
    END LOOP;
  END IF;

  -- 3. Replace user-direct grants for this user. Tag-mediated
  -- grants (subject_type = 'tag') are NOT touched — those live
  -- at workspace level, not per-member.
  DELETE FROM public.permission_grants
  WHERE workspace_id = v_workspace_id
    AND subject_type = 'user'
    AND subject_id = v_target_user_id::text;

  IF p_new_grants IS NOT NULL AND jsonb_typeof(p_new_grants) = 'array' THEN
    FOR v_grant IN SELECT * FROM jsonb_array_elements(p_new_grants) LOOP
      INSERT INTO public.permission_grants (
        workspace_id, subject_type, subject_id,
        resource_type, resource_id, permission
      ) VALUES (
        v_workspace_id, 'user', v_target_user_id::text,
        v_grant->>'resource_type', v_grant->>'resource_id', v_grant->>'permission'
      );
    END LOOP;
  END IF;

  -- 4. Auto-seed 'crew' tag-mediated grant on first add.
  -- Per Adam's refinement: fire ONLY when 'crew' is being added
  -- to the tag set (wasn't in old, is in new). An admin who
  -- manually deletes this grant later won't see it silently
  -- re-seeded on the next role/tag update.
  IF ('crew' = ANY(p_new_tags)) AND NOT ('crew' = ANY(v_old_tags)) THEN
    INSERT INTO public.permission_grants (
      workspace_id, subject_type, subject_id,
      resource_type, resource_id, permission
    ) VALUES (
      v_workspace_id, 'tag', 'crew',
      'page', 'operations.personnel.my_schedule', 'read'
    )
    ON CONFLICT (workspace_id, subject_type, subject_id, resource_type, resource_id, permission)
    DO NOTHING;
  END IF;

  -- 5. Audit log
  INSERT INTO public.audit_log (
    workspace_id, actor_user_id, action, entity_type, entity_id, field_changes
  ) VALUES (
    v_workspace_id,
    v_caller_id,
    'updated',
    'workspace_member',
    p_member_id,
    jsonb_build_object(
      'role', jsonb_build_object('old', v_old_role, 'new', p_new_role),
      'tags', jsonb_build_object('old', to_jsonb(v_old_tags), 'new', to_jsonb(p_new_tags)),
      'grants_replaced', true
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_workspace_member(UUID, TEXT, TEXT[], JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_workspace_member(UUID, TEXT, TEXT[], JSONB) TO authenticated;

COMMENT ON FUNCTION public.update_workspace_member(UUID, TEXT, TEXT[], JSONB) IS
  'Sprint 9 §3 — atomic role + tags + user-direct grants update for one member. Admin-only.';

-- ============================================
-- 3. accept_workspace_invite
-- ============================================
CREATE OR REPLACE FUNCTION public.accept_workspace_invite(p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_invite RECORD;
  v_caller_email TEXT;
  v_caller_id UUID;
  v_existing_member_count INT;
  v_new_member_id UUID;
  v_tag TEXT;
  v_grant JSONB;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = 'P0001';
  END IF;

  SELECT email::text INTO v_caller_email FROM auth.users WHERE id = v_caller_id;

  -- Lock invite row to prevent double-accept races.
  SELECT * INTO v_invite
  FROM public.workspace_invites
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_invite.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invite already accepted' USING ERRCODE = 'P0003';
  END IF;

  IF v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'Invite expired' USING ERRCODE = 'P0004';
  END IF;

  IF lower(v_caller_email) <> v_invite.invited_email THEN
    RAISE EXCEPTION 'Invite email does not match caller' USING ERRCODE = 'P0005';
  END IF;

  -- Idempotent: caller already a member of this workspace? Just
  -- mark invite accepted and return.
  IF EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_caller_id
      AND workspace_id = v_invite.workspace_id
  ) THEN
    UPDATE public.workspace_invites
    SET accepted_at = now(), accepted_user_id = v_caller_id
    WHERE id = v_invite.id;
    RETURN v_invite.workspace_id;
  END IF;

  -- Create workspace_members row
  INSERT INTO public.workspace_members (user_id, workspace_id, role, is_workspace_owner)
  VALUES (v_caller_id, v_invite.workspace_id, v_invite.invited_role, false)
  RETURNING id INTO v_new_member_id;

  -- Tags
  IF v_invite.initial_tags IS NOT NULL AND array_length(v_invite.initial_tags, 1) > 0 THEN
    FOREACH v_tag IN ARRAY v_invite.initial_tags LOOP
      INSERT INTO public.workspace_member_tags (workspace_id, member_id, tag_name)
      VALUES (v_invite.workspace_id, v_new_member_id, v_tag)
      ON CONFLICT (member_id, tag_name) DO NOTHING;
    END LOOP;

    -- Auto-seed 'crew' tag-mediated grant. For invite acceptance
    -- the "old tags" set is empty (new member), so any 'crew' in
    -- initial_tags triggers the seed. ON CONFLICT keeps idempotency
    -- with the equivalent path in update_workspace_member.
    IF 'crew' = ANY(v_invite.initial_tags) THEN
      INSERT INTO public.permission_grants (
        workspace_id, subject_type, subject_id,
        resource_type, resource_id, permission
      ) VALUES (
        v_invite.workspace_id, 'tag', 'crew',
        'page', 'operations.personnel.my_schedule', 'read'
      )
      ON CONFLICT (workspace_id, subject_type, subject_id, resource_type, resource_id, permission)
      DO NOTHING;
    END IF;
  END IF;

  -- Grants — initial_grants is JSONB array of {resource_type, resource_id, permission}
  IF v_invite.initial_grants IS NOT NULL AND jsonb_typeof(v_invite.initial_grants) = 'array' THEN
    FOR v_grant IN SELECT * FROM jsonb_array_elements(v_invite.initial_grants) LOOP
      INSERT INTO public.permission_grants (
        workspace_id, subject_type, subject_id,
        resource_type, resource_id, permission
      ) VALUES (
        v_invite.workspace_id, 'user', v_caller_id::text,
        v_grant->>'resource_type', v_grant->>'resource_id', v_grant->>'permission'
      )
      ON CONFLICT (workspace_id, subject_type, subject_id, resource_type, resource_id, permission)
      DO NOTHING;
    END LOOP;
  END IF;

  -- Adam's refinement B: only auto-set profiles.workspace_id if
  -- this is the user's first workspace. The COUNT includes the
  -- row we just inserted, so 1 = first.
  SELECT COUNT(*) INTO v_existing_member_count
  FROM public.workspace_members
  WHERE user_id = v_caller_id;

  IF v_existing_member_count = 1 THEN
    UPDATE public.profiles
    SET workspace_id = v_invite.workspace_id
    WHERE id = v_caller_id;
  END IF;

  -- Mark invite accepted
  UPDATE public.workspace_invites
  SET accepted_at = now(), accepted_user_id = v_caller_id
  WHERE id = v_invite.id;

  -- Audit
  INSERT INTO public.audit_log (
    workspace_id, actor_user_id, action, entity_type, entity_id, field_changes
  ) VALUES (
    v_invite.workspace_id,
    v_caller_id,
    'created',
    'workspace_member',
    v_new_member_id,
    jsonb_build_object(
      'invite_id', v_invite.id,
      'invited_email', v_invite.invited_email,
      'invited_role', v_invite.invited_role,
      'auto_switched_active', (v_existing_member_count = 1)
    )
  );

  RETURN v_invite.workspace_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_workspace_invite(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_workspace_invite(TEXT) TO authenticated;

COMMENT ON FUNCTION public.accept_workspace_invite(TEXT) IS
  'Sprint 9 §3 — validates an invite token, creates workspace_members + tags + grants, marks invite accepted. Auto-sets profiles.workspace_id only if first workspace.';

-- ============================================
-- DOWN (manual rollback)
-- ============================================
-- DROP FUNCTION IF EXISTS public.accept_workspace_invite(TEXT);
-- DROP FUNCTION IF EXISTS public.update_workspace_member(UUID, TEXT, TEXT[], JSONB);
-- DROP FUNCTION IF EXISTS public.list_workspace_members(UUID);

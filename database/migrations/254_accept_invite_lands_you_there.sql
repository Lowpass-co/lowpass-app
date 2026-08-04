-- 254_accept_invite_lands_you_there.sql
--
-- An invited member accepts an invite and lands in their OWN empty workspace.
--
-- accept_workspace_invite (migration 080) set profiles.workspace_id only when
-- the accepted workspace was the user's FIRST membership. That condition CAN
-- NEVER HOLD for someone who signed up to accept an invite: handle_new_user()
-- (migration 002) fires on every auth.users insert and auto-provisions a
-- workspace, a god role and a membership. So by acceptance the user already has
-- one membership, the count is 2, the update is skipped, and they stay pointed
-- at their own empty workspace — no artists, no venues, no tours. The app is
-- not broken but is indistinguishable from broken, and nobody files that bug.
--
-- This is also what made P0-01 read as a guard failure. The test account was
-- acting as ADMIN of its own auto-provisioned workspace rather than as readonly
-- of the inviting one, so "a readonly member created an artist" was an admin
-- creating one in an empty workspace of their own. The guard was never wrong.
--
-- THE RULE, reversing "refinement B": accepting an invite is an explicit act —
-- you followed a link to join that workspace, so that is where you land. A user
-- who already belongs to other workspaces still lands in the new one, because
-- it is the one they just chose; the switcher moves them back.
--
-- profiles.workspace_id is the SINGLE source of truth for the active workspace.
-- workspace_members has no is_active column — /api/workspaces derives is_active
-- as (row.workspace_id = profile.workspace_id) — so setting this scalar is the
-- entire switch, and there is no second mechanism to keep in sync.
--
-- The accept ROUTE also forces this in app code, because migrations are hand-
-- applied and the fix must not wait on a paste. Both are wanted: the route
-- covers its one caller, this covers the function for any other.
--
-- WRITE: unchanged. Still SECURITY DEFINER, still validated against the token,
-- its expiry, and the invited email address. The only behavioural change is
-- which workspace the accepting user lands in.
--
-- The body below is migration 080's definition verbatim except for the marked
-- block — reproduced in full rather than patched, because CREATE OR REPLACE
-- takes a whole function and a hand-trimmed copy is how two definitions drift.
--
-- IDEMPOTENT: one CREATE OR REPLACE; re-running is a no-op.

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
  -- 254: LAND THEM IN THE WORKSPACE THEY JUST JOINED.
  -- Was: only when v_existing_member_count = 1 (the "first workspace" rule).
  -- That can never hold for an invited signup — handle_new_user() gives every
  -- new auth user their own workspace and membership first, so the count is
  -- always >= 2 by the time an invite is accepted, and the invitee stayed
  -- pointed at their own empty workspace. v_existing_member_count is left
  -- declared and assigned so the variable does not become an unused artefact
  -- and so a future reader can see what the count actually is.
  SELECT COUNT(*) INTO v_existing_member_count
  FROM public.workspace_members
  WHERE user_id = v_caller_id;

  UPDATE public.profiles
  SET workspace_id = v_invite.workspace_id
  WHERE id = v_caller_id;

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

-- ── down ──────────────────────────────────────────────────────────────────
-- Re-paste the accept_workspace_invite block from
-- database/migrations/080_workspace_members_rpcs.sql to restore the
-- first-workspace-only behaviour.

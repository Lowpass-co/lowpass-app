-- ============================================
-- LOWPASS — Permissions foundation (Sprint 9 §1)
-- Migration 078
--
-- Purely additive. New tables + columns + their RLS using the
-- EXISTING is_workspace_admin() helper (which still reads
-- profiles.role_id -> roles.is_god). Migration 079 swaps the
-- helper body to read workspace_members.role; the policies
-- created here pick up the new semantics automatically.
--
-- What this migration adds:
--   1. workspace_members (canonical multi-workspace membership).
--      The table did not exist in production at sprint kickoff
--      (verified by Adam via information_schema). Created fresh
--      and backfilled from profiles.workspace_id so every
--      existing single-workspace user gets a row.
--   2. workspace_member_tags (free-form tag scoping).
--   3. permission_grants (granular page-level allowances).
--   4. audit_log (full edit history, surfaced in Sprint 10 UI).
--   5. workspace_invites (magic-link invite flow for Phase 3).
--   6. canonical_persons (platform-shared person identity for
--      cross-workspace conflict detection).
--   7. persons.canonical_person_id FK (link existing
--      workspace-scoped persons to canonical entries).
--   8. personnel.user_id FK (link a personnel record to an auth
--      user — enables crew read-only view in Phase 6).
--   9. tour_personnel.status enum ('confirmed' | 'tentative' |
--      'awaiting_contract' | 'cancelled' | 'fired', default
--      'confirmed').
--
-- Idempotency: every CREATE / ALTER uses IF NOT EXISTS or DROP
-- POLICY IF EXISTS + recreate. Safe to re-run.
--
-- Drift detection: leading DO block introspects the existing
-- workspace_members table (if any) and:
--   - RAISE NOTICE on soft drift (missing index, unexpected
--     default, missing FK).
--   - RAISE EXCEPTION on hard drift on critical columns where
--     IF NOT EXISTS would silently skip and leave the migration
--     half-applied.
--
-- Two-step apply order: this migration is purely additive. The
-- existing is_workspace_admin() helper continues to read
-- profiles.role_id; new tables' policies use that same helper
-- so they work in the hybrid state between 078 and 079.
-- Migration 079 atomically swaps the helper body and rewrites
-- strict-gated tables' policies to call can_access().
-- ============================================

-- ============================================
-- Drift detection — workspace_members
-- ============================================
DO $$
DECLARE
  v_exists boolean;
  v_role_type text;
  v_owner_type text;
  v_user_id_type text;
  v_workspace_id_type text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'workspace_members'
  ) INTO v_exists;

  IF NOT v_exists THEN
    RAISE NOTICE '[078] workspace_members: table absent — creating fresh.';
  ELSE
    RAISE NOTICE '[078] workspace_members: table exists — checking column drift.';

    -- Hard-drift checks: critical columns whose type/structure
    -- the IF NOT EXISTS would silently skip if mismatched.
    SELECT data_type INTO v_user_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workspace_members'
      AND column_name = 'user_id';

    IF v_user_id_type IS NOT NULL AND v_user_id_type <> 'uuid' THEN
      RAISE EXCEPTION '[078] HARD DRIFT: workspace_members.user_id is type "%", expected "uuid". Aborting before half-apply.',
        v_user_id_type;
    END IF;

    SELECT data_type INTO v_workspace_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workspace_members'
      AND column_name = 'workspace_id';

    IF v_workspace_id_type IS NOT NULL AND v_workspace_id_type <> 'uuid' THEN
      RAISE EXCEPTION '[078] HARD DRIFT: workspace_members.workspace_id is type "%", expected "uuid". Aborting before half-apply.',
        v_workspace_id_type;
    END IF;

    -- Soft-drift checks: log + continue.
    SELECT data_type INTO v_role_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workspace_members'
      AND column_name = 'role';

    IF v_role_type IS NOT NULL AND v_role_type <> 'text' THEN
      RAISE NOTICE '[078] SOFT DRIFT: workspace_members.role is type "%", expected "text". CHECK constraint may not apply cleanly.',
        v_role_type;
    END IF;

    SELECT data_type INTO v_owner_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workspace_members'
      AND column_name = 'is_workspace_owner';

    IF v_owner_type IS NOT NULL AND v_owner_type <> 'boolean' THEN
      RAISE NOTICE '[078] SOFT DRIFT: workspace_members.is_workspace_owner is type "%", expected "boolean".',
        v_owner_type;
    END IF;
  END IF;
END $$;

-- ============================================
-- 1. workspace_members
-- ============================================
CREATE TABLE IF NOT EXISTS public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'readonly'
    CHECK (role IN ('admin', 'manager', 'readonly')),
  is_workspace_owner BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, workspace_id)
);

-- If the table existed pre-migration without the new columns, retrofit them.
ALTER TABLE public.workspace_members
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'readonly'
    CHECK (role IN ('admin', 'manager', 'readonly'));
ALTER TABLE public.workspace_members
  ADD COLUMN IF NOT EXISTS is_workspace_owner BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS workspace_members_workspace_idx
  ON public.workspace_members (workspace_id);
CREATE INDEX IF NOT EXISTS workspace_members_user_idx
  ON public.workspace_members (user_id);

-- Backfill from profiles. Every profile.workspace_id becomes a
-- workspace_members row. Existing users are admins of their
-- single workspace; the workspace owner (workspaces.owner_id)
-- additionally gets is_workspace_owner = TRUE. Rental-inventory
-- API (which queries workspace_members for sibling user_ids)
-- starts working again immediately after this backfill.
INSERT INTO public.workspace_members (user_id, workspace_id, role, is_workspace_owner, created_at)
SELECT
  p.id,
  p.workspace_id,
  'admin',
  COALESCE(w.owner_id = p.id, FALSE),
  COALESCE(p.created_at, now())
FROM public.profiles p
LEFT JOIN public.workspaces w ON w.id = p.workspace_id
WHERE p.workspace_id IS NOT NULL
ON CONFLICT (user_id, workspace_id) DO NOTHING;

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- Self-SELECT only. The obvious "see other members in my
-- workspace" predicate would subquery workspace_members from
-- workspace_members's own RLS policy → infinite recursion (the
-- exact problem migration 004_fix_rls_recursion.sql was written
-- to solve for profiles). Cross-member visibility for the
-- Phase 3 members-management UI goes through a SECURITY DEFINER
-- RPC instead, which bypasses RLS and applies its own admin
-- gating in the function body.
DROP POLICY IF EXISTS workspace_members_select ON public.workspace_members;
CREATE POLICY workspace_members_select ON public.workspace_members
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS workspace_members_admin_write ON public.workspace_members;
CREATE POLICY workspace_members_admin_write ON public.workspace_members
  FOR ALL USING (
    workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin()
  ) WITH CHECK (
    workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin()
  );

-- ============================================
-- 2. workspace_member_tags
-- ============================================
CREATE TABLE IF NOT EXISTS public.workspace_member_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.workspace_members(id) ON DELETE CASCADE,
  tag_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (member_id, tag_name)
);

CREATE INDEX IF NOT EXISTS workspace_member_tags_workspace_idx
  ON public.workspace_member_tags (workspace_id);
CREATE INDEX IF NOT EXISTS workspace_member_tags_workspace_tag_idx
  ON public.workspace_member_tags (workspace_id, tag_name);

ALTER TABLE public.workspace_member_tags ENABLE ROW LEVEL SECURITY;

-- Strict admin-only across all four verbs. Managers go through
-- a SECURITY DEFINER RPC for the member-management UI.
DROP POLICY IF EXISTS workspace_member_tags_admin_all ON public.workspace_member_tags;
CREATE POLICY workspace_member_tags_admin_all ON public.workspace_member_tags
  FOR ALL USING (
    workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin()
  ) WITH CHECK (
    workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin()
  );

-- ============================================
-- 3. permission_grants
-- ============================================
CREATE TABLE IF NOT EXISTS public.permission_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('user', 'tag')),
  subject_id TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('page', 'product')),
  resource_id TEXT NOT NULL,
  permission TEXT NOT NULL CHECK (permission IN ('read', 'write')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, subject_type, subject_id, resource_type, resource_id, permission),
  -- Adam's add: subject_id format check. user-type must be a
  -- UUID; tag-type is a free-form tag_name (no format check).
  CONSTRAINT permission_grants_subject_id_shape CHECK (
    (subject_type = 'user' AND subject_id ~ '^[0-9a-fA-F-]{36}$')
    OR subject_type = 'tag'
  )
);

CREATE INDEX IF NOT EXISTS permission_grants_workspace_idx
  ON public.permission_grants (workspace_id);
CREATE INDEX IF NOT EXISTS permission_grants_subject_idx
  ON public.permission_grants (workspace_id, subject_type, subject_id);
CREATE INDEX IF NOT EXISTS permission_grants_resource_idx
  ON public.permission_grants (workspace_id, resource_type, resource_id);

ALTER TABLE public.permission_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS permission_grants_admin_all ON public.permission_grants;
CREATE POLICY permission_grants_admin_all ON public.permission_grants
  FOR ALL USING (
    workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin()
  ) WITH CHECK (
    workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin()
  );

-- ============================================
-- 4. audit_log
-- ============================================
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  field_changes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_workspace_time_idx
  ON public.audit_log (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx
  ON public.audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_time_idx
  ON public.audit_log (actor_user_id, created_at DESC) WHERE actor_user_id IS NOT NULL;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Admin-only-read in v1 (managers go through RPC if needed).
DROP POLICY IF EXISTS audit_log_admin_select ON public.audit_log;
CREATE POLICY audit_log_admin_select ON public.audit_log
  FOR SELECT USING (
    workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin()
  );

-- INSERT permitted for any workspace member (write triggers
-- and app code log audit entries). The actor_user_id check is
-- the integrity gate.
DROP POLICY IF EXISTS audit_log_member_insert ON public.audit_log;
CREATE POLICY audit_log_member_insert ON public.audit_log
  FOR INSERT WITH CHECK (
    workspace_id = public.get_my_workspace_id()
    AND (actor_user_id IS NULL OR actor_user_id = auth.uid())
  );

-- No UPDATE or DELETE policies — audit_log is append-only at
-- the RLS layer. Truncate-style cleanup (Sprint 12+) goes
-- through SECURITY DEFINER RPCs.

-- ============================================
-- 5. workspace_invites
-- ============================================
CREATE TABLE IF NOT EXISTS public.workspace_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  invited_role TEXT NOT NULL DEFAULT 'readonly'
    CHECK (invited_role IN ('admin', 'manager', 'readonly')),
  initial_tags TEXT[] NOT NULL DEFAULT '{}',
  initial_grants JSONB NOT NULL DEFAULT '[]',
  token TEXT NOT NULL UNIQUE,
  invited_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days'),
  accepted_at TIMESTAMPTZ,
  accepted_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workspace_invites_email_norm CHECK (invited_email = lower(invited_email))
);

CREATE INDEX IF NOT EXISTS workspace_invites_workspace_idx
  ON public.workspace_invites (workspace_id);
CREATE INDEX IF NOT EXISTS workspace_invites_email_idx
  ON public.workspace_invites (lower(invited_email))
  WHERE accepted_at IS NULL;
CREATE INDEX IF NOT EXISTS workspace_invites_pending_idx
  ON public.workspace_invites (workspace_id, expires_at)
  WHERE accepted_at IS NULL;

ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;

-- Strict admin-only. Accept-by-token path goes through a
-- SECURITY DEFINER RPC (Phase 3) so the invitee never SELECTs
-- this table directly.
DROP POLICY IF EXISTS workspace_invites_admin_all ON public.workspace_invites;
CREATE POLICY workspace_invites_admin_all ON public.workspace_invites
  FOR ALL USING (
    workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin()
  ) WITH CHECK (
    workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin()
  );

-- ============================================
-- 6. canonical_persons (platform-shared person identity)
-- ============================================
CREATE TABLE IF NOT EXISTS public.canonical_persons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  phone TEXT,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT canonical_persons_email_norm CHECK (email IS NULL OR email = lower(email))
);

-- Email is UNIQUE when present; allows multiple rows with NULL email.
CREATE UNIQUE INDEX IF NOT EXISTS canonical_persons_email_unique
  ON public.canonical_persons (email) WHERE email IS NOT NULL;

DROP TRIGGER IF EXISTS canonical_persons_updated_at ON public.canonical_persons;
CREATE TRIGGER canonical_persons_updated_at
  BEFORE UPDATE ON public.canonical_persons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.canonical_persons ENABLE ROW LEVEL SECURITY;

-- SELECT: allowed if user has any persons row in their workspace
-- whose canonical_person_id matches (i.e. they've worked with this
-- canonical person), OR if they're an admin/manager of any
-- workspace where such a link exists.
DROP POLICY IF EXISTS canonical_persons_select ON public.canonical_persons;
CREATE POLICY canonical_persons_select ON public.canonical_persons
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.persons p
      WHERE p.canonical_person_id = canonical_persons.id
        AND p.workspace_id IN (
          SELECT m.workspace_id FROM public.workspace_members m
          WHERE m.user_id = auth.uid()
        )
    )
  );

-- INSERT: any authenticated user (creating personnel implicitly
-- creates canonical entries server-side).
DROP POLICY IF EXISTS canonical_persons_insert ON public.canonical_persons;
CREATE POLICY canonical_persons_insert ON public.canonical_persons
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE / DELETE: admin/manager of a workspace that has a
-- linked persons row. Sprint 9 leaves "manager" gating to the
-- existing is_workspace_admin() check; Sprint 10 introduces
-- the role split via 079's helper rewrite.
DROP POLICY IF EXISTS canonical_persons_update ON public.canonical_persons;
CREATE POLICY canonical_persons_update ON public.canonical_persons
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.persons p
      WHERE p.canonical_person_id = canonical_persons.id
        AND p.workspace_id = public.get_my_workspace_id()
    )
    AND public.is_workspace_admin()
  );

DROP POLICY IF EXISTS canonical_persons_delete ON public.canonical_persons;
CREATE POLICY canonical_persons_delete ON public.canonical_persons
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM public.persons p
      WHERE p.canonical_person_id = canonical_persons.id
        AND p.workspace_id = public.get_my_workspace_id()
    )
    AND public.is_workspace_admin()
  );

-- ============================================
-- 7. persons.canonical_person_id
-- ============================================
ALTER TABLE public.persons
  ADD COLUMN IF NOT EXISTS canonical_person_id UUID
    REFERENCES public.canonical_persons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS persons_canonical_idx
  ON public.persons (canonical_person_id) WHERE canonical_person_id IS NOT NULL;

-- ============================================
-- 8. personnel.user_id
-- ============================================
ALTER TABLE public.personnel
  ADD COLUMN IF NOT EXISTS user_id UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS personnel_user_id_idx
  ON public.personnel (user_id) WHERE user_id IS NOT NULL;

-- ============================================
-- 9. tour_personnel.status
-- ============================================
ALTER TABLE public.tour_personnel
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'tentative', 'awaiting_contract', 'cancelled', 'fired'));

-- ============================================
-- DOWN (manual rollback — uncomment to roll back)
-- ============================================
-- ALTER TABLE public.tour_personnel DROP COLUMN IF EXISTS status;
-- DROP INDEX IF EXISTS public.personnel_user_id_idx;
-- ALTER TABLE public.personnel DROP COLUMN IF EXISTS user_id;
-- DROP INDEX IF EXISTS public.persons_canonical_idx;
-- ALTER TABLE public.persons DROP COLUMN IF EXISTS canonical_person_id;
-- DROP TABLE IF EXISTS public.canonical_persons;
-- DROP TABLE IF EXISTS public.workspace_invites;
-- DROP TABLE IF EXISTS public.audit_log;
-- DROP TABLE IF EXISTS public.permission_grants;
-- DROP TABLE IF EXISTS public.workspace_member_tags;
-- DROP TABLE IF EXISTS public.workspace_members;
-- (workspace_members backfill data is destroyed on rollback —
-- profiles.workspace_id is preserved so a re-apply rebuilds it.)

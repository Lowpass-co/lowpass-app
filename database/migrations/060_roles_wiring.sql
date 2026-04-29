-- ============================================
-- LOWPASS — Roles infrastructure backfill
-- Migration 060
--
-- 001_initial_schema.sql created the roles table and profiles.role_id
-- but never reliably populated either across the user base. The
-- auto-provisioning trigger from 002 creates a "Tour Manager" role
-- with is_god=TRUE for new signups, but accounts created before that
-- trigger existed (or where the trigger ran but the role assignment
-- got cleared) end up with role_id IS NULL — and is_workspace_admin()
-- returns FALSE for them, silently locking them out of admin-gated
-- operations across the app.
--
-- This migration ensures the roles infrastructure is end-to-end:
--   1. Every workspace has Admin (is_god=TRUE) + Member roles.
--   2. Every profile with NULL role_id is backfilled to its workspace's
--      Admin role (Adam's call: default-unblock everyone, demote test
--      users via the new /settings/team UI).
--   3. RLS on the roles table — workspace members SELECT, only admins
--      can write.
--   4. profiles UPDATE policy extended so admins can change other
--      members' role_id within their workspace (powers the Team UI).
--
-- This migration was applied via direct SQL on 2026-04-29. Recording
-- it as a tracked file so codebase and live database stop drifting.
-- See docs/handover/CC_ROLES_WIRING.md for the original prompt.
-- ============================================

-- 1. Ensure Admin + Member roles exist per workspace
INSERT INTO public.roles (workspace_id, name, is_god, permissions)
SELECT w.id, 'Admin', TRUE, '{}'::jsonb
FROM public.workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM public.roles r
  WHERE r.workspace_id = w.id AND r.is_god = TRUE
);

INSERT INTO public.roles (workspace_id, name, is_god, permissions)
SELECT w.id, 'Member', FALSE, '{}'::jsonb
FROM public.workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM public.roles r
  WHERE r.workspace_id = w.id AND r.is_god = FALSE AND r.name = 'Member'
);

-- 2. Backfill: every NULL-role profile gets their workspace's earliest
--    is_god=TRUE role (typically Tour Manager from 002, or Admin from
--    step 1).
UPDATE public.profiles p
SET role_id = (
  SELECT r.id
  FROM public.roles r
  WHERE r.workspace_id = p.workspace_id AND r.is_god = TRUE
  ORDER BY r.created_at ASC
  LIMIT 1
)
WHERE p.role_id IS NULL AND p.workspace_id IS NOT NULL;

-- 3. RLS on the roles table
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roles_select" ON public.roles;
CREATE POLICY "roles_select"
  ON public.roles FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS "roles_admin_write" ON public.roles;
CREATE POLICY "roles_admin_write"
  ON public.roles FOR ALL
  USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin())
  WITH CHECK (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

-- 4. Extend profiles UPDATE so admins can change other members' role_id
DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;
CREATE POLICY "profiles_admin_update"
  ON public.profiles FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin())
  WITH CHECK (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

-- Down (commented; uncomment to roll back manually):
-- DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;
-- DROP POLICY IF EXISTS "roles_admin_write" ON public.roles;
-- DROP POLICY IF EXISTS "roles_select" ON public.roles;
-- (Don't NULL out role_ids on rollback — keep the assignment.)

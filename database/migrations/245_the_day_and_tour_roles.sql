-- ============================================================================
-- 245_the_day_and_tour_roles.sql
--
-- D1 — "The Day" + tour roles (the Daysheets/MasterTour replacement).
-- Three schema changes, all additive:
--
--   1. labor_calls.call_time_approx  — the Day schedule merges labor calls with
--      advance time fields; an approximate call ("~load-in") needs a flag. None
--      existed on labor_calls (239), so add one. DEFAULT false = no behaviour change.
--
--   2. tour_roles  — one row per (tour, person): their permission role on that tour.
--      user_id is nullable (linked when the person has an account; today crew reach
--      the Day via a token, not a login). role enum drives the server-side SLICE.
--
--   3. tour_role_links  — per-person tokenized Day link. Mirrors advance_intake_links
--      (107) exactly: opaque plaintext token, status pending|revoked, expires_at /
--      revoked_at, service-role resolve by token on the public path. Kept separate
--      from tour_roles so a link can be revoked / reissued without touching the role.
--
-- NO per-day-notes column is added: the Day's Notes block REUSES the existing
-- routing.notes (001_initial_schema.sql:112) — it is already the per-day operator
-- note edited from the routing grid, so the Day sheet and routing grid share one note
-- (Adam's "assembly of data we already hold", not a new writable).
--
-- HAND-APPLIED: paste into the Supabase SQL editor. Idempotent / re-runnable
-- (ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS / DROP POLICY IF EXISTS);
-- down-block at the end. No engine code depends on it until Adam confirms "pasted".
-- ============================================================================

BEGIN;

-- 1. Approximate-time flag on labor calls -----------------------------------
ALTER TABLE public.labor_calls
  ADD COLUMN IF NOT EXISTS call_time_approx BOOLEAN NOT NULL DEFAULT false;

-- 2. tour_roles -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tour_roles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id       UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  -- canonical person this role belongs to.
  person_id     UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  -- linked when the person has an account (future logged-in crew); NULL today.
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- the permission role → drives the Day slice (src/lib/roles/slices.ts).
  role          TEXT NOT NULL DEFAULT 'crew'
                  CHECK (role IN ('tm','production','accountant','crew','driver','band','management')),
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tour_id, person_id)
);
CREATE INDEX IF NOT EXISTS tour_roles_tour_idx ON public.tour_roles(tour_id);
CREATE INDEX IF NOT EXISTS tour_roles_user_idx ON public.tour_roles(user_id);

-- 3. tour_role_links (tokenized per-person Day link) ------------------------
CREATE TABLE IF NOT EXISTS public.tour_role_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id       UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  tour_role_id  UUID NOT NULL REFERENCES public.tour_roles(id) ON DELETE CASCADE,
  -- opaque plaintext token (randomBytes(24).base64url), resolved by the public
  -- /m/day/[token] route via the service-role client — never through RLS.
  token         TEXT NOT NULL UNIQUE,
  -- pending → revoked (TM killed it). 'expired' is derived from expires_at at read.
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','revoked')),
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  last_viewed_at TIMESTAMPTZ,
  last_viewer_ip TEXT
);
CREATE INDEX IF NOT EXISTS tour_role_links_token_idx ON public.tour_role_links(token);
CREATE INDEX IF NOT EXISTS tour_role_links_role_idx  ON public.tour_role_links(tour_role_id);

-- RLS — canonical workspace scoping (get_my_workspace_id / is_workspace_admin).
-- The public token path uses the service-role client and resolves strictly by
-- token, so it never touches these policies (same as advance_intake_links/107).
ALTER TABLE public.tour_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tour_roles_select ON public.tour_roles;
CREATE POLICY tour_roles_select ON public.tour_roles
  FOR SELECT USING (
    workspace_id = public.get_my_workspace_id()
    -- a linked user may always read their own role row (future logged-in crew).
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS tour_roles_insert ON public.tour_roles;
CREATE POLICY tour_roles_insert ON public.tour_roles
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS tour_roles_update ON public.tour_roles;
CREATE POLICY tour_roles_update ON public.tour_roles
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id())
    WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS tour_roles_delete ON public.tour_roles;
CREATE POLICY tour_roles_delete ON public.tour_roles
  FOR DELETE USING (
    workspace_id = public.get_my_workspace_id()
    AND public.is_workspace_admin()
  );

ALTER TABLE public.tour_role_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tour_role_links_select ON public.tour_role_links;
CREATE POLICY tour_role_links_select ON public.tour_role_links
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS tour_role_links_insert ON public.tour_role_links;
CREATE POLICY tour_role_links_insert ON public.tour_role_links
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS tour_role_links_update ON public.tour_role_links;
CREATE POLICY tour_role_links_update ON public.tour_role_links
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id())
    WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS tour_role_links_delete ON public.tour_role_links;
CREATE POLICY tour_role_links_delete ON public.tour_role_links
  FOR DELETE USING (
    workspace_id = public.get_my_workspace_id()
    AND public.is_workspace_admin()
  );

COMMIT;

-- ============================================================================
-- DOWN (manual — paste to reverse):
-- BEGIN;
-- DROP TABLE IF EXISTS public.tour_role_links;
-- DROP TABLE IF EXISTS public.tour_roles;
-- ALTER TABLE public.labor_calls DROP COLUMN IF EXISTS call_time_approx;
-- COMMIT;
-- ============================================================================

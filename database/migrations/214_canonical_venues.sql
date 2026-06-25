-- ============================================
-- LOWPASS — Canonical venues (the Community floor)
-- Migration 214
--
-- A GLOBAL, platform-scoped venue identity anchored on Google Place ID,
-- so the same real-world venue resolves to one id across every workspace.
-- This is the prerequisite for any future cross-workspace aggregation
-- (the "Community", §2 Layer C) — but this migration builds ONLY the
-- identity + links. No aggregation, no k-anonymity, no opt-in here.
--
-- The RLS seam (architecture doc §3; Adam's call 2026-06-25):
--   • canonical_venues facts (name/place_id/city/country/capacity/lat/lng)
--     are NON-PERSONAL real-world facts → readable by any authenticated
--     user. The table NEVER carries workspace_id or any tenant data — that
--     invariant is what makes a shared, world-readable directory safe.
--   • Writes are service-role ONLY (find-or-create runs server-side during
--     routing save + backfill) — no client can poison the shared rows.
--   • The MAPPING of which workspace played where stays private: it lives
--     as canonical_venue_id columns on the already-workspace-scoped
--     venues/routing tables, gated by their existing RLS.
--
-- Additive + reversible: new table + new nullable FK columns only. Nothing
-- on venues/routing.venue_id/venue_name is dropped or repurposed.
--
-- Place IDs can occasionally be retired/merged by Google. We store the id
-- and allow re-resolve (service-role UPDATE); an auto-refresh job is NOT
-- built here.
--
-- Idempotent. Down-block at the end.
-- ============================================

-- ── 1. Global venue identity ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.canonical_venues (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_place_id text UNIQUE,            -- cross-tenant dedupe key (nullable: allows manual rows)
  name            text NOT NULL,
  city            text,
  country         text,
  capacity        integer,               -- left NULL in this floor (no neutral source yet — Adam 2026-06-25)
  lat             double precision,
  lng             double precision,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.canonical_venues ENABLE ROW LEVEL SECURITY;

-- SELECT: any authenticated user (non-personal shared facts; no tenant data).
DROP POLICY IF EXISTS canonical_venues_select ON public.canonical_venues;
CREATE POLICY canonical_venues_select ON public.canonical_venues
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- No client writes ever — the service-role find-or-create bypasses RLS
-- (mirror ai_usage_events / rag_chunks, migration 114).
DROP POLICY IF EXISTS canonical_venues_no_client_write ON public.canonical_venues;
CREATE POLICY canonical_venues_no_client_write ON public.canonical_venues
  FOR INSERT WITH CHECK (false);

DROP TRIGGER IF EXISTS canonical_venues_updated_at ON public.canonical_venues;
CREATE TRIGGER canonical_venues_updated_at
  BEFORE UPDATE ON public.canonical_venues
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 2. Links from per-workspace rows to the canonical identity ──────
-- Primary link is routing (venues is barely written — see discovery §2);
-- both are additive nullable FKs covered by their tables' existing RLS.
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS canonical_venue_id uuid REFERENCES public.canonical_venues(id) ON DELETE SET NULL;
ALTER TABLE public.routing
  ADD COLUMN IF NOT EXISTS canonical_venue_id uuid REFERENCES public.canonical_venues(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS routing_canonical_venue_idx ON public.routing (canonical_venue_id);
CREATE INDEX IF NOT EXISTS venues_canonical_venue_idx ON public.venues (canonical_venue_id);

-- ── 3. Backfill review queue (workspace-scoped, private mapping) ────
-- The backfill auto-links only high-confidence Places matches; ambiguous
-- rows land here for human confirm/reject. This is MAPPING data (it names
-- a workspace's routing/venue row), so it is workspace-scoped — NOT shared.
CREATE TABLE IF NOT EXISTS public.canonical_venue_candidates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  source_kind        text NOT NULL CHECK (source_kind IN ('routing', 'venue')),
  source_id          uuid NOT NULL,      -- the routing/venues row needing a canonical link
  raw_name           text NOT NULL,      -- the free-text venue_name we tried to resolve
  raw_city           text,
  suggested_place_id text,               -- best Places candidate (a fact)
  suggested_name     text,
  suggested_city     text,
  suggested_country  text,
  confidence         numeric,            -- 0..1 match score
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  resolved_at        timestamptz,
  resolved_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (workspace_id, source_kind, source_id)  -- idempotent backfill: re-run updates, no dupes
);

CREATE INDEX IF NOT EXISTS canonical_venue_candidates_ws_status_idx
  ON public.canonical_venue_candidates (workspace_id, status);

ALTER TABLE public.canonical_venue_candidates ENABLE ROW LEVEL SECURITY;

-- SELECT: workspace members see their own workspace's review queue.
DROP POLICY IF EXISTS canonical_venue_candidates_select ON public.canonical_venue_candidates;
CREATE POLICY canonical_venue_candidates_select ON public.canonical_venue_candidates
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());

-- INSERT: service-role only (the backfill writes; no client inserts).
DROP POLICY IF EXISTS canonical_venue_candidates_no_client_insert ON public.canonical_venue_candidates;
CREATE POLICY canonical_venue_candidates_no_client_insert ON public.canonical_venue_candidates
  FOR INSERT WITH CHECK (false);

-- UPDATE: a workspace admin confirms/rejects within their workspace.
DROP POLICY IF EXISTS canonical_venue_candidates_update ON public.canonical_venue_candidates;
CREATE POLICY canonical_venue_candidates_update ON public.canonical_venue_candidates
  FOR UPDATE USING (
    workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin()
  )
  WITH CHECK (
    workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin()
  );

-- ============================================
-- DOWN (manual)
-- DROP TABLE IF EXISTS public.canonical_venue_candidates CASCADE;
-- DROP INDEX IF EXISTS public.venues_canonical_venue_idx;
-- DROP INDEX IF EXISTS public.routing_canonical_venue_idx;
-- ALTER TABLE public.routing DROP COLUMN IF EXISTS canonical_venue_id;
-- ALTER TABLE public.venues  DROP COLUMN IF EXISTS canonical_venue_id;
-- DROP TABLE IF EXISTS public.canonical_venues CASCADE;
-- ============================================

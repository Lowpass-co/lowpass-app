-- ============================================
-- LOWPASS — Drive-time cache (Google Directions cost hardening)
-- Migration 218
--
-- A drive time between two fixed points is deterministic and ~never
-- changes, but RoutingGrid re-fetches every leg on each grid load
-- (driveHours is component state that dies on unmount). This caches the
-- result so re-opening a routing costs ZERO new google.directions calls.
--
-- Workspace-agnostic on purpose: the inputs are public coordinate strings
-- ("lat,lng"), not personal data — the same leg is identical for every
-- workspace, so a shared cache maximises hit rate. No workspace_id, no
-- tenant data → safe to share (same reasoning as canonical_venues).
--
-- Writes are service-role only (the /api/directions route writes on a
-- cache miss); reads are allowed to any authenticated user. Idempotent.
-- ============================================

CREATE TABLE IF NOT EXISTS public.drive_time_cache (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin           text NOT NULL,                 -- "lat,lng"
  destination      text NOT NULL,                 -- "lat,lng"
  mode             text NOT NULL DEFAULT 'driving',
  duration_seconds integer NOT NULL,
  distance_meters  integer,
  fetched_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (origin, destination, mode)
);

ALTER TABLE public.drive_time_cache ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user (non-personal shared facts).
DROP POLICY IF EXISTS drive_time_cache_select ON public.drive_time_cache;
CREATE POLICY drive_time_cache_select ON public.drive_time_cache
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- No client writes — the directions route upserts via service-role.
DROP POLICY IF EXISTS drive_time_cache_no_client_write ON public.drive_time_cache;
CREATE POLICY drive_time_cache_no_client_write ON public.drive_time_cache
  FOR INSERT WITH CHECK (false);

-- ============================================
-- DOWN (manual)
-- DROP TABLE IF EXISTS public.drive_time_cache CASCADE;
-- ============================================

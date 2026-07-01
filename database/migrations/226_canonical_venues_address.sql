-- ============================================
-- LOWPASS — Canonical venues: address column (venue-library enrichment)
-- Migration 226
-- ============================================
--
-- canonical_venues (migration 214) is the app-wide, world-readable venue directory
-- (facts only; service-role writes). It carries name/city/country/capacity/lat/lng
-- but NO address — address lived only denormalised on the routing row (from Google).
-- Add address so it can auto-populate FROM the library (venue-first routing +
-- advance venue-info auto-fill).
--
--   • canonical_venues.address — formatted address (facts only, world-readable).
--
-- No RLS change: canonical_venues stays world-readable to authed users with
-- service-role-only writes (the 214 policies are untouched). Additive, nullable,
-- idempotent. Down-block at the end.

ALTER TABLE public.canonical_venues
  ADD COLUMN IF NOT EXISTS address text;

-- ============================================
-- DOWN MIGRATION (manual — uncomment to roll back)
-- ============================================
-- ALTER TABLE public.canonical_venues DROP COLUMN IF EXISTS address;

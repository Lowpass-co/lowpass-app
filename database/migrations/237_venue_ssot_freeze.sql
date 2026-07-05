-- ============================================
-- LOWPASS — Venue SSOT: freeze marker + canonical backfill
-- Migration 237
-- ============================================
--
-- Venue single-source-of-truth (CC_VENUE_SSOT.md, run order 2). A routing
-- row's venue is a LIVE reference to canonical_venues until its show day passes,
-- then a FROZEN snapshot in the routing.venue_* columns. This migration adds the
-- freeze marker and links existing routing rows to their canonical identity.
--
--   • routing.canonical_venue_id  — already added in migration 214 (FK to
--     canonical_venues, ON DELETE SET NULL). Not re-added here.
--   • routing.venue_frozen_at     — NEW. NULL = still live (resolve from
--     canonical); non-NULL = the venue_* columns are the immutable snapshot.
--     Written by the on-read freeze (first resolution after the date passes).
--
-- Backfill policy (safety-first): EXACT name+city matches are auto-linked —
-- deterministic, reversible (FK is ON DELETE SET NULL), idempotent (only NULL
-- rows are touched). FUZZY matches are SURFACED FOR REVIEW (Section C), NOT
-- auto-written: a wrong fuzzy link puts the wrong address in front of crew on
-- show day — the exact failure this SSOT exists to prevent — and unmatched rows
-- staying free-text is explicitly allowed. Run the fuzzy review, then link the
-- ones you trust by hand.
--
-- Additive · idempotent · re-runnable · down-block at the end.

-- ── 1. Freeze marker ──────────────────────────────────────────────
ALTER TABLE public.routing
  ADD COLUMN IF NOT EXISTS venue_frozen_at timestamptz;

COMMENT ON COLUMN public.routing.venue_frozen_at IS
  'Venue SSOT: when set, the routing.venue_* columns are the frozen historical snapshot; when NULL, the venue resolves live from canonical_venues. Written by the on-read freeze after the show day passes.';

-- ── 2. Backfill canonical_venue_id — EXACT match (auto, safe) ──────
-- Case-insensitive, trimmed name AND city. Only touches rows with no link yet
-- and a non-empty venue_name. If more than one canonical row matches (dup
-- library rows), we skip it — ambiguous links are not safe to guess.
UPDATE public.routing r
SET canonical_venue_id = m.id
FROM (
  SELECT
    lower(btrim(cv.name))            AS norm_name,
    lower(btrim(coalesce(cv.city,''))) AS norm_city,
    min(cv.id::text)::uuid           AS id,
    count(*)                         AS n
  FROM public.canonical_venues cv
  GROUP BY 1, 2
) m
WHERE r.canonical_venue_id IS NULL
  AND r.venue_name IS NOT NULL
  AND btrim(r.venue_name) <> ''
  AND m.n = 1                                    -- unambiguous only
  AND lower(btrim(r.venue_name)) = m.norm_name
  AND lower(btrim(coalesce(r.city,''))) = m.norm_city;

-- ============================================
-- Section C — FUZZY REVIEW (run manually; nothing here auto-writes)
-- ============================================
-- Enable trigram similarity (available; used by migration 222) and list the
-- still-unlinked routing venues alongside their closest canonical candidate.
-- Eyeball each, then link the trustworthy ones by hand, e.g.:
--   UPDATE public.routing SET canonical_venue_id = '<cv id>' WHERE id = '<routing id>';
--
--   CREATE EXTENSION IF NOT EXISTS pg_trgm;
--   SELECT
--     r.id            AS routing_id,
--     r.venue_name    AS routing_venue,
--     r.city          AS routing_city,
--     cv.id           AS candidate_id,
--     cv.name         AS candidate_venue,
--     cv.city         AS candidate_city,
--     round(similarity(lower(cv.name), lower(r.venue_name))::numeric, 3) AS score
--   FROM public.routing r
--   CROSS JOIN LATERAL (
--     SELECT cv.id, cv.name, cv.city
--     FROM public.canonical_venues cv
--     WHERE lower(btrim(coalesce(cv.city,''))) = lower(btrim(coalesce(r.city,'')))
--     ORDER BY similarity(lower(cv.name), lower(r.venue_name)) DESC
--     LIMIT 1
--   ) cv
--   WHERE r.canonical_venue_id IS NULL
--     AND r.venue_name IS NOT NULL AND btrim(r.venue_name) <> ''
--     AND similarity(lower(cv.name), lower(r.venue_name)) >= 0.4
--   ORDER BY score DESC;

-- ============================================
-- Match-rate report (run after the exact backfill above)
-- ============================================
--   SELECT
--     count(*) FILTER (WHERE venue_name IS NOT NULL AND btrim(venue_name) <> '') AS named_rows,
--     count(*) FILTER (WHERE canonical_venue_id IS NOT NULL)                     AS linked_rows,
--     round(
--       100.0 * count(*) FILTER (WHERE canonical_venue_id IS NOT NULL)
--       / nullif(count(*) FILTER (WHERE venue_name IS NOT NULL AND btrim(venue_name) <> ''), 0)
--     , 1) AS pct_linked
--   FROM public.routing;

-- ============================================
-- DOWN MIGRATION (manual — uncomment to roll back)
-- ============================================
-- The canonical_venue_id column itself belongs to migration 214; only the
-- freeze marker is dropped here. (Backfilled links are left in place — they are
-- correct data; DELETE-ing them is not part of a schema rollback.)
-- ALTER TABLE public.routing DROP COLUMN IF EXISTS venue_frozen_at;

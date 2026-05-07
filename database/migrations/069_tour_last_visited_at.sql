-- ============================================
-- LOWPASS — Tour last_visited_at tracking
-- Migration 069
--
-- Sprint 8.2 §6 — Adam's smoke against 8.1: "the 'pick up where
-- you left off' menu isnt accurate to the last thing I worked
-- on. and it should be."
--
-- The Sprint 7 §6.2 PickUp query used tours.updated_at as a
-- proxy for "last thing the user worked on" — but updated_at
-- moves on any database write to the row by ANY workspace
-- member, not just the current user, and not on read-only
-- visits. The Pick Up card surfaced whatever someone in the
-- workspace touched most recently, which often wasn't what
-- this user was doing.
--
-- Fix is two-part. This migration adds a tours.last_visited_at
-- column that the new POST /api/tours/[id]/touch endpoint
-- updates whenever a user lands on a tour-scoped product page
-- (/budget/[X]/*, /advance/[X]/*, /operations/[X]/*). The
-- Pick Up query then orders by last_visited_at DESC NULLS LAST
-- with updated_at as a fallback for tours that have never been
-- visited via the new tracker.
--
-- Per-user precision (separate tour_visits join table keyed
-- on user_id + tour_id) is meaningfully better but heavier;
-- option A from the prompt is "any workspace member's last
-- visit", which is one column and ships in this migration.
-- Migrating from A to B is straightforward when needed.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, no destructive change.
-- ============================================

ALTER TABLE public.tours
  ADD COLUMN IF NOT EXISTS last_visited_at timestamptz;

-- Index on last_visited_at — the Pick Up query orders DESC
-- NULLS LAST on this column. Partial index on rows with a
-- non-null value keeps the index small (most rows will be
-- null for the first few weeks after this ships).
CREATE INDEX IF NOT EXISTS tours_last_visited_at_idx
  ON public.tours (last_visited_at DESC)
  WHERE last_visited_at IS NOT NULL;

COMMENT ON COLUMN public.tours.last_visited_at IS
  'Sprint 8.2 §6 — bumped on each tour-scoped page load via '
  'POST /api/tours/[id]/touch. Drives the Pick Up Where You '
  'Left Off card on the workspace landing. Workspace-shared '
  '(any member''s visit bumps it); migrate to a per-user '
  'tour_visits table when per-user precision is needed.';

-- ============================================
-- Down migration (manual)
-- ============================================
-- ALTER TABLE public.tours DROP COLUMN last_visited_at;
-- DROP INDEX IF EXISTS public.tours_last_visited_at_idx;

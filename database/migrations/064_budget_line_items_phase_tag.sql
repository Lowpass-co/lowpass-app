-- ============================================
-- LOWPASS — budget_line_items.phase_tag
-- Migration 064
--
-- Adds an optional phase tag to budget line items so they can be
-- grouped/viewed by tour phase (pre-prod / rehearsals / show-days /
-- wrap) in addition to the existing category grouping.
--
-- NULL = unscoped (default). Phase grouping shows these under
-- "Unscoped". Category grouping ignores this column.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- The CHECK constraint is added separately so re-runs don't fail
-- with "constraint already exists" — pg < 15 doesn't support the
-- ADD CONSTRAINT IF NOT EXISTS clause.
-- ============================================

ALTER TABLE public.budget_line_items
  ADD COLUMN IF NOT EXISTS phase_tag TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'budget_line_items_phase_tag_check'
      AND conrelid = 'public.budget_line_items'::regclass
  ) THEN
    ALTER TABLE public.budget_line_items
      ADD CONSTRAINT budget_line_items_phase_tag_check
      CHECK (
        phase_tag IS NULL
        OR phase_tag IN ('pre_prod', 'rehearsals', 'show_days', 'wrap')
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS budget_line_items_phase_tag_idx
  ON public.budget_line_items(tour_id, phase_tag)
  WHERE phase_tag IS NOT NULL;

COMMENT ON COLUMN public.budget_line_items.phase_tag IS
  'Optional tour-phase tag for grouping in the budget UI. Mirrors the four phases from computeTourPhases() in src/server/budget/. NULL = unscoped.';

-- ============================================
-- Down migration (manual — uncomment and run if needed)
-- ============================================
-- DROP INDEX IF EXISTS public.budget_line_items_phase_tag_idx;
-- ALTER TABLE public.budget_line_items
--   DROP CONSTRAINT IF EXISTS budget_line_items_phase_tag_check,
--   DROP COLUMN IF EXISTS phase_tag;

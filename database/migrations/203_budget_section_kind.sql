-- ============================================
-- LOWPASS — Budget locked formula sections (Stage 3 finishing — Phase 3)
-- Migration 203
-- ============================================
--
-- A budget_section becomes either:
--   'custom'      — plain, user-named, holds editable line items (default;
--                   every pre-existing section is this).
--   formula kinds — 'commission' | 'insurance' | 'contingency' | 'cogs':
--                   LOCKED, computed read-only from the P&L. The % lives in
--                   Settings; the grid surfaces the computed rows so the
--                   spreadsheet + Summary read the same numbers.
--
-- One formula section of each kind per tour, enforced by a partial unique
-- index (custom sections are unconstrained). budget_sections (migration 200)
-- already carries workspace-scoped RLS; adding a column inherits it.
-- Idempotent. Down block.
-- ============================================

ALTER TABLE public.budget_sections
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'custom';

COMMENT ON COLUMN public.budget_sections.kind IS
  'custom | commission | insurance | contingency | cogs. Formula kinds are '
  'locked + computed from computeBudgetPnl; one of each per tour. Stage 3 Phase 3.';

-- Defensive: guard the allowed set so a bad write can''t slip an unknown
-- kind past the API. NOT VALID-free since the column is freshly defaulted.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'budget_sections_kind_check'
  ) THEN
    ALTER TABLE public.budget_sections
      ADD CONSTRAINT budget_sections_kind_check
      CHECK (kind IN ('custom', 'commission', 'insurance', 'contingency', 'cogs'));
  END IF;
END$$;

-- One formula section of each kind per tour ('custom' is unconstrained).
CREATE UNIQUE INDEX IF NOT EXISTS budget_sections_one_formula_per_tour
  ON public.budget_sections (tour_id, kind)
  WHERE kind <> 'custom';

-- ============================================
-- DOWN MIGRATION (manual — uncomment to invert)
-- ============================================
-- DROP INDEX IF EXISTS public.budget_sections_one_formula_per_tour;
-- ALTER TABLE public.budget_sections DROP CONSTRAINT IF EXISTS budget_sections_kind_check;
-- ALTER TABLE public.budget_sections DROP COLUMN IF EXISTS kind;

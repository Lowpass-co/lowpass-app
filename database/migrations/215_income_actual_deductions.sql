-- ============================================
-- LOWPASS — Income: actual_deductions (Income Redesign Phase 1 / Settlement)
-- Migration 215
-- ============================================
--
-- Settlement tracks per-show deductions (reconciled_deductions / day_of_deductions)
-- but they never reached income, so the P&L overstated ACTUAL income. This adds an
-- ACTUAL-only `actual_deductions` to budget_income; the settlement sync writes it
-- and computeBudgetPnl subtracts it from the actual income side.
--
-- It is an ACTUAL (one live tour-level layer) — NOT versioned: it does NOT mirror
-- into budget_version_income and is NOT in the proposed-income lock set.
--
-- Additive, nullable, idempotent.

ALTER TABLE public.budget_income
  ADD COLUMN IF NOT EXISTS actual_deductions NUMERIC;

-- ============================================
-- DOWN MIGRATION (manual — uncomment to roll back)
-- ============================================
-- ALTER TABLE public.budget_income DROP COLUMN IF EXISTS actual_deductions;

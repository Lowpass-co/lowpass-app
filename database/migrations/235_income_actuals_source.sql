-- ============================================
-- LOWPASS — Income actuals provenance (Stage 5)
-- Migration 235
-- ============================================
--
-- Tracks WHERE a budget_income row's actuals came from, so the settlement cascade
-- (Stage 5) never clobbers manually-entered actuals:
--
--   • budget_income.actuals_source — 'manual' | 'settlement'. NULL = untouched
--     (no actuals entered yet).
--       - Manual grid edits to the actual_* fields set actuals_source = 'manual'.
--       - The settlement cascade writes only rows where actuals_source IS NULL or
--         = 'settlement', sets it to 'settlement', and returns a conflict list
--         {routing/show, field, manual value, settlement value} for the 'manual'
--         rows it SKIPPED. The settlement UI surfaces those conflicts with a
--         per-row explicit "overwrite" confirm (which sets the source back to
--         'settlement').
--       - Existing invariant preserved: settlement never null-stomps actuals.
--
-- ACTUALS-side provenance flag (like the actual_* figures + budget_income.
-- locked_fx_rate) → NOT mirrored into budget_version_income.
--
-- Additive, nullable, CHECK-constrained, idempotent. Down-block at the end.

ALTER TABLE public.budget_income
  ADD COLUMN IF NOT EXISTS actuals_source TEXT;

-- Guard the allowed values. DROP + re-ADD so a re-run picks up any edits without
-- erroring on the second paste (no _lp_migrations tracking — must be re-runnable).
ALTER TABLE public.budget_income
  DROP CONSTRAINT IF EXISTS budget_income_actuals_source_check;
ALTER TABLE public.budget_income
  ADD CONSTRAINT budget_income_actuals_source_check
  CHECK (actuals_source IS NULL OR actuals_source IN ('manual', 'settlement'));

-- ============================================
-- DOWN MIGRATION (manual — uncomment to roll back)
-- ============================================
-- ALTER TABLE public.budget_income DROP CONSTRAINT IF EXISTS budget_income_actuals_source_check;
-- ALTER TABLE public.budget_income DROP COLUMN IF EXISTS actuals_source;

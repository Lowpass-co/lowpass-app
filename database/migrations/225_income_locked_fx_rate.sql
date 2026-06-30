-- ============================================
-- LOWPASS — Income per-show LOCKED FX rate (Live FX, #currency 2.5)
-- Migration 225
-- ============================================
--
-- Per-show FX handling: while a show is PROJECTED, the P&L converts its native
-- income with the tour's LIVE/current rate (budget_fx_rates, refreshable from the
-- existing /api/budget/exchange-rate vendor — no new vendor). Once the show
-- SETTLES (actuals cascade in from settlement → reconciled), the rate is LOCKED to
-- whatever it was at settlement time and frozen on the row, so the realised income
-- never moves with later market drift.
--
--   • budget_income.locked_fx_rate — 1 <show currency> = rate <tour currency>,
--     captured at settlement (lock-on-actual). NULL = not yet locked → the P&L
--     uses the live rate. A tour-currency / rate-less show locks 1:1 (never 0).
--
-- ACTUALS-side + a conversion assumption (like the actual_* settlement figures and
-- the unversioned budget_fx_rates) → NOT mirrored into budget_version_income.
--
-- Additive, nullable, idempotent. Down-block at the end.

ALTER TABLE public.budget_income
  ADD COLUMN IF NOT EXISTS locked_fx_rate NUMERIC;

-- ============================================
-- DOWN MIGRATION (manual — uncomment to roll back)
-- ============================================
-- ALTER TABLE public.budget_income DROP COLUMN IF EXISTS locked_fx_rate;

-- ============================================
-- LOWPASS — Budget merch COGS % (Stage 3 — P&L)
-- Migration 201
-- ============================================
--
-- Adds budget_settings.merch_cogs_pct — the cost-of-goods-sold rate
-- applied to merch income in the P&L waterfall (merch net = merch −
-- merch × merch_cogs_pct). Stored as a fraction (0.30 = 30%), matching
-- the existing insurance_pct / contingency_pct / accountancy_pct columns
-- on the same table.
--
-- budget_settings already exists (migration 017) with workspace-scoped
-- RLS; adding a column inherits that policy set, so no RLS changes are
-- needed here. Idempotent (ADD COLUMN IF NOT EXISTS). Down block below.
-- ============================================

ALTER TABLE public.budget_settings
  ADD COLUMN IF NOT EXISTS merch_cogs_pct NUMERIC NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.budget_settings.merch_cogs_pct IS
  'Cost-of-goods-sold rate on merch income, as a fraction (0.30 = 30%). Stage 3 P&L.';

-- ============================================
-- DOWN MIGRATION (manual — uncomment to invert)
-- ============================================
-- ALTER TABLE public.budget_settings DROP COLUMN IF EXISTS merch_cogs_pct;

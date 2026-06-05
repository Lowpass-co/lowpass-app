-- ============================================
-- LOWPASS — Budget overhead bases (Stage 3 finishing — Phase 1)
-- Migration 202
-- ============================================
--
-- Makes the base each overhead % applies to configurable, defaulting to
-- Adam's GN-sheet convention:
--   insurance_basis    'income_gross'              (insurance = % of gross income)
--   contingency_basis  'expenses_pre_contingency'  (contingency = % of expenses
--                                                    BEFORE contingency itself)
--   accountancy_basis  'income_gross'
--
-- Vocabulary (resolved in src/lib/budget/computeBudgetPnl.ts):
--   income_gross              = Σ guarantees + overage + merch + VIP
--   expenses_total            = Σ line-item actuals + commissions + insurance + contingency
--   expenses_pre_contingency  = Σ line-item actuals + commissions + insurance
--
-- budget_settings already exists (migration 017) with workspace-scoped
-- RLS; adding columns inherits that policy set. Idempotent. Down block.
-- ============================================

ALTER TABLE public.budget_settings
  ADD COLUMN IF NOT EXISTS insurance_basis   TEXT NOT NULL DEFAULT 'income_gross',
  ADD COLUMN IF NOT EXISTS contingency_basis TEXT NOT NULL DEFAULT 'expenses_pre_contingency',
  ADD COLUMN IF NOT EXISTS accountancy_basis TEXT NOT NULL DEFAULT 'income_gross';

COMMENT ON COLUMN public.budget_settings.insurance_basis IS
  'Base for insurance_pct: income_gross | expenses_total | expenses_pre_contingency. Stage 3.';
COMMENT ON COLUMN public.budget_settings.contingency_basis IS
  'Base for contingency_pct: income_gross | expenses_total | expenses_pre_contingency. Stage 3.';
COMMENT ON COLUMN public.budget_settings.accountancy_basis IS
  'Base for accountancy_pct: income_gross | expenses_total | expenses_pre_contingency. Stage 3.';

-- ============================================
-- DOWN MIGRATION (manual — uncomment to invert)
-- ============================================
-- ALTER TABLE public.budget_settings
--   DROP COLUMN IF EXISTS insurance_basis,
--   DROP COLUMN IF EXISTS contingency_basis,
--   DROP COLUMN IF EXISTS accountancy_basis;

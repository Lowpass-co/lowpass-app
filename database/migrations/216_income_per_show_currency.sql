-- ============================================
-- LOWPASS — Income per-show currency (Income Redesign Phase 2)
-- Migration 216
-- ============================================
--
-- Per-show currency so EU shows budget in EUR while the P&L totals in one (tour)
-- currency. Decisions: INCOME_REDESIGN_MAP.md §4 (D-CURRENCY).
--
--   • budget_income.currency        — per-show currency (NULL = tour currency).
--                                     PROPOSED structure → VERSIONED.
--   • budget_version_income.currency — the snapshot mirror (versioning tax).
--   • budget_fx_rates                — per-tour FX map (1 currency = rate tour-ccy).
--                                     UNVERSIONED (a conversion assumption, like the
--                                     Settings overheads), edited in budget Settings.
--
-- Additive, nullable, idempotent. Down-block at the end.

ALTER TABLE public.budget_income
  ADD COLUMN IF NOT EXISTS currency TEXT;

ALTER TABLE public.budget_version_income
  ADD COLUMN IF NOT EXISTS currency TEXT;

-- ---- per-tour FX rates (unversioned conversion assumptions) ----
CREATE TABLE IF NOT EXISTS public.budget_fx_rates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id               UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  workspace_id          UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  currency              TEXT NOT NULL,        -- the show currency (e.g. EUR)
  rate_to_tour_currency NUMERIC NOT NULL,     -- 1 <currency> = rate <tour currency>
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tour_id, currency)
);
CREATE INDEX IF NOT EXISTS budget_fx_rates_tour_idx ON public.budget_fx_rates (tour_id);

ALTER TABLE public.budget_fx_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS budget_fx_rates_select ON public.budget_fx_rates;
CREATE POLICY budget_fx_rates_select
  ON public.budget_fx_rates FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS budget_fx_rates_write ON public.budget_fx_rates;
CREATE POLICY budget_fx_rates_write
  ON public.budget_fx_rates FOR ALL
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());

-- ============================================
-- DOWN MIGRATION (manual — uncomment to roll back)
-- ============================================
-- DROP TABLE IF EXISTS public.budget_fx_rates;
-- ALTER TABLE public.budget_version_income DROP COLUMN IF EXISTS currency;
-- ALTER TABLE public.budget_income DROP COLUMN IF EXISTS currency;

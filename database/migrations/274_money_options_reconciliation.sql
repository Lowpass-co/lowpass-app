-- ============================================
-- LOWPASS — money options from the USA '26 reconciliation
-- Migration 274
-- ============================================
--
-- Paste into the Supabase SQL Editor and Run. Safe to paste twice: every
-- column is ADD … IF NOT EXISTS, every constraint is dropped before it is
-- re-added, the function is CREATE OR REPLACE and the trigger is dropped
-- before it is re-created. Nothing here rewrites existing figures.
--
-- WHY. Reconciling the Charlotte Sands USA '26 P&L against the business
-- manager's (W&A) showed things the budget could not represent, and two
-- places where it silently lost money:
--
--   1. Tour-level income (a support buy-on, a sponsorship) had nowhere to
--      live. Lines with section = 'income' were dropped from expenses AND
--      never added to income. → a new section kind 'income' ("Other income");
--      the trigger below stamps section = 'income' on its lines, so every
--      writer (grid, API, AI) is covered without remembering.
--   2. budget_line_items.locked_fx_rate (migration 234) had no writer, so a
--      £ invoice re-converted at today's rate forever. → the same trigger
--      locks the stored tour rate the first time a FOREIGN-currency line gets
--      an actual. The rate can then be overwritten with what the bank really
--      paid (line-items PATCH).
--   3. Commissions could only take one base. W&A charge agency on show
--      income only and management / business management on show + merch +
--      VIP. → budget_commissions.basis_components (ticked parts) +
--      basis_pre_tax.
--   4. Insurance was a real invoice ($808.81), not a %. → per-overhead
--      mode ('pct' | 'flat'), a flat projected amount, and an actual
--      override for each of insurance / contingency / accountancy.
--   5. The bank's conversion is worse than the market rate. →
--      budget_settings.fx_margin_pct, applied to PROJECTED foreign amounts.
--   6. A refundable damage deposit ($3,500) is money owed back, not a cost.
--      → budget_line_items.refundable_status.
--   7. A tour-level income line may or may not be commissionable. →
--      budget_line_items.income_commissionable.
--
-- SECURITY. The trigger function is SECURITY INVOKER (the default): it only
-- reads budget_sections / tours / budget_fx_rates for the row being written,
-- which RLS already lets the writer see, and only sets columns on NEW.
-- ============================================

-- ---- 3. Commission bases by component -------------------------------------
ALTER TABLE public.budget_commissions
  ADD COLUMN IF NOT EXISTS basis_components TEXT[],
  ADD COLUMN IF NOT EXISTS basis_pre_tax BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.budget_commissions
  DROP CONSTRAINT IF EXISTS budget_commissions_basis_components_check;
ALTER TABLE public.budget_commissions
  ADD CONSTRAINT budget_commissions_basis_components_check
  CHECK (basis_components IS NULL
         OR basis_components <@ ARRAY['show', 'merch', 'vip', 'other']::TEXT[]);

COMMENT ON COLUMN public.budget_commissions.basis_components IS
  'Parts of income this commission is a % of: show | merch | vip | other. NULL = use the single legacy `basis`. (migration 274)';
COMMENT ON COLUMN public.budget_commissions.basis_pre_tax IS
  'With basis_components: measure show income before withholding tax (W&A "commissionable income"). (migration 274)';

-- ---- 4 + 5. Overhead modes, flat amounts, actual overrides, FX margin ------
ALTER TABLE public.budget_settings
  ADD COLUMN IF NOT EXISTS insurance_mode          TEXT NOT NULL DEFAULT 'pct',
  ADD COLUMN IF NOT EXISTS contingency_mode        TEXT NOT NULL DEFAULT 'pct',
  ADD COLUMN IF NOT EXISTS accountancy_mode        TEXT NOT NULL DEFAULT 'pct',
  ADD COLUMN IF NOT EXISTS insurance_flat_amount   NUMERIC,
  ADD COLUMN IF NOT EXISTS contingency_flat_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS accountancy_flat_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS insurance_actual_amount   NUMERIC,
  ADD COLUMN IF NOT EXISTS contingency_actual_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS accountancy_actual_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS fx_margin_pct NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE public.budget_settings DROP CONSTRAINT IF EXISTS budget_settings_overhead_modes_check;
ALTER TABLE public.budget_settings
  ADD CONSTRAINT budget_settings_overhead_modes_check
  CHECK (insurance_mode IN ('pct', 'flat')
     AND contingency_mode IN ('pct', 'flat')
     AND accountancy_mode IN ('pct', 'flat'));

ALTER TABLE public.budget_settings DROP CONSTRAINT IF EXISTS budget_settings_fx_margin_check;
ALTER TABLE public.budget_settings
  ADD CONSTRAINT budget_settings_fx_margin_check
  CHECK (fx_margin_pct >= 0 AND fx_margin_pct < 0.5);

COMMENT ON COLUMN public.budget_settings.fx_margin_pct IS
  'Bank conversion margin as a fraction (0.02 = 2%). Applied to PROJECTED foreign amounts only: income × (1 − m), expenses × (1 + m). Actuals use the locked/paid rate. (migration 274)';

-- ---- 6 + 7. Line flags ------------------------------------------------------
ALTER TABLE public.budget_line_items
  ADD COLUMN IF NOT EXISTS refundable_status TEXT,
  ADD COLUMN IF NOT EXISTS income_commissionable BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.budget_line_items DROP CONSTRAINT IF EXISTS budget_line_items_refundable_status_check;
ALTER TABLE public.budget_line_items
  ADD CONSTRAINT budget_line_items_refundable_status_check
  CHECK (refundable_status IS NULL OR refundable_status IN ('pending', 'returned', 'forfeited'));

COMMENT ON COLUMN public.budget_line_items.refundable_status IS
  'NULL = ordinary cost. pending = refundable deposit owed back (kept out of costs); returned = came back (kept out of costs); forfeited = kept by the supplier (counts as a cost). (migration 274)';

-- ---- 1. 'income' section kind ----------------------------------------------
ALTER TABLE public.budget_sections DROP CONSTRAINT IF EXISTS budget_sections_kind_check;
ALTER TABLE public.budget_sections
  ADD CONSTRAINT budget_sections_kind_check
  CHECK (kind IN ('custom', 'commission', 'insurance', 'contingency', 'cogs', 'income'));
-- The existing partial unique index (tour_id, kind) WHERE kind <> 'custom'
-- (migration 203) already allows one 'income' section per tour.

-- ---- 1 + 2. One guard trigger on budget_line_items -------------------------
CREATE OR REPLACE FUNCTION public.lp_budget_line_money_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_kind text;
  v_tour text;
  v_line text;
  v_rate numeric;
BEGIN
  -- (1) Lines in an 'income' section ARE income (isIncomeRow reads `section`).
  IF NEW.section_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.section_id IS DISTINCT FROM OLD.section_id) THEN
    SELECT s.kind INTO v_kind FROM public.budget_sections s WHERE s.id = NEW.section_id;
    IF v_kind = 'income' THEN
      NEW.section := 'income';
    ELSIF NEW.section = 'income' THEN
      NEW.section := NULL;
    END IF;
  ELSIF TG_OP = 'UPDATE'
     AND NEW.section_id IS NULL AND OLD.section_id IS NOT NULL
     AND NEW.section = 'income'
     AND NEW.section IS NOT DISTINCT FROM OLD.section THEN
    -- Moved to Uncategorised (or its section was deleted — ON DELETE SET NULL
    -- runs this trigger): the grid now shows it among costs, so it is one.
    -- Legacy income rows (section = 'income', never a section_id) never
    -- take this path.
    NEW.section := NULL;
  END IF;

  -- (2) Lock the FX rate of a FOREIGN-currency line when it first actualizes.
  IF TG_OP = 'UPDATE' THEN
    -- A changed currency invalidates a lock (unless this same write sets a
    -- rate explicitly); an actual CLEARED by this write releases it. A rate
    -- typed before any actual exists is kept.
    IF NEW.currency IS DISTINCT FROM OLD.currency
       AND NEW.locked_fx_rate IS NOT DISTINCT FROM OLD.locked_fx_rate THEN
      NEW.locked_fx_rate := NULL;
    END IF;
    IF COALESCE(NEW.actual_cost, 0) = 0
       AND COALESCE(OLD.actual_cost, 0) <> 0
       AND NEW.locked_fx_rate IS NOT DISTINCT FROM OLD.locked_fx_rate THEN
      NEW.locked_fx_rate := NULL;
    END IF;
  END IF;

  IF NEW.locked_fx_rate IS NULL AND COALESCE(NEW.actual_cost, 0) <> 0 THEN
    SELECT upper(t.currency) INTO v_tour FROM public.tours t WHERE t.id = NEW.tour_id;
    v_line := upper(NULLIF(trim(COALESCE(NEW.currency, '')), ''));
    IF v_tour IS NOT NULL AND v_line IS NOT NULL AND v_line <> v_tour THEN
      SELECT r.rate_to_tour_currency INTO v_rate
        FROM public.budget_fx_rates r
       WHERE r.tour_id = NEW.tour_id AND upper(r.currency) = v_line
       LIMIT 1;
      IF v_rate IS NOT NULL AND v_rate > 0 THEN
        NEW.locked_fx_rate := v_rate;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lp_budget_line_money_guard ON public.budget_line_items;
CREATE TRIGGER lp_budget_line_money_guard
  BEFORE INSERT OR UPDATE ON public.budget_line_items
  FOR EACH ROW EXECUTE FUNCTION public.lp_budget_line_money_guard();

-- ============================================
-- DOWN MIGRATION (manual — uncomment to roll back)
-- ============================================
-- DROP TRIGGER IF EXISTS lp_budget_line_money_guard ON public.budget_line_items;
-- DROP FUNCTION IF EXISTS public.lp_budget_line_money_guard();
-- ALTER TABLE public.budget_sections DROP CONSTRAINT IF EXISTS budget_sections_kind_check;
-- ALTER TABLE public.budget_sections ADD CONSTRAINT budget_sections_kind_check
--   CHECK (kind IN ('custom', 'commission', 'insurance', 'contingency', 'cogs'));
-- ALTER TABLE public.budget_line_items DROP CONSTRAINT IF EXISTS budget_line_items_refundable_status_check;
-- ALTER TABLE public.budget_line_items DROP COLUMN IF EXISTS refundable_status,
--   DROP COLUMN IF EXISTS income_commissionable;
-- ALTER TABLE public.budget_settings DROP CONSTRAINT IF EXISTS budget_settings_overhead_modes_check;
-- ALTER TABLE public.budget_settings DROP CONSTRAINT IF EXISTS budget_settings_fx_margin_check;
-- ALTER TABLE public.budget_settings
--   DROP COLUMN IF EXISTS insurance_mode, DROP COLUMN IF EXISTS contingency_mode,
--   DROP COLUMN IF EXISTS accountancy_mode, DROP COLUMN IF EXISTS insurance_flat_amount,
--   DROP COLUMN IF EXISTS contingency_flat_amount, DROP COLUMN IF EXISTS accountancy_flat_amount,
--   DROP COLUMN IF EXISTS insurance_actual_amount, DROP COLUMN IF EXISTS contingency_actual_amount,
--   DROP COLUMN IF EXISTS accountancy_actual_amount, DROP COLUMN IF EXISTS fx_margin_pct;
-- ALTER TABLE public.budget_commissions DROP CONSTRAINT IF EXISTS budget_commissions_basis_components_check;
-- ALTER TABLE public.budget_commissions DROP COLUMN IF EXISTS basis_components,
--   DROP COLUMN IF EXISTS basis_pre_tax;

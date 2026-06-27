-- ============================================
-- LOWPASS — Income ACTUALS enrichment (#24)
-- Migration 221
-- ============================================
--
-- Close the Projected/Actual asymmetry. Projected derives everything from
-- Cap × Sell-thru × Face; Actual jumped straight to the money. Add REAL settled
-- attendance + gross box office so you get true sell-through and a real gross,
-- driving variance. (Decisions LOCKED: ACTUALS_ENRICHMENT_MAP.md + Stage-B brief.)
--
-- Model (b) — settlement-authoritative. These fields are INFORMATIONAL CONTEXT:
-- they NEVER enter income_gross / computeBudgetPnl (the actual money columns —
-- actual_overage/merch/vip/deductions — stay exactly as today). The projection
-- engine (incomeProjection.ts) is not touched.
--
--   • budget_income.actual_tickets_sold — real paid attendance (grid-entered, or
--                                          settlement-cascaded).
--   • budget_income.actual_gross        — real gross box office (native ccy;
--                                          grid-entered, or settlement-cascaded).
--   • budget_income.actual_capacity     — real settled sellable cap after
--                                          kills/holds (D3, Adam override: grid-
--                                          entry ONLY — settlement doesn't carry it).
--                                          Sell-through = actual_tickets_sold / actual_capacity.
--
--   • settlement.{day_of,reconciled}_tickets_sold / _gross — so a settlement
--     captures them and the existing settlement→income cascade copies them
--     (preferring reconciled over day-of), exactly like actual_deductions (215).
--
-- ACTUAL-ONLY → NOT mirrored on budget_version_income (actuals are never
-- versioned / never lock). Additive, nullable, idempotent. Down-block at the end.

-- ---- 1. real actuals on the live income layer ----
ALTER TABLE public.budget_income
  ADD COLUMN IF NOT EXISTS actual_tickets_sold NUMERIC,   -- real paid attendance
  ADD COLUMN IF NOT EXISTS actual_gross        NUMERIC,   -- real gross box office (native ccy)
  ADD COLUMN IF NOT EXISTS actual_capacity     NUMERIC;   -- real settled sellable cap (grid-entry only)

-- ---- 2. settlement capture (day-of + reconciled pairs, mirroring the existing
--         money fields so the cascade can prefer reconciled over day-of) ----
ALTER TABLE public.settlement
  ADD COLUMN IF NOT EXISTS day_of_tickets_sold     NUMERIC,
  ADD COLUMN IF NOT EXISTS reconciled_tickets_sold NUMERIC,
  ADD COLUMN IF NOT EXISTS day_of_gross            NUMERIC,
  ADD COLUMN IF NOT EXISTS reconciled_gross        NUMERIC;

-- (NO budget_version_income change — these are ACTUAL-only and never versioned.)

-- ============================================================
-- DOWN MIGRATION (manual — uncomment to roll back)
-- ============================================================
-- ALTER TABLE public.budget_income
--   DROP COLUMN IF EXISTS actual_tickets_sold,
--   DROP COLUMN IF EXISTS actual_gross,
--   DROP COLUMN IF EXISTS actual_capacity;
-- ALTER TABLE public.settlement
--   DROP COLUMN IF EXISTS day_of_tickets_sold,
--   DROP COLUMN IF EXISTS reconciled_tickets_sold,
--   DROP COLUMN IF EXISTS day_of_gross,
--   DROP COLUMN IF EXISTS reconciled_gross;

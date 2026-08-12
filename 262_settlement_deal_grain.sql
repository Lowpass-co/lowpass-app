-- ============================================
-- LOWPASS — Settlement deal grain (the full settlement process, 2026-08-07)
-- Migration 262 — MONEY-ADJACENT (additive; no existing number moves)
--
-- Upgrades the per-show settlement from a flat guarantee walk to the full
-- deal shape (spec §3): deal terms + box office feed a DEDUCTIONS WATERFALL
--   gross box office → facility/ticket/CC fees → net box office → show
--   expenses → split pool → artist share @ deal % → resolved overage
-- computed in code (walk.ts computeBoxOffice — a pure calculator whose
-- result is APPLIED to reconciled_overage by an explicit click, never
-- silently; guarantee-only deals are untouched, bit-identical).
--
--   1. settlement gains the deal/box-office columns (all nullable — null =
--      the legacy flat-guarantee walk, today's behaviour).
--   2. settlement_deductions.kind widens with the box-office fee kinds
--      (facility_fee | ticket_fees | cc_fees) — these route into the BO
--      waterfall instead of the guarantee-side deductions.
--
-- Idempotent (IF NOT EXISTS / guarded CHECK swap). Down-block at the end.
-- ============================================

-- ── 1. Deal + box-office columns on settlement ─────────────────────
ALTER TABLE public.settlement ADD COLUMN IF NOT EXISTS deal_type text;
ALTER TABLE public.settlement ADD COLUMN IF NOT EXISTS deal_pct numeric;
ALTER TABLE public.settlement ADD COLUMN IF NOT EXISTS bonus_threshold numeric;
ALTER TABLE public.settlement ADD COLUMN IF NOT EXISTS bonus_pct numeric;
ALTER TABLE public.settlement ADD COLUMN IF NOT EXISTS ticket_price numeric;
ALTER TABLE public.settlement ADD COLUMN IF NOT EXISTS ticket_capacity integer;
ALTER TABLE public.settlement ADD COLUMN IF NOT EXISTS comps integer;

-- Deal type vocabulary (mig 003's advance enum, snake_cased). Guarded named
-- CHECK: drop-and-re-add so a re-paste self-corrects.
DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.settlement'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%deal_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.settlement DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;
ALTER TABLE public.settlement
  ADD CONSTRAINT settlement_deal_type_check
  CHECK (deal_type IS NULL OR deal_type IN ('guarantee', 'guarantee_plus', 'door_deal', 'flat', 'festival'));

-- ── 2. Widen the deduction kinds with the BO fee bucket ─────────────
DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.settlement_deductions'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%kind%'
  LOOP
    EXECUTE format('ALTER TABLE public.settlement_deductions DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;
ALTER TABLE public.settlement_deductions
  ADD CONSTRAINT settlement_deductions_kind_check
  CHECK (kind IN ('withholding', 'tax', 'venue_cost', 'commission', 'other',
                  'facility_fee', 'ticket_fees', 'cc_fees'));

-- ============================================
-- DOWN (manual)
-- ALTER TABLE public.settlement DROP CONSTRAINT IF EXISTS settlement_deal_type_check;
-- ALTER TABLE public.settlement
--   DROP COLUMN IF EXISTS deal_type, DROP COLUMN IF EXISTS deal_pct,
--   DROP COLUMN IF EXISTS bonus_threshold, DROP COLUMN IF EXISTS bonus_pct,
--   DROP COLUMN IF EXISTS ticket_price, DROP COLUMN IF EXISTS ticket_capacity,
--   DROP COLUMN IF EXISTS comps;
-- ALTER TABLE public.settlement_deductions DROP CONSTRAINT IF EXISTS settlement_deductions_kind_check;
-- ALTER TABLE public.settlement_deductions
--   ADD CONSTRAINT settlement_deductions_kind_check
--   CHECK (kind IN ('withholding','tax','venue_cost','commission','other'));
-- ============================================

-- ============================================
-- LOWPASS — Payroll canonical rate model (Adam's flat-seven, 2026-08-07)
-- Migration 261 — MONEY-CRITICAL (reconciliation-gated)
--
-- Adam's pin: the rates grid is a FLAT set of always-editable columns —
--   Flat day · Flat tour · Show · Travel · Rehearsal · Press/Radio · Per diem
--   (+ Advance, kept) — no per-person rate_type gating, every filled rate
-- bills independently (sum), with a UI warning when Flat day and a specific
-- day rate are both set. Weekly (a8) and custom workspace types stop LOADING
-- (code-level filter — their rows and amounts are preserved in the DB, they
-- just no longer bill; reversible by removing the filter).
--
-- Day-status model widens (values live in payroll_entries.day_statuses JSONB,
-- no DDL needed): show · travel · rehearsal · promo_radio · off · pd_only ·
-- no_tour.
--   - 'off_travel' (legacy) keeps reading as the travel bucket — no rewrite.
--   - 'off' is NEW: on tour, day off — bills the TRAVEL rate (Adam: "OFF
--     should pay travel rate") and earns per diem.
--   - 'pd_only' is NEW: the one no-fee day on tour — per diem only.
--   - 'no_tour' is the ONLY day that earns no per diem (Adam's ruling).
--   - promo_radio bills the Press/Radio rate when set, else the SHOW rate
--     (the Dillon ruling preserved as the default) — resolved in code.
--
-- This migration:
--   1. widens rate_types.basis CHECK with 'per_assigned_day' (per diem's new
--      basis: every day with an assigned status, i.e. everything but no_tour)
--   2. seeds a9 Press / Radio (fee · per_day_status ['promo_radio'])
--   3. re-points the seeded defaults at the new model:
--        a2 Off/Travel → 'Travel', bills ['off_travel','travel'] (legacy +
--                        new values — code de-dupes buckets, never double-bills)
--        a3 Rehearsal   already ['rehearsal'] (unchanged)
--        a4 Per diem    basis per_active_day → per_assigned_day
--        a6 Day rate    → 'Flat day' (still per_active_day = worked days)
--
-- Idempotent: guarded CHECK swap + fixed seed UUIDs + ON CONFLICT + plain
-- UPDATEs on fixed ids. Down-block at the end.
-- ============================================

-- ── 1. Widen the basis CHECK to allow 'per_assigned_day' ────────────
DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.rate_types'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%basis%'
  LOOP
    EXECUTE format('ALTER TABLE public.rate_types DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

ALTER TABLE public.rate_types
  ADD CONSTRAINT rate_types_basis_check
  CHECK (basis IN ('per_day_status', 'per_active_day', 'flat_once', 'per_week', 'per_assigned_day'));

-- ── 2. Seed Press / Radio (fixed UUID → deterministic) ──────────────
INSERT INTO public.rate_types (id, workspace_id, name, bucket, basis, day_statuses, order_index, is_default)
VALUES
  ('00000000-0000-0000-0000-0000000000a9', NULL, 'Press / Radio', 'fee', 'per_day_status', ARRAY['promo_radio'], 8, true)
ON CONFLICT (id) DO NOTHING;

-- ── 3. Re-point the seeded defaults at the canonical model ──────────
-- a2: Off/Travel → Travel; bills legacy 'off_travel', the new 'travel' AND
-- painted 'off' days (off pays the travel rate). fees.ts de-dupes spellings
-- by count bucket, so listing several values can never double-bill a day.
-- (Re-pastable: if an earlier 261 set ['off_travel','travel'], this corrects.)
UPDATE public.rate_types
SET name = 'Travel', day_statuses = ARRAY['off_travel', 'travel', 'off']
WHERE id = '00000000-0000-0000-0000-0000000000a2'
  AND (name IS DISTINCT FROM 'Travel' OR day_statuses IS DISTINCT FROM ARRAY['off_travel', 'travel', 'off']);

-- a4: Per diem now bills every ASSIGNED day (everything except no_tour) —
-- Adam: "NO TOUR is the only day not paid a PD."
UPDATE public.rate_types
SET basis = 'per_assigned_day'
WHERE id = '00000000-0000-0000-0000-0000000000a4'
  AND basis IS DISTINCT FROM 'per_assigned_day';

-- a6: Day rate → Flat day (Adam's name). Basis unchanged (per_active_day =
-- every WORKED day: show/travel/rehearsal/promo/off — pd_only is not worked).
UPDATE public.rate_types
SET name = 'Flat day'
WHERE id = '00000000-0000-0000-0000-0000000000a6'
  AND name IS DISTINCT FROM 'Flat day';

-- ============================================
-- DOWN (manual)
-- UPDATE public.rate_types SET name = 'Off / Travel', day_statuses = ARRAY['off_travel']
--   WHERE id = '00000000-0000-0000-0000-0000000000a2';
-- UPDATE public.rate_types SET basis = 'per_active_day'
--   WHERE id = '00000000-0000-0000-0000-0000000000a4';
-- UPDATE public.rate_types SET name = 'Day rate'
--   WHERE id = '00000000-0000-0000-0000-0000000000a6';
-- DELETE FROM public.personnel_rate_lines
--   WHERE rate_type_id = '00000000-0000-0000-0000-0000000000a9';
-- DELETE FROM public.rate_types WHERE id = '00000000-0000-0000-0000-0000000000a9';
-- ALTER TABLE public.rate_types DROP CONSTRAINT IF EXISTS rate_types_basis_check;
-- ALTER TABLE public.rate_types
--   ADD CONSTRAINT rate_types_basis_check
--   CHECK (basis IN ('per_day_status', 'per_active_day', 'flat_once', 'per_week'));
-- ============================================

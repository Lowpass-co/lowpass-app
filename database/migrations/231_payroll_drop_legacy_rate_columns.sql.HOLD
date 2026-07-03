-- ============================================
-- LOWPASS — Drop legacy rate columns (Rates SSOT · drop plan §5)
-- Migration 231 — ⛔ WRITTEN BUT NOT APPLIED. DO NOT RUN until production sign-off.
-- ============================================
--
-- After migration 230 (backfill) + the A-W cutover are live and verified in
-- production, these legacy columns are dead: personnel_rate_lines is the sole
-- runtime rate source, and no reader/writer touches them anymore.
--
-- ⛔ APPLY ONLY WHEN ALL OF THESE HOLD (verify with the queries in
--    RATES_SSOT_DISCOVERY_2026-07-03.md §4):
--    • query (b) = 0  — every personnel_rates card has explicit lines
--      (migration 230 applied; add-person seeds lines going forward).
--    • query (a) reconciled — my-schedule crew pay reads the SSOT; the
--      divergent-crew set moved to the correct line-derived figure and was
--      signed off (before/after in the Part A done report).
--    • grep proves zero live readers of personnel_rates.{show,off,rehearsal_rate,
--      per_diem,advance_fee} and tour_personnel.rate_amount remain.
--
-- HARD RULE 3: this drop is a SEPARATE migration from the 230 backfill — never
-- drop a column in the same migration that backfills from it.
--
-- NOTE: tour_personnel.rate_currency / rate_period are KEPT — my-schedule still
-- uses them for currency display + the day-period gate. Only rate_amount goes.
-- ============================================

-- ── personnel_rates: the five legacy rate columns (now carried by lines a1–a6). ──
ALTER TABLE public.personnel_rates DROP COLUMN IF EXISTS show_rate;
ALTER TABLE public.personnel_rates DROP COLUMN IF EXISTS off_rate;
ALTER TABLE public.personnel_rates DROP COLUMN IF EXISTS rehearsal_rate;
ALTER TABLE public.personnel_rates DROP COLUMN IF EXISTS per_diem;
ALTER TABLE public.personnel_rates DROP COLUMN IF EXISTS advance_fee;
-- NB: internal_rate is NOT dropped — it's the admin-only company cost, its own
-- path, never a rate type.

-- ── tour_personnel: the competing single-rate value (my-schedule now reads SSOT). ──
ALTER TABLE public.tour_personnel DROP COLUMN IF EXISTS rate_amount;

/* ============================================================
   DOWN MIGRATION (manual)
   ----------------------------------------------------------
   -- Re-add the columns (data is NOT recoverable from this migration — it lived in
   -- personnel_rate_lines after 230). Restore values from a backup if needed.
   -- ALTER TABLE public.personnel_rates ADD COLUMN show_rate numeric;
   -- ALTER TABLE public.personnel_rates ADD COLUMN off_rate numeric;
   -- ALTER TABLE public.personnel_rates ADD COLUMN rehearsal_rate numeric;
   -- ALTER TABLE public.personnel_rates ADD COLUMN per_diem numeric;
   -- ALTER TABLE public.personnel_rates ADD COLUMN advance_fee numeric;
   -- ALTER TABLE public.tour_personnel ADD COLUMN rate_amount numeric;
   ============================================================ */

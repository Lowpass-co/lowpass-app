-- ============================================
-- LOWPASS — Rates SSOT completion backfill (Part A · A-M/A-B)
-- Migration 230 — MONEY-CRITICAL (reconciliation-gated by RATES_SSOT_DISCOVERY_2026-07-03)
-- ============================================
--
-- Makes personnel_rate_lines the SOLE runtime rate source. Migration 228 seeded
-- lines for every personnel_rates card that existed then; 229 corrected day_rate
-- cards onto the a6 flat line. Cards created SINCE (add-person / roster-add) have
-- no lines and are computed by the transitional fallback in loadRateLines
-- (rateLinesFor → ratesToLines(legacy columns)). This migration gives those
-- card-only people explicit lines so the fallback becomes inert.
--
-- MONEY SAFETY — ZERO MOVEMENT BY CONSTRUCTION:
--   We seed each card's lines FROM ITS OWN LEGACY COLUMNS (show_rate → a1, etc.),
--   the exact source the fallback already computes from. So computeTotals over the
--   seeded lines === the number the card produces today via the fallback, for
--   every card. We do NOT seed from personnel.standard_rates here — a card whose
--   show_rate was hand-set (e.g. Add-person's rate_amount) would otherwise shift
--   to the library default. (standard_rates seeding is for NEW people only, in the
--   A-W add-person route.) SSOT wins on conflict: ON CONFLICT DO NOTHING never
--   overwrites an already-populated line.
--
-- Mirrors 228 §4 (five split defaults from legacy cols) + 229 §2 (day_rate → a6,
-- drop a1/a2/a3). Idempotent + re-runnable. Additive only — NO column drops (those
-- are migration 231, held for sign-off). Down-block at the end.
-- ============================================

-- ── 1. Seed the five split defaults (a1–a5) from each card's legacy columns. ──
-- ON CONFLICT DO NOTHING → only fills cards missing a line; never overwrites.
INSERT INTO public.personnel_rate_lines (tour_id, workspace_id, personnel_rate_id, rate_type_id, amount)
SELECT pr.tour_id, pr.workspace_id, pr.id, seed.rate_type_id, seed.amount
FROM public.personnel_rates pr
CROSS JOIN LATERAL (VALUES
  ('00000000-0000-0000-0000-0000000000a1'::uuid, pr.show_rate),
  ('00000000-0000-0000-0000-0000000000a2'::uuid, pr.off_rate),
  ('00000000-0000-0000-0000-0000000000a3'::uuid, pr.rehearsal_rate),
  ('00000000-0000-0000-0000-0000000000a4'::uuid, pr.per_diem),
  ('00000000-0000-0000-0000-0000000000a5'::uuid, pr.advance_fee)
) AS seed(rate_type_id, amount)
ON CONFLICT (personnel_rate_id, rate_type_id) DO NOTHING;

-- ── 2. Corrective day_rate backfill (229's logic, for the newly-seeded cards). ──
DO $$
BEGIN
  -- 2a. a6 Day-rate line = off_rate (the flat daily figure) for day_rate cards.
  INSERT INTO public.personnel_rate_lines (tour_id, workspace_id, personnel_rate_id, rate_type_id, amount)
  SELECT pr.tour_id, pr.workspace_id, pr.id,
         '00000000-0000-0000-0000-0000000000a6'::uuid, pr.off_rate
  FROM public.personnel_rates pr
  WHERE pr.rate_type = 'day_rate'
  ON CONFLICT (personnel_rate_id, rate_type_id) DO NOTHING;

  -- 2b. Drop the split fee lines (Show/Off/Rehearsal) for day_rate cards — they
  --     mis-bill under the rate-lines model. per_diem (a4) + advance (a5) kept.
  DELETE FROM public.personnel_rate_lines l
  USING public.personnel_rates pr
  WHERE l.personnel_rate_id = pr.id
    AND pr.rate_type = 'day_rate'
    AND l.rate_type_id IN (
      '00000000-0000-0000-0000-0000000000a1'::uuid,  -- Show
      '00000000-0000-0000-0000-0000000000a2'::uuid,  -- Off / Travel
      '00000000-0000-0000-0000-0000000000a3'::uuid   -- Rehearsal
    );
END $$;

-- ── 3. Count report (run these SELECTs after applying; expect the first to be 0). ──
-- Cards STILL without any line after the backfill (should be 0 — every card seeded):
--   SELECT count(*) AS cards_without_lines
--   FROM public.personnel_rates pr
--   WHERE NOT EXISTS (SELECT 1 FROM public.personnel_rate_lines l WHERE l.personnel_rate_id = pr.id);
-- Lines seeded by this migration (informational):
--   SELECT count(*) AS total_lines FROM public.personnel_rate_lines;

/* ============================================================
   DOWN MIGRATION (manual)
   ----------------------------------------------------------
   -- This backfill is additive + idempotent; a full revert isn't generally safe
   -- (it can't distinguish 228/229-seeded lines from 230-seeded ones). If you must
   -- undo the day_rate correction for a specific tour, mirror 229's down-block.
   -- The legacy personnel_rates.* columns are intact (not dropped here), so the
   -- fallback still works if all lines were removed.
   ============================================================ */

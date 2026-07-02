-- ============================================
-- LOWPASS — payroll "Day rate" rate type + corrective backfill (b2 UI phase)
-- Migration 229
-- ============================================
--
-- The day_rate fork (Adam: keep day_rate as a real flat-daily type; no money moves):
--
-- generate's computeWeekFeeAndPerDiem bills a `day_rate` person FLAT — active days
-- × off_rate, ignoring show_rate. But migration 228's backfill seeded those people
-- with the SPLIT Show(a1)/Off(a2)/Rehearsal(a3) fee lines, so a rate-lines switch
-- would move their money (show days would suddenly bill at show_rate).
--
-- Fix: a 6th default rate type "Day rate" (a6) with basis per_active_day — which
-- computeTotals sums as amount × active_days, i.e. EXACTLY generate's flat total.
-- Then re-seed the day_rate people onto a6 = off_rate and remove their a1/a2/a3
-- split fee lines. per_diem (a4) + advance (a5) are unchanged; split_rate people
-- are untouched.
--
-- Idempotent (ON CONFLICT / guarded deletes) — safe to re-run. Down-block at end.
-- ============================================

-- ── 1. The 6th default rate type: Day rate (flat per active day). ──
INSERT INTO public.rate_types (id, workspace_id, name, bucket, basis, day_statuses, order_index, is_default)
VALUES
  ('00000000-0000-0000-0000-0000000000a6', NULL, 'Day rate', 'fee', 'per_active_day', '{}', 5, true)
ON CONFLICT (id) DO NOTHING;

-- ── 2. Corrective backfill for day_rate personnel_rates rows. ──
DO $$
BEGIN
  -- 2a. Insert the a6 Day-rate line = off_rate for every day_rate person.
  --     (off_rate is the flat daily figure generate already billed on.)
  INSERT INTO public.personnel_rate_lines (tour_id, workspace_id, personnel_rate_id, rate_type_id, amount)
  SELECT pr.tour_id, pr.workspace_id, pr.id,
         '00000000-0000-0000-0000-0000000000a6'::uuid, pr.off_rate
  FROM public.personnel_rates pr
  WHERE pr.rate_type = 'day_rate'
  ON CONFLICT (personnel_rate_id, rate_type_id) DO NOTHING;

  -- 2b. Remove the split fee lines (Show/Off/Rehearsal) 228 wrongly seeded for
  --     them — they double-count / mis-bill under the rate-lines model. Their
  --     per_diem (a4) + advance (a5) lines are kept.
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

/* ============================================================
   DOWN MIGRATION (manual)
   ----------------------------------------------------------
   -- Restore the split lines for day_rate people from the legacy columns, then
   -- drop the a6 lines + the a6 type. Only safe if the legacy personnel_rates.*
   -- columns are still intact (they are — frozen, not dropped, in this phase).
   --
   -- INSERT INTO public.personnel_rate_lines (tour_id, workspace_id, personnel_rate_id, rate_type_id, amount)
   -- SELECT pr.tour_id, pr.workspace_id, pr.id, seed.rate_type_id, seed.amount
   -- FROM public.personnel_rates pr
   -- CROSS JOIN LATERAL (VALUES
   --   ('00000000-0000-0000-0000-0000000000a1'::uuid, pr.show_rate),
   --   ('00000000-0000-0000-0000-0000000000a2'::uuid, pr.off_rate),
   --   ('00000000-0000-0000-0000-0000000000a3'::uuid, pr.rehearsal_rate)
   -- ) AS seed(rate_type_id, amount)
   -- WHERE pr.rate_type = 'day_rate'
   -- ON CONFLICT (personnel_rate_id, rate_type_id) DO NOTHING;
   --
   -- DELETE FROM public.personnel_rate_lines
   --   WHERE rate_type_id = '00000000-0000-0000-0000-0000000000a6';
   -- DELETE FROM public.rate_types WHERE id = '00000000-0000-0000-0000-0000000000a6';
   ============================================================ */

-- 232_fix_day_rate_ssot_seed.sql
-- ---------------------------------------------------------------------------
-- APPLIED 2026-07-03 (Adam, Supabase SQL editor). This file reflects what was
-- actually run: the BLANKET correction (all divergent day_rate crew adopt
-- rate_amount), confirmed against prod afterward.
--
-- BACKGROUND: the rate engine is rich — each person has a SET of
-- personnel_rate_lines by rate_type (Show a1, Off/Travel a2, Rehearsal a3,
-- Per-diem a4, Advance a5, Day rate a6, + custom types), summed by computeTotals
-- per `basis` (per_day_status | per_active_day | flat_once). A `day_rate` person
-- has a1/a2/a3 removed (mig 229) and bills the flat a6 line on active days;
-- a `split_rate` person keeps a1/a2/a3 and has a6 = NULL. a4/a5 exist for BOTH
-- and are NOT touched here.
--
-- BUG: mig 229/230 seeded a6 from personnel_rates.off_rate. For crew whose rate
-- only ever landed in tour_personnel.rate_amount (typed into the Add-person form;
-- the Payroll grid silently dropped typed edits — data-integrity Phase P), off_rate
-- was 0, so a6 = 0. Budget + payroll (computeTotals reads a6) therefore UNDER-COUNTED
-- these crew (e.g. a £1,250/day tech contributing £0 to salary).
--
-- FIX: for every `day_rate` card whose a6 fee line diverges from rate_amount, set
-- a6 (and legacy off_rate, until 231 drops it) = rate_amount. Adam approved adopting
-- rate_amount for all 8 divergent day-rate crew. Budget salary on affected tours
-- rises by design — it was understated.
--
-- ⚠️ KNOWN RESIDUAL — Dillon Raffaele Francis Jordan (the rate_amount=200 card):
--   he is a SPLIT person mis-filed as day_rate (real rates Show 200 / Off-Travel 0 /
--   Rehearsal 100). This migration flattened him to a6=200, which OVER-bills his
--   travel/rehearsal days. He must be reclassified to split_rate with a1/a2/a3 lines
--   in the Payroll grid AFTER the grid-commit fix (data-integrity Phase P) ships.
--   His a1/a2/a3 were deleted by mig 229, so the grid must recreate them. TRACKED.
--   (His other two cards at 250, and Duncan's 350 day_rate card, are correct.)
--
-- ORDERING: run BEFORE 231 (which drops rate_amount, read here). IDEMPOTENT.
-- Data correction — down block is a documented no-op.
-- ---------------------------------------------------------------------------

begin;

-- 1. Correct the a6 (Day rate) fee line for divergent day_rate cards -> rate_amount.
update personnel_rate_lines l
set amount = tp.rate_amount
from personnel_rates pr
join tour_personnel tp on tp.id = pr.tour_personnel_id
where l.personnel_rate_id = pr.id
  and l.rate_type_id = '00000000-0000-0000-0000-0000000000a6'
  and pr.rate_type = 'day_rate'
  and tp.rate_amount is not null
  and coalesce(l.amount, 0) <> tp.rate_amount;

-- 2. Insert an a6 line for any day_rate card that lacks one entirely.
insert into personnel_rate_lines (tour_id, personnel_rate_id, rate_type_id, amount)
select pr.tour_id, pr.id, '00000000-0000-0000-0000-0000000000a6', tp.rate_amount
from personnel_rates pr
join tour_personnel tp on tp.id = pr.tour_personnel_id
where pr.rate_type = 'day_rate'
  and tp.rate_amount is not null
  and not exists (
    select 1 from personnel_rate_lines l
    where l.personnel_rate_id = pr.id
      and l.rate_type_id = '00000000-0000-0000-0000-0000000000a6'
  );

-- 3. Keep the legacy off_rate column consistent until 231 drops it.
update personnel_rates pr
set off_rate = tp.rate_amount
from tour_personnel tp
where tp.id = pr.tour_personnel_id
  and pr.rate_type = 'day_rate'
  and tp.rate_amount is not null
  and coalesce(pr.off_rate, 0) <> tp.rate_amount;

commit;

-- DOWN (no-op): data correction; the prior zeros were incorrect. To revert
-- intentionally, re-seed a6/off_rate to 0 for the affected day_rate cards.

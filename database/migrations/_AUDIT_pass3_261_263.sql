-- ============================================================================
-- LOWPASS — migration audit, PASS 3: the outstanding pastes (261 / 262 / 263).
-- Read-only. Nothing here writes.
--
-- Passes 1 and 2 settled everything through 260. Recorded so nobody re-asks:
-- 241, 255 (all four steps), 256, 257, 258, 259, 260 are ALL APPLIED. The
-- 2026-08-09 handoff listed 241/257/259/260 as "possibly outstanding" — they
-- are not, they are in. Only these three were unmeasured.
--
-- ORDERING HAZARD, repeated because it is the kind of thing that gets lost:
-- **NEVER RE-PASTE 258 AFTER 263.** 258 seeds the old rider template field set;
-- 263 replaces it with the rider-centric catalog. Re-running 258 afterwards
-- silently reverts 263. 258 shows APPLIED in pass 1 — correct and historical.
--
-- ── TWO CHECKS CORRECTED 2026-08-09, both false positives ──────────────────
-- The 261 checks as first drafted would have reported APPLIED whether or not
-- 261 was ever pasted. Verified against 261_payroll_canonical_rates.sql:
--
--   261b tested for 'per_day_status' in the basis CHECK. That value was
--        ALREADY in the pre-261 constraint — the down-block at :103 restores
--        CHECK (basis IN ('per_day_status','per_active_day','flat_once',
--        'per_week')) and there it is. The value 261 ADDS is
--        'per_assigned_day' (:57). Testing the wrong one cannot discriminate.
--
--   261c tested name ILIKE '%travel%' on a2. 261's UPDATE (:71-73) is guarded
--        `AND (name IS DISTINCT FROM 'Travel' OR day_statuses IS DISTINCT
--        FROM ARRAY['off_travel','travel','off'])`, and its own comment warns
--        an earlier partial paste may have set ['off_travel','travel'] — i.e.
--        a row can already be named Travel with the WRONG statuses. The
--        discriminating fact is the day_statuses array, specifically that it
--        now includes 'off'. Name is not evidence.
--
-- The lesson generalises: an audit assertion must test what the migration
-- CHANGES, not what it happens to mention. A check that passes against the
-- pre-state is worse than no check, because it retires the question.
-- ============================================================================

select * from (

-- ── 261: payroll canonical flat-seven rates ────────────────────────────────
select '261a' as migration, 'rate_type ...a9 (Press / Radio) seeded' as artifact,
       exists(select 1 from public.rate_types
              where id = '00000000-0000-0000-0000-0000000000a9') as present

union all
-- CORRECTED: per_assigned_day is the value 261 adds. per_day_status pre-dates it.
select '261b', 'rate_types.basis CHECK accepts per_assigned_day (NEW in 261)',
       exists(select 1 from pg_constraint
              where conrelid='public.rate_types'::regclass and contype='c'
                and pg_get_constraintdef(oid) ilike '%per_assigned_day%')

union all
-- CORRECTED: the array is the discriminator, not the name. 'off' is the tell —
-- a partial earlier paste leaves ['off_travel','travel'] without it.
select '261c', 'a2 travel model carries off_travel + travel + off',
       exists(select 1 from public.rate_types
              where id = '00000000-0000-0000-0000-0000000000a2'
                and day_statuses @> ARRAY['off_travel','travel','off']
                and array_length(day_statuses, 1) = 3)

union all
-- ADDED 2026-08-09, same reasoning that motivated checking all seven of 262's
-- columns. 261 changes a4's basis in a SEPARATE statement (:77-80) from the
-- CHECK widening (:55-57). Under autocommit-per-statement the CHECK can land
-- and the UPDATE not, so 261b passing does not imply a4 moved. This is the
-- other half of 'per_assigned_day' — the constraint ALLOWS it, this asserts
-- something actually USES it.
select '261d', 'a4 Per diem basis moved to per_assigned_day (every day but no_tour)',
       exists(select 1 from public.rate_types
              where id = '00000000-0000-0000-0000-0000000000a4'
                and basis = 'per_assigned_day')

-- ── 262: settlement deal grain ─────────────────────────────────────────────
-- Seven ADD COLUMNs on public.settlement (262 also touches
-- settlement_deductions, but these seven are the deal grain that feeds
-- computeBoxOffice and the waterfall). All seven checked, not one: a partial
-- paste is exactly what the autocommit-per-statement editor produces.
union all
select '262', 'settlement has all 7 deal-grain columns',
       (select count(*) from information_schema.columns
        where table_schema='public' and table_name='settlement'
          and column_name in ('deal_type','deal_pct','bonus_pct','bonus_threshold',
                              'ticket_price','ticket_capacity','comps')) = 7

union all
-- Names the gap inline rather than needing a second query. Reads 'none' when
-- 262 is fully applied, so it is informative in both directions.
select '262-detail', 'missing deal-grain columns: ' || coalesce((
         select string_agg(c.col, ', ' order by c.col)
         from (values ('deal_type'),('deal_pct'),('bonus_pct'),('bonus_threshold'),
                      ('ticket_price'),('ticket_capacity'),('comps')) as c(col)
         where not exists (
           select 1 from information_schema.columns
           where table_schema='public' and table_name='settlement'
             and column_name = c.col)), 'none'),
       (select count(*) from information_schema.columns
        where table_schema='public' and table_name='settlement'
          and column_name in ('deal_type','deal_pct','bonus_pct','bonus_threshold',
                              'ticket_price','ticket_capacity','comps')) = 7

-- ── 263: rider-centric template catalog ────────────────────────────────────
union all
select '263a', 'rider_section_templates has Guest List & Passes',
       exists(select 1 from public.rider_section_templates
              where name = 'Guest List & Passes')

union all
select '263b', 'rider_section_templates has Security & Barricade',
       exists(select 1 from public.rider_section_templates
              where name = 'Security & Barricade')

union all
select '263c', 'rider_section_templates has Catering / Buyout',
       exists(select 1 from public.rider_section_templates
              where name = 'Catering / Buyout')

) t(migration, artifact, present)
order by present nulls last, migration;

-- ============================================================================
-- LOWPASS — migration audit, PASS 2. Read-only. Nothing here writes.
--
-- Pass 1 (_AUDIT_which_2xx_are_applied.sql) auto-generated one check per
-- migration and got 45 right, 2 WRONG, and left 13 unknown. This closes it.
--
-- THE TWO PASS-1 ERRORS, so they don't get inherited as fact:
--
--   236 "col budget_settings.exchange_rate = false"  → FALSE ALARM, INVERTED.
--        236 is `drop_budget_settings_exchange_rate`. Its whole job is to
--        REMOVE that column. Absence means APPLIED. The generator matched an
--        ADD COLUMN elsewhere in the file and pointed the check at a column
--        the migration deletes. Re-checked correctly below.
--
--   245 "table IF = false"                           → GENERATOR BUG, not a result.
--        The regex captured "IF" out of `CREATE TABLE IF NOT EXISTS` because
--        the statement wraps across lines. "table IF" is not a thing. 245's
--        real status was never measured. Re-checked correctly below.
--
-- The 13 NULL rows were data-only, policy-only or constraint-only migrations
-- with no table/column/function to point at. Each gets a bespoke check here.
-- Several are necessarily OUTCOME checks — for a pure data migration, "did it
-- run?" is only answerable as "is the world in the state it would have left?"
-- Those are marked OUTCOME and cannot distinguish "applied" from "was never
-- needed". That is a real limit, not an oversight.
-- ============================================================================

select * from (

-- ── the two corrections ────────────────────────────────────────────────────
select '236' as migration, 'CORRECTED: exchange_rate column is GONE (drop migration)' as artifact,
       not exists(select 1 from information_schema.columns
                  where table_schema='public' and table_name='budget_settings'
                    and column_name='exchange_rate') as present

union all
select '245', 'CORRECTED: table tour_roles + labor_calls.call_time_approx',
       to_regclass('public.tour_roles') is not null
       and exists(select 1 from information_schema.columns
                  where table_schema='public' and table_name='labor_calls'
                    and column_name='call_time_approx')

-- ── policy-only ────────────────────────────────────────────────────────────
union all
select '206', 'policy artist_assets_insert_own on storage.objects',
       exists(select 1 from pg_policies
              where schemaname='storage' and tablename='objects'
                and policyname='artist_assets_insert_own')

-- ── constraint-only ────────────────────────────────────────────────────────
union all
select '208', 'budget_line_items source_entity_type CHECK includes payroll_per_diem',
       exists(select 1 from pg_constraint
              where conrelid='public.budget_line_items'::regclass and contype='c'
                and pg_get_constraintdef(oid) ilike '%payroll_per_diem%')

union all
select '227', 'tour_personnel role_tag CHECK includes management',
       exists(select 1 from pg_constraint
              where conrelid='public.tour_personnel'::regclass and contype='c'
                and conname='tour_personnel_role_tag_check'
                and pg_get_constraintdef(oid) ilike '%management%')

union all
select '242', 'rate_types basis CHECK includes flat/weekly',
       exists(select 1 from pg_constraint
              where conrelid='public.rate_types'::regclass and contype='c'
                and pg_get_constraintdef(oid) ilike '%basis%'
                and (pg_get_constraintdef(oid) ilike '%flat%'
                  or pg_get_constraintdef(oid) ilike '%weekly%'))

-- ── seed data ──────────────────────────────────────────────────────────────
union all
select '229', 'rate_type ...a6 (Day rate) seeded',
       exists(select 1 from public.rate_types
              where id='00000000-0000-0000-0000-0000000000a6')

union all
select '230', 'personnel_rate_lines seeded for rate types a1-a5',
       exists(select 1 from public.personnel_rate_lines
              where rate_type_id in (
                '00000000-0000-0000-0000-0000000000a1',
                '00000000-0000-0000-0000-0000000000a2',
                '00000000-0000-0000-0000-0000000000a3',
                '00000000-0000-0000-0000-0000000000a4',
                '00000000-0000-0000-0000-0000000000a5'))

union all
select '258', 'rider_section_templates fields contain travel_agent',
       exists(select 1 from public.rider_section_templates
              where fields::text ilike '%travel_agent%')

union all
select '259', 'advance_templates fields contain changeover',
       exists(select 1 from public.advance_templates
              where fields::text ilike '%changeover%')

union all
select '260', 'budget_template_sections has Catering & Hospitality',
       exists(select 1 from public.budget_template_sections
              where name = 'Catering & Hospitality')

-- ── OUTCOME checks — true means "the world looks post-migration", which is
--    NOT the same as "the migration ran". Read them as such.
union all
select '209', 'OUTCOME: no duplicate receipt_number within a tour',
       not exists(select 1 from public.expense_receipts
                  where receipt_number is not null
                  group by tour_id, receipt_number having count(*) > 1)

union all
select '232', 'OUTCOME: no day-rate line disagrees with tour_personnel.rate_amount',
       not exists(
         select 1 from public.personnel_rate_lines l
         join public.personnel_rates pr on l.personnel_rate_id = pr.id
         join public.tour_personnel tp on tp.id = pr.tour_personnel_id
         where l.rate_type_id='00000000-0000-0000-0000-0000000000a6'
           and pr.rate_type='day_rate' and tp.rate_amount is not null
           and coalesce(l.amount,0) <> tp.rate_amount)

union all
select '233', 'OUTCOME: no Salaries/Salary duplicate section pair remains',
       not exists(
         select 1 from public.budget_sections a
         join public.budget_sections b
           on b.tour_id=a.tour_id and b.workspace_id is not distinct from a.workspace_id
          and b.id <> a.id
         where lower(a.name)='salaries' and lower(b.name)='salary')

union all
select '248', 'OUTCOME: gear rows carry rental provenance (backfill ran)',
       exists(select 1 from public.gear where rental_inventory_id is not null)

-- ── 255 completeness: did the WHOLE paste land, not just the trigger? ───────
union all
select '255a', 'rental_movements.gear_id is NOT NULL',
       exists(select 1 from information_schema.columns
              where table_schema='public' and table_name='rental_movements'
                and column_name='gear_id' and is_nullable='NO')

union all
select '255b', 'rental_movements.rental_inventory_id is NULLABLE',
       exists(select 1 from information_schema.columns
              where table_schema='public' and table_name='rental_movements'
                and column_name='rental_inventory_id' and is_nullable='YES')

union all
select '255c', 'rental_inventory_id FK is ON DELETE SET NULL',
       exists(select 1 from pg_constraint
              where conrelid='public.rental_movements'::regclass and contype='f'
                and confdeltype='n'
                and conname='rental_movements_rental_inventory_id_fkey')

union all
select '255d', 'unique index gear_qr_token_key exists',
       exists(select 1 from pg_indexes
              where schemaname='public' and indexname='gear_qr_token_key')

) t(migration, artifact, present)
order by present nulls first, migration;

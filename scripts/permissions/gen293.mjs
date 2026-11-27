#!/usr/bin/env node
/* Generates database/migrations/293_tour_access_rules.sql (+ its emergency
   down file) from rules.mjs. Run: node scripts/permissions/gen293.mjs
   Never hand-edit the output — change rules.mjs and regenerate. */
import { readFileSync, writeFileSync } from 'node:fs';

const CHECK = process.argv.includes('--check');
const out = (path, text) => {
  if (!CHECK) return writeFileSync(path, text);
  if (readFileSync(path, 'utf8') !== text) {
    console.error(`${path} is out of date — run node scripts/permissions/gen293.mjs`);
    process.exitCode = 1;
  }
};
import { RULES, LEFT_ALONE } from './rules.mjs';

const WS = `workspace_id = (SELECT public.get_my_workspace_id())`;
const MGR = `(SELECT private.is_manager())`;
const can = (area, lvl) => `(SELECT private.tours_i_can('${area}', '${lvl}'))`;

/** Required columns per rule (preflight) and the USING / CHECK expressions. */
function plan(r, opts = {}) {
  const cols = [];
  let read, write; // write applies to INSERT (check), UPDATE (using+check), DELETE (using)
  let selectOnlyExtra = [];
  switch (r.kind) {
    case 'tours':
      cols.push('id', 'workspace_id');
      // Managers' clause first: a just-inserted tour isn't in tours_i_see()'s
      // snapshot yet, and INSERT … RETURNING must pass the read rule.
      read = `(${WS} AND ${MGR}) OR id IN (SELECT private.tours_i_see())`;
      write = `${WS} AND ${MGR}`;
      break;
    case 'routing':
      cols.push('tour_id');
      read = `tour_id IN (SELECT private.tours_i_see())`;
      write = `tour_id IN ${can('schedule', 'edit')}`;
      break;
    case 'tour': {
      cols.push('tour_id');
      if (r.ws) cols.push('workspace_id');
      const readAreas = [r.area, ...(r.read ?? [])];
      read = r.readAnyArea
        ? `tour_id IN (SELECT private.tours_i_see())`
        : readAreas.map((a) => `tour_id IN ${can(a, 'view')}`).join(' OR ');
      write = `tour_id IN ${can(r.area, 'edit')}`;
      if (r.nullTourManager) {
        const nullClause = `(tour_id IS NULL AND ${WS} AND ${MGR})`;
        read = `${read} OR ${nullClause}`;
        write = `${write} OR ${nullClause}`;
      }
      break;
    }
    case 'day':
      cols.push('routing_id');
      read = `routing_id IN (SELECT private.days_i_can('${r.area}', 'view'))`;
      write = `routing_id IN (SELECT private.days_i_can('${r.area}', 'edit'))`;
      break;
    case 'line': {
      cols.push('line_item_id');
      const areas = [r.area, ...(r.also ?? [])];
      read = areas.map((a) => `line_item_id IN (SELECT private.lines_i_can('${a}', 'view'))`).join(' OR ');
      write = areas.map((a) => `line_item_id IN (SELECT private.lines_i_can('${a}', 'edit'))`).join(' OR ');
      break;
    }
    case 'pack':
      cols.push(r.col);
      read = `${r.col} IN (SELECT private.packs_i_can('view'))`;
      write = `${r.col} IN (SELECT private.packs_i_can('edit'))`;
      break;
    case 'settle':
      cols.push('settlement_id');
      read = `settlement_id IN (SELECT private.settlements_i_can('view'))`;
      write = `settlement_id IN (SELECT private.settlements_i_can('edit'))`;
      break;
    case 'via':
      cols.push(r.col);
      read = `${r.col} IN (${r.parent('view')})`;
      write = `${r.col} IN (${r.parent('edit')})`;
      break;
    case 'files': {
      cols.push('workspace_id', 'linked_to_type', 'linked_to_id');
      const f = (lvl) => `${WS} AND (${MGR}
      OR (linked_to_type = 'tour' AND linked_to_id IN ${can('files', lvl)})
      OR (linked_to_type = 'routing' AND linked_to_id IN (SELECT private.days_i_can('files', '${lvl}'))))`;
      read = f('view');
      write = f('edit');
      break;
    }
    case 'persons':
      cols.push('id', 'workspace_id');
      read = `(${WS} AND ${MGR}) OR id IN (SELECT private.my_person_ids()) OR id IN (SELECT private.crew_i_see())`;
      write = `${WS} AND ${MGR}`;
      break;
    case 'artists':
      cols.push('id', 'workspace_id');
      read = `(${WS} AND ${MGR}) OR id IN (SELECT private.artists_i_see())`;
      write = `${WS} AND ${MGR}`;
      break;
    case 'manager':
      cols.push('workspace_id');
      read = `${WS} AND ${MGR}`;
      write = `${WS} AND ${MGR}`;
      if (r.self) { cols.push(r.self); selectOnlyExtra.push(`${r.self} = (SELECT auth.uid())`); }
      break;
    case 'ref':
      cols.push('workspace_id');
      // Shared rows (workspace_id NULL) are the built-ins everyone reads —
      // the default rate types, system budget templates, the mic library.
      // Leaving them out (Nov 2026) emptied Payroll's rate columns. Never
      // writable from a client.
      read = `workspace_id IS NULL OR ${WS}`;
      // 298: a Tour manager edits the workspace's templates + libraries too.
      write = opts.libraryEditors ? `${WS} AND (SELECT private.is_library_editor())` : `${WS} AND ${MGR}`;
      break;
    default:
      throw new Error(`unknown kind ${r.kind} for ${r.table}`);
  }
  if (r.own) { cols.push(r.own); selectOnlyExtra.push(`${r.own} IN (SELECT private.my_person_ids())`); }
  if (selectOnlyExtra.length) read = `${read} OR ${selectOnlyExtra.join(' OR ')}`;
  const indexCols = cols.filter((c) => c !== 'id' && c !== 'linked_to_type' && c !== r.self);
  return { cols: [...new Set(cols)], read, write, indexCols: [...new Set(indexCols)] };
}

const q = (s) => `$q$${s}$q$`;

function block(r, opts = {}) {
  const p = plan(r, opts);
  return `-- ${r.table}: ${r.kind}${r.area ? ` · ${r.area}` : ''}
SELECT private.lp_set_rules('${r.table}', ARRAY[${p.cols.map((c) => `'${c}'`).join(', ')}],
  ${q(p.read)},
  ${q(p.write)});`;
}

const SETTER = `-- One helper sets a table's rules: checks the columns (stops everything if
-- one is missing), drops EVERY existing rule on the table, indexes the
-- columns the rules read, creates lp_select / lp_insert / lp_update / lp_delete.
CREATE OR REPLACE FUNCTION private.lp_set_rules(p_table TEXT, p_cols TEXT[], p_read TEXT, p_write TEXT)
RETURNS TEXT LANGUAGE plpgsql SET search_path = '' AS $fn$
DECLARE r RECORD; missing TEXT; c TEXT;
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN
    RAISE NOTICE '293: table % not found — skipped', p_table;
    RETURN 'skipped';
  END IF;
  SELECT string_agg(x, ', ') INTO missing FROM unnest(p_cols) AS x
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = p_table AND column_name = x);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION '293 stopped, nothing changed: % has no column(s) %', p_table, missing;
  END IF;
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = p_table LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, p_table);
  END LOOP;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);
  FOREACH c IN ARRAY p_cols LOOP
    IF c NOT IN ('id', 'linked_to_type') THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%I)', 'lp_' || p_table || '_' || c || '_idx', p_table, c);
    END IF;
  END LOOP;
  EXECUTE format('CREATE POLICY lp_select ON public.%I FOR SELECT TO authenticated USING (%s)', p_table, p_read);
  EXECUTE format('CREATE POLICY lp_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)', p_table, p_write);
  EXECUTE format('CREATE POLICY lp_update ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', p_table, p_write, p_write);
  EXECUTE format('CREATE POLICY lp_delete ON public.%I FOR DELETE TO authenticated USING (%s)', p_table, p_write);
  RETURN 'ok';
END $fn$;
REVOKE ALL ON FUNCTION private.lp_set_rules(TEXT, TEXT[], TEXT, TEXT) FROM PUBLIC, authenticated;

`;

const covered = RULES.map((r) => r.table);
const header = `-- ============================================================================
-- 293_tour_access_rules.sql — GENERATED by scripts/permissions/gen293.mjs from
-- scripts/permissions/rules.mjs. Do not hand-edit: change rules.mjs, regenerate.
--
-- Permissions, step 3 of 6 — the DATABASE ENFORCES tour access (Nov 2026).
-- Needs 292. Paste ONLY after _REPORT_292_shadow_access.sql shows no LOSES row
-- you didn't expect.
--
-- For every table below: ALL its existing rules are dropped (so no old
-- catch-all rule can be OR'd past the new ones — the 264 lesson) and four
-- are created: lp_select / lp_insert / lp_update / lp_delete, each asking
-- private.tours_i_can (or a parent-set helper) ONCE per query.
--
--   Admin / manager: unchanged — every tour in the workspace.
--   Member: only the tours + areas in tour_access, view or edit; their own
--   crew, room and pay rows always; artist-level riders never.
--
-- One transaction: if any table lacks a column this expects, it stops with
-- a message and NOTHING changes. Tables that don't exist are skipped (NOTICE).
-- Re-runnable: every block drops what it creates.
-- Emergency undo: _DOWN_293_workspace_rules.sql (workspace-only rules, as before).
-- ============================================================================

BEGIN;

-- Persons on tours the caller can see (names on crew calls, rooming, travel).
CREATE OR REPLACE FUNCTION private.crew_i_see()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT tp.person_id FROM public.tour_personnel tp
   WHERE tp.tour_id IN (SELECT private.tours_i_see())
$$;
-- Artists of tours the caller can see.
CREATE OR REPLACE FUNCTION private.artists_i_see()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT t.artist_id FROM public.tours t
   WHERE t.id IN (SELECT private.tours_i_see()) AND t.artist_id IS NOT NULL
$$;
REVOKE ALL ON FUNCTION private.crew_i_see(), private.artists_i_see() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.crew_i_see(), private.artists_i_see() TO authenticated, service_role;

`;

const storage = `-- ---------------------------------------------------------------------------
-- Storage: tour-files — {workspace}/tour/{tour}/… needs Files on that tour;
-- anything else in the workspace folder is admin / manager. (Audit B4: a
-- member could delete any tour file.) Advance packs (advance-packs/…) stay
-- server-only, as before.
-- rider-assets — had NO rules live (uploads broken, audit A1): workspace
-- folder; read by members of the workspace, written by admin / manager or
-- anyone with Production edit somewhere.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "tour_files_select_own_workspace" ON storage.objects;
DROP POLICY IF EXISTS "tour_files_insert_own_workspace" ON storage.objects;
DROP POLICY IF EXISTS "tour_files_update_own_workspace" ON storage.objects;
DROP POLICY IF EXISTS "tour_files_delete_own_workspace" ON storage.objects;
DROP POLICY IF EXISTS lp_tour_files_select ON storage.objects;
DROP POLICY IF EXISTS lp_tour_files_insert ON storage.objects;
DROP POLICY IF EXISTS lp_tour_files_update ON storage.objects;
DROP POLICY IF EXISTS lp_tour_files_delete ON storage.objects;
CREATE POLICY lp_tour_files_select ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'tour-files'
  AND (storage.foldername(name))[1] = (SELECT public.get_my_workspace_id())::text
  AND (${MGR} OR ((storage.foldername(name))[2] = 'tour'
       AND (storage.foldername(name))[3] IN (SELECT x::text FROM private.tours_i_can('files', 'view') x))));
CREATE POLICY lp_tour_files_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'tour-files'
  AND (storage.foldername(name))[1] = (SELECT public.get_my_workspace_id())::text
  AND (${MGR} OR ((storage.foldername(name))[2] = 'tour'
       AND (storage.foldername(name))[3] IN (SELECT x::text FROM private.tours_i_can('files', 'edit') x))));
CREATE POLICY lp_tour_files_update ON storage.objects FOR UPDATE TO authenticated USING (
  bucket_id = 'tour-files'
  AND (storage.foldername(name))[1] = (SELECT public.get_my_workspace_id())::text
  AND (${MGR} OR ((storage.foldername(name))[2] = 'tour'
       AND (storage.foldername(name))[3] IN (SELECT x::text FROM private.tours_i_can('files', 'edit') x))));
CREATE POLICY lp_tour_files_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'tour-files'
  AND (storage.foldername(name))[1] = (SELECT public.get_my_workspace_id())::text
  AND (${MGR} OR ((storage.foldername(name))[2] = 'tour'
       AND (storage.foldername(name))[3] IN (SELECT x::text FROM private.tours_i_can('files', 'edit') x))));

DROP POLICY IF EXISTS lp_rider_assets_select ON storage.objects;
DROP POLICY IF EXISTS lp_rider_assets_write ON storage.objects;
DROP POLICY IF EXISTS lp_rider_assets_update ON storage.objects;
DROP POLICY IF EXISTS lp_rider_assets_delete ON storage.objects;
CREATE POLICY lp_rider_assets_select ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'rider-assets'
  AND (storage.foldername(name))[1] = (SELECT public.get_my_workspace_id())::text);
CREATE POLICY lp_rider_assets_write ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'rider-assets'
  AND (storage.foldername(name))[1] = (SELECT public.get_my_workspace_id())::text
  AND (${MGR} OR EXISTS (SELECT private.tours_i_can('production', 'edit'))));
CREATE POLICY lp_rider_assets_update ON storage.objects FOR UPDATE TO authenticated USING (
  bucket_id = 'rider-assets'
  AND (storage.foldername(name))[1] = (SELECT public.get_my_workspace_id())::text
  AND (${MGR} OR EXISTS (SELECT private.tours_i_can('production', 'edit'))));
CREATE POLICY lp_rider_assets_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'rider-assets'
  AND (storage.foldername(name))[1] = (SELECT public.get_my_workspace_id())::text
  AND (${MGR} OR EXISTS (SELECT private.tours_i_can('production', 'edit'))));

COMMIT;
`;

const report = `
-- ---------------------------------------------------------------------------
-- Read-only check. Expect: every row OK.
-- ---------------------------------------------------------------------------
WITH covered(t) AS (VALUES ${covered.map((t) => `('${t}')`).join(', ')}),
left_alone(t) AS (VALUES ${Object.keys(LEFT_ALONE).map((t) => `('${t}')`).join(', ')}),
present AS (SELECT c.t FROM covered c WHERE to_regclass('public.' || c.t) IS NOT NULL)
SELECT '1 tables with the four lp_ rules only: ' || count(*) FILTER (WHERE ok) || ' of ' || count(*) AS check,
       CASE WHEN bool_and(ok) THEN 'OK' ELSE 'CHECK: ' || string_agg(t, ', ') FILTER (WHERE NOT ok) END AS status
  FROM (SELECT p.t,
               (SELECT count(*) FROM pg_policies x WHERE x.schemaname = 'public' AND x.tablename = p.t) = 4
           AND NOT EXISTS (SELECT 1 FROM pg_policies x WHERE x.schemaname = 'public' AND x.tablename = p.t
                            AND x.policyname NOT IN ('lp_select','lp_insert','lp_update','lp_delete')) AS ok
          FROM present p) s
UNION ALL
SELECT '2 tables skipped (not found)',
       coalesce((SELECT 'INFO: ' || string_agg(c.t, ', ') FROM covered c WHERE to_regclass('public.' || c.t) IS NULL), 'OK')
UNION ALL
SELECT '3 other tables with a tour_id and no tour rule',
       coalesce((SELECT 'CHECK: ' || string_agg(DISTINCT c.table_name, ', ')
                   FROM information_schema.columns c
                  WHERE c.table_schema = 'public' AND c.column_name = 'tour_id'
                    AND c.table_name NOT IN (SELECT t FROM covered) AND c.table_name NOT IN (SELECT t FROM left_alone)
                    AND EXISTS (SELECT 1 FROM information_schema.tables x
                                 WHERE x.table_schema = 'public' AND x.table_name = c.table_name AND x.table_type = 'BASE TABLE')), 'OK')
UNION ALL
SELECT '4 tour-files rules',
       CASE WHEN (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'lp_tour_files_%') = 4
             AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                              AND policyname NOT LIKE 'lp_%' AND coalesce(qual, '') || coalesce(with_check, '') ILIKE '%tour-files%')
            THEN 'OK' ELSE 'CHECK: another tour-files rule exists' END
UNION ALL
SELECT '5 rider-assets rules', CASE WHEN (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND policyname LIKE 'lp_rider_assets_%') = 4 THEN 'OK' ELSE 'CHECK' END;
`;

const sql = header + SETTER + RULES.map(block).join('\n') + '\n\n' + storage + report;
out('database/migrations/293_tour_access_rules.sql', sql);

/* Emergency down: workspace-only rules (what each table had before 293, minus
   the money grants) so admins keep working if 293 misbehaves. Members then
   see the whole workspace again — paste 293 again once fixed. */
function downBlock(r) {
  const t = r.table;
  let scope;
  if (['tour', 'routing'].includes(r.kind)) scope = `tour_id IN (SELECT id FROM public.tours WHERE workspace_id = (SELECT public.get_my_workspace_id()))`;
  else if (r.kind === 'tour' && r.nullTourManager) scope = WS;
  else if (r.kind === 'day') scope = `routing_id IN (SELECT r.id FROM public.routing r JOIN public.tours t ON t.id = r.tour_id WHERE t.workspace_id = (SELECT public.get_my_workspace_id()))`;
  else if (r.kind === 'line') scope = `line_item_id IN (SELECT id FROM public.budget_line_items WHERE workspace_id = (SELECT public.get_my_workspace_id()))`;
  else if (r.kind === 'pack') scope = `${r.col} IN (SELECT id FROM public.rider_packs WHERE workspace_id = (SELECT public.get_my_workspace_id()))`;
  else if (r.kind === 'settle') scope = `settlement_id IN (SELECT id FROM public.settlement WHERE workspace_id = (SELECT public.get_my_workspace_id()))`;
  else if (r.kind === 'via' && r.table === 'stage_plot_items') scope = `stage_plot_id IN (SELECT id FROM public.stage_plots WHERE workspace_id = (SELECT public.get_my_workspace_id()))`;
  else if (r.kind === 'via' && r.table === 'rooms') scope = `hotel_id IN (SELECT id FROM public.hotels WHERE workspace_id = (SELECT public.get_my_workspace_id()))`;
  else if (r.kind === 'via' && r.table === 'room_assignments') scope = `room_id IN (SELECT id FROM public.rooms WHERE workspace_id = (SELECT public.get_my_workspace_id()))`;
  else if (r.kind === 'via' && r.table === 'file_entity_links') scope = `file_id IN (SELECT id FROM public.file_references WHERE workspace_id = (SELECT public.get_my_workspace_id()))`;
  else if (r.kind === 'via' && r.table === 'budget_version_sections') scope = `version_id IN (SELECT id FROM public.budget_versions WHERE workspace_id = (SELECT public.get_my_workspace_id()))`;
  else scope = WS;
  if (r.kind === 'tour' && r.ws && !['routing'].includes(r.kind)) scope = WS;
  return `SELECT private.lp_set_rules('${t}', ARRAY[]::text[], ${q(scope)}, ${q(scope)});`;
}
const down = `-- ============================================================================
-- _DOWN_293_workspace_rules.sql — EMERGENCY ONLY. GENERATED by gen293.mjs.
-- Puts every table 293 touched back on one "same workspace" rule (pre-293
-- behaviour, without the money grants), and tour-files back on its 241 rules.
-- Admins and managers keep working; Members see the whole workspace again.
-- ============================================================================
BEGIN;
${RULES.map(downBlock).join('\n')}
DROP POLICY IF EXISTS lp_tour_files_select ON storage.objects;
DROP POLICY IF EXISTS lp_tour_files_insert ON storage.objects;
DROP POLICY IF EXISTS lp_tour_files_update ON storage.objects;
DROP POLICY IF EXISTS lp_tour_files_delete ON storage.objects;
CREATE POLICY "tour_files_select_own_workspace" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'tour-files' AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text);
CREATE POLICY "tour_files_insert_own_workspace" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'tour-files' AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text);
CREATE POLICY "tour_files_delete_own_workspace" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'tour-files' AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text);
COMMIT;
`;
out('database/migrations/_DOWN_293_workspace_rules.sql', down);
console.log(`293: ${RULES.length} tables, ${sql.length} chars`);

/* 296 — the fix for shared reference rows (Nov 2026). 293 as first pasted
   read reference tables as "your workspace only", hiding the built-in rows
   with no workspace (default rate types → Payroll had no rate columns;
   system budget templates; the mic library). rules.mjs now reads them; 296
   re-applies ONLY the reference tables, for a database that already has 293.
   Generated from the same blocks, so it can't drift from 293. */
const refBlocks = RULES.filter((r) => r.kind === 'ref').map(block).join('\n');
const m296 = `-- ============================================================================
-- 296_shared_reference_rows.sql — GENERATED by scripts/permissions/gen293.mjs
-- (the reference-table blocks of 293). Do not hand-edit.
--
-- Fixes 293: reference tables (rate types, budget / advance / rider / export
-- templates, mic library, venues, gear, …) were readable only for YOUR
-- workspace's rows, so the built-in rows that belong to no workspace vanished:
-- Payroll lost its rate columns (and every fee read £0), new tours lost the
-- system budget templates. Now: everyone reads the built-ins (workspace_id IS
-- NULL) plus their own workspace's rows; only admins / managers write, and
-- never a built-in. Same helper as 293 (re-created here, so 296 stands alone).
-- Re-runnable: every table's rules are dropped and re-made each time.
--
-- DOWN: re-paste the reference blocks from 293 as it was before this fix
-- (git show <commit>^:database/migrations/293_tour_access_rules.sql).
-- ============================================================================
BEGIN;

${SETTER}${refBlocks}

COMMIT;

-- Check: the built-in rate types should be listed (expect 8+ rows).
SELECT id, name FROM public.rate_types WHERE workspace_id IS NULL ORDER BY order_index;
`;
out('database/migrations/296_shared_reference_rows.sql', m296);

/* 298 — the Tour manager tier (Nov 2026, Adam: "levels that allow that, and
   then god tier which is like what I have"). A workspace role between Member
   and Manager: only the tours they're given (tour_access rows — the areas on
   those rows are ignored: every area is EDIT), plus dates & tour details,
   crew, the People on their tours (passports included) and the workspace's
   templates + libraries. Admin stays god tier; Manager is unchanged.
   Everything that already asks tours_i_can / tours_i_see opens for them on
   their tours with no rule change — only the helpers move. */
const ref298 = RULES.filter((r) => r.kind === 'ref').map((r) => block(r, { libraryEditors: true })).join('\n');
const m298 = `-- ============================================================================
-- 298_tour_manager_role.sql — GENERATED by scripts/permissions/gen293.mjs.
-- Do not hand-edit: change gen293.mjs / rules.mjs and regenerate.
--
-- The Tour manager tier (Nov 2026, Adam). Paste AFTER 293 and 296 (re-pasting
-- either later puts their tables back to admin / manager-only writes — paste
-- 298 again after them).
--
--   Admin     — god tier: everything, members, settings, deleting.
--   Manager   — every tour, every area; no members / workspace settings.
--   Tour manager (NEW, role 'tour_manager') — ONLY the tours in their
--     tour_access rows, and on those: every area at EDIT, dates & tour
--     details, crew, the People on those tours (passports, DOB, emergency
--     contacts) and People they add. Plus the workspace's templates and
--     libraries (advance / budget / rider / export templates, gear, mic
--     library, rate types, …). Never: other tours, members, app logins,
--     workspace settings, the AI index, artist-level riders.
--   Member    — unchanged (tour_access areas at view / edit).
--
-- Re-runnable: CREATE OR REPLACE / DROP … IF EXISTS / ADD COLUMN IF NOT EXISTS.
-- DOWN at the end (commented).
-- ============================================================================
BEGIN;

-- 1. The role is allowed (members and invites).
DO $do$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT conname, conrelid::regclass::text AS tbl FROM pg_constraint
            WHERE contype = 'c' AND conrelid IN ('public.workspace_members'::regclass, 'public.workspace_invites'::regclass)
              AND pg_get_constraintdef(oid) ~ '(role|invited_role).*readonly' LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
END $do$;
ALTER TABLE public.workspace_members ADD CONSTRAINT workspace_members_role_check
  CHECK (role IN ('admin', 'manager', 'tour_manager', 'readonly'));
ALTER TABLE public.workspace_invites ADD CONSTRAINT workspace_invites_invited_role_check
  CHECK (invited_role IN ('admin', 'manager', 'tour_manager', 'readonly'));

-- 2. Who made a People record (a Tour manager sees the people they add,
--    before they're on a tour). Kept when the user goes (295's rule).
ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS created_by_user_id UUID
  DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. Helpers. tours_i_can / tours_i_see gain the Tour manager branch; every
--    rule that asks them opens on a Tour manager's tours with no rule change.
CREATE OR REPLACE FUNCTION private.is_tour_manager()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM private.my_membership() me WHERE me.role = 'tour_manager')
$$;

-- Admin, manager or Tour manager: may edit the workspace's templates + libraries.
CREATE OR REPLACE FUNCTION private.is_library_editor()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM private.my_membership() me WHERE me.role IN ('admin','manager','tour_manager'))
$$;

CREATE OR REPLACE FUNCTION private.tours_i_can(p_area TEXT, p_level TEXT DEFAULT 'view')
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT t.id
    FROM public.tours t
    JOIN private.my_membership() me ON me.workspace_id = t.workspace_id
   WHERE me.role IN ('admin','manager')
  UNION
  SELECT t.id
    FROM private.my_membership() me
    JOIN public.tour_access a ON a.member_id = me.member_id
    JOIN public.tours t ON t.workspace_id = me.workspace_id
                       AND (a.tour_id IS NULL OR a.tour_id = t.id)
   WHERE (me.role = 'readonly' AND a.area = p_area AND (p_level = 'view' OR a.level = 'edit'))
      OR me.role = 'tour_manager'
$$;

CREATE OR REPLACE FUNCTION private.tours_i_see()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT t.id
    FROM public.tours t
    JOIN private.my_membership() me ON me.workspace_id = t.workspace_id
   WHERE me.role IN ('admin','manager')
  UNION
  SELECT t.id
    FROM private.my_membership() me
    JOIN public.tour_access a ON a.member_id = me.member_id
    JOIN public.tours t ON t.workspace_id = me.workspace_id
                       AND (a.tour_id IS NULL OR a.tour_id = t.id)
   WHERE me.role IN ('readonly','tour_manager')
$$;

-- The tours the caller RUNS: admin / manager — all; Tour manager — theirs.
CREATE OR REPLACE FUNCTION private.tours_i_manage()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT t.id FROM public.tours t
    JOIN private.my_membership() me ON me.workspace_id = t.workspace_id
   WHERE me.role IN ('admin','manager')
      OR (me.role = 'tour_manager' AND t.id IN (SELECT private.tours_i_see()))
$$;

-- People on the tours the caller runs.
CREATE OR REPLACE FUNCTION private.crew_i_manage()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT tp.person_id FROM public.tour_personnel tp
   WHERE tp.tour_id IN (SELECT private.tours_i_manage())
$$;

REVOKE ALL ON FUNCTION private.is_tour_manager(), private.is_library_editor(),
  private.tours_i_manage(), private.crew_i_manage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_tour_manager(), private.is_library_editor(),
  private.tours_i_manage(), private.crew_i_manage() TO authenticated, service_role;

-- 4. What the app reads: a Tour manager gets every area at edit on their tours.
CREATE OR REPLACE FUNCTION public.my_tour_access(p_tour_id UUID)
RETURNS TABLE (area TEXT, level TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH me AS (SELECT * FROM private.my_membership()),
  tour AS (SELECT t.id FROM public.tours t JOIN me ON me.workspace_id = t.workspace_id WHERE t.id = p_tour_id)
  SELECT a.area, 'edit'::text
    FROM unnest(ARRAY['advance','production','parking','logistics','files',
                      'schedule','budget','receipts','payroll','income']) AS a(area)
   WHERE EXISTS (SELECT 1 FROM tour)
     AND (EXISTS (SELECT 1 FROM me WHERE me.role IN ('admin','manager'))
          OR (EXISTS (SELECT 1 FROM me WHERE me.role = 'tour_manager')
              AND p_tour_id IN (SELECT private.tours_i_see())))
  UNION ALL
  SELECT ta.area, CASE WHEN bool_or(ta.level = 'edit') THEN 'edit' ELSE 'view' END
    FROM me
    JOIN public.tour_access ta ON ta.member_id = me.member_id
   WHERE me.role = 'readonly'
     AND EXISTS (SELECT 1 FROM tour)
     AND (ta.tour_id IS NULL OR ta.tour_id = p_tour_id)
   GROUP BY ta.area
$$;
REVOKE ALL ON FUNCTION public.my_tour_access(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_tour_access(UUID) TO authenticated, service_role;

-- 5. The tour row: a Tour manager edits THEIR tours' details and dates
--    (never creates or deletes a tour, never moves one to another workspace).
DROP POLICY IF EXISTS lp_tm_update ON public.tours;
CREATE POLICY lp_tm_update ON public.tours FOR UPDATE TO authenticated
  USING (id IN (SELECT private.tours_i_manage()) AND (SELECT private.is_tour_manager()))
  WITH CHECK (id IN (SELECT private.tours_i_manage()) AND (SELECT private.is_tour_manager())
              AND ${WS});

-- 6. People: a Tour manager reads + edits the People on their tours and the
--    people they add; adds new ones; never deletes one.
DROP POLICY IF EXISTS lp_tm_select ON public.personnel;
DROP POLICY IF EXISTS lp_tm_insert ON public.personnel;
DROP POLICY IF EXISTS lp_tm_update ON public.personnel;
CREATE POLICY lp_tm_select ON public.personnel FOR SELECT TO authenticated
  USING (${WS} AND (SELECT private.is_tour_manager())
         AND (id IN (SELECT private.crew_i_manage()) OR created_by_user_id = (SELECT auth.uid())));
CREATE POLICY lp_tm_insert ON public.personnel FOR INSERT TO authenticated
  WITH CHECK (${WS} AND (SELECT private.is_tour_manager()) AND created_by_user_id = (SELECT auth.uid()));
CREATE POLICY lp_tm_update ON public.personnel FOR UPDATE TO authenticated
  USING (${WS} AND (SELECT private.is_tour_manager())
         AND (id IN (SELECT private.crew_i_manage()) OR created_by_user_id = (SELECT auth.uid())))
  WITH CHECK (${WS} AND (SELECT private.is_tour_manager()));

-- 7. Invites can make a Tour manager, with their tours.
CREATE OR REPLACE FUNCTION private.tm_invite_access()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_access JSONB; v_inv RECORD;
BEGIN
  -- accept_workspace_invite (292) copies tour access for Members only; this
  -- does the same for a Tour manager the moment their membership is made.
  IF NEW.role <> 'tour_manager' THEN RETURN NEW; END IF;
  SELECT * INTO v_inv FROM public.workspace_invites
   WHERE workspace_id = NEW.workspace_id AND accepted_user_id IS NULL AND invited_role = 'tour_manager'
     AND lower(invited_email) = lower((SELECT u.email FROM auth.users u WHERE u.id = NEW.user_id))
   ORDER BY expires_at DESC LIMIT 1;
  IF v_inv.id IS NULL OR jsonb_typeof(v_inv.initial_access) <> 'array' THEN RETURN NEW; END IF;
  FOR v_access IN SELECT * FROM jsonb_array_elements(v_inv.initial_access) LOOP
    INSERT INTO public.tour_access (workspace_id, member_id, tour_id, area, level, granted_by)
    VALUES (NEW.workspace_id, NEW.id, NULLIF(v_access->>'tour_id', '')::uuid, v_access->>'area', 'edit', v_inv.invited_by_user_id)
    ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION private.tm_invite_access() FROM PUBLIC;
DROP TRIGGER IF EXISTS workspace_members_tm_invite_access ON public.workspace_members;
CREATE TRIGGER workspace_members_tm_invite_access AFTER INSERT ON public.workspace_members
  FOR EACH ROW EXECUTE FUNCTION private.tm_invite_access();

-- 8. Templates + libraries: admin / manager / Tour manager write (the
--    reference tables of 293/296, re-made with that one change).
${SETTER}${ref298}

COMMIT;

-- Check: the four roles are allowed (expect one row each way).
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conname IN ('workspace_members_role_check', 'workspace_invites_invited_role_check');

-- DOWN (paste to undo; first make every Tour manager a Member or remove them):
-- BEGIN;
-- UPDATE public.workspace_members SET role = 'readonly' WHERE role = 'tour_manager';
-- DROP TRIGGER IF EXISTS workspace_members_tm_invite_access ON public.workspace_members;
-- DROP FUNCTION IF EXISTS private.tm_invite_access();
-- DROP POLICY IF EXISTS lp_tm_select ON public.personnel; DROP POLICY IF EXISTS lp_tm_insert ON public.personnel;
-- DROP POLICY IF EXISTS lp_tm_update ON public.personnel; DROP POLICY IF EXISTS lp_tm_update ON public.tours;
-- then re-paste 292 §3–4 (helpers + my_tour_access) and 296 (reference tables),
-- and put the role checks back to ('admin','manager','readonly').
-- COMMIT;
`;
out('database/migrations/298_tour_manager_role.sql', m298);

/* 301 — the rider rebuild (Nov 2026). Its tables' rules are written into
   301 itself, between markers, so one paste creates the tables AND their
   rules. Reference tables use the 298 form (a Tour manager edits the
   workspace's templates). The DDL around the markers is hand-written. */
{
  const path = 'database/migrations/301_riders.sql';
  const START = '-- >>> rules: GENERATED by scripts/permissions/gen293.mjs from rules.mjs (since: 301) — do not hand-edit\n';
  const END = '-- <<< rules\n';
  const cur = readFileSync(path, 'utf8');
  const i = cur.indexOf(START);
  const j = cur.indexOf(END);
  if (i < 0 || j < i) throw new Error(`${path}: rules markers missing`);
  const rules301 = RULES.filter((r) => r.since === 301).map((r) => block(r, { libraryEditors: true })).join('\n');
  out(path, cur.slice(0, i + START.length) + SETTER + rules301 + '\n' + cur.slice(j));
}

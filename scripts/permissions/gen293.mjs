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
function plan(r) {
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
      read = WS;
      write = `${WS} AND ${MGR}`;
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

function block(r) {
  const p = plan(r);
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

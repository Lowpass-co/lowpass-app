// 295: deleting a user no longer fails on "made by" columns; a site admin can
// delete an ARCHIVED workspace (name typed exactly); its stored files can be
// listed only once it's gone. Production-like foreign keys are added here.
import fs from 'node:fs';
import { base, check, done, WS, WS2, ADAM, MGR, CREW, OTHER, T1 } from './permissions_base.mjs';
const { db, as } = await base();
await db.exec(`
ALTER TABLE public.workspaces ADD COLUMN archived_at timestamptz;
ALTER TABLE public.workspace_members ADD FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.workspace_members ADD FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL;
ALTER TABLE public.tours ADD FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
CREATE TABLE public.flights (id serial primary key, workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE, created_by uuid REFERENCES auth.users(id));
CREATE TABLE public.strict_audit (id serial primary key, made_by uuid NOT NULL REFERENCES auth.users(id));
CREATE TABLE public.budget_line_item_notes (id serial primary key, workspace_id uuid NOT NULL REFERENCES public.workspaces(id), created_by uuid REFERENCES auth.users(id));
CREATE TABLE public.signed_off (id serial primary key, by_profile uuid REFERENCES public.profiles(id));
INSERT INTO public.flights (workspace_id, created_by) VALUES ('${WS}','${MGR}'), ('${WS2}','${OTHER}');
INSERT INTO public.budget_line_item_notes (workspace_id, created_by) VALUES ('${WS2}','${OTHER}');
INSERT INTO public.signed_off (by_profile) VALUES ('${MGR}');
-- CREW is also in WS2 (so deleting WS2 moves nobody but Other).
INSERT INTO public.workspace_members (user_id, workspace_id, role) VALUES ('${CREW}','${WS2}','readonly');
INSERT INTO storage.objects (bucket_id, name) VALUES
  ('tour-files','${WS2}/tour/x/rider.pdf'), ('tour-files','advance-packs/${WS2}/t/pack.pdf'),
  ('receipts','${WS2}/e1/r.jpg'), ('tour-files','${WS}/keep.pdf'), ('avatars','${OTHER}.png');
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
`);

// Before: deleting MGR fails (flights.created_by has no rule).
let err = null;
try { await db.exec(`DELETE FROM auth.users WHERE id = '${MGR}'`); } catch (e) { err = e.message; }
check('before 295: deleting a user who made a flight fails', /foreign key/.test(err ?? ''), true);

const sql = fs.readFileSync('database/migrations/295_admin_delete_users_and_workspaces.sql', 'utf8');
const r = await db.exec(sql);
const report = r.at(-1).rows.map((x) => `${x.table}.${x.column}`);
check('report: only the NOT NULL column is left blocking', report, ['strict_audit.made_by']);
await db.exec(sql); // re-paste: a no-op
check('re-paste: same report', (await db.exec(sql)).at(-1).rows.length, 1);

const rule = async (tbl, col) => (await db.query(`SELECT c.confdeltype FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] WHERE c.contype = 'f' AND c.conrelid = 'public.${tbl}'::regclass AND a.attname = '${col}'`)).rows[0].confdeltype;
check('flights.created_by → SET NULL', await rule('flights', 'created_by'), 'n');
check('signed_off.by_profile (→ profiles) → SET NULL', await rule('signed_off', 'by_profile'), 'n');
check('budget_line_item_notes.workspace_id → CASCADE', await rule('budget_line_item_notes', 'workspace_id'), 'c');
check('a cascade already there is untouched', await rule('flights', 'workspace_id'), 'c');

// Users: MGR can now be deleted; their flight stays, "made by" blank.
await db.exec(`DELETE FROM public.profiles WHERE id = '${MGR}'; DELETE FROM auth.users WHERE id = '${MGR}'`);
check('user deleted; their flight kept, created_by blank', (await db.query(`SELECT created_by FROM public.flights WHERE workspace_id = '${WS}'`)).rows, [{ created_by: null }]);
check('sign-off kept, profile link blank', (await db.query(`SELECT by_profile FROM public.signed_off`)).rows, [{ by_profile: null }]);

// Workspaces.
const del = (u, ws, name) => as(u, `SELECT public.admin_delete_workspace('${ws}', ${name === null ? 'NULL' : `'${name}'`}) AS r`);
check('not a site admin → refused', (await del(OTHER, WS2, 'Other')).error?.includes('site admin only'), true);
check('not archived → refused', (await del(ADAM, WS2, 'Other')).error?.includes('Archive the workspace'), true);
await db.exec(`UPDATE public.workspaces SET archived_at = now() WHERE id = '${WS2}'`);
check('wrong name → refused', (await del(ADAM, WS2, 'other')).error?.includes("doesn't match"), true);
check('files of a LIVE workspace are never listed', (await as(ADAM, `SELECT * FROM public.admin_workspace_storage_objects('${WS2}')`)).error?.includes('still exists'), true);
const res = await del(ADAM, WS2, 'Other');
check('deleted: counts back', res[0]?.r, { name: 'Other', tours: 1, members: 2 });
check('workspace gone', (await db.query(`SELECT count(*)::int n FROM public.workspaces WHERE id = '${WS2}'`)).rows[0].n, 0);
check('its tours, flights and the old notes table cascade', (await db.query(`SELECT (SELECT count(*) FROM public.tours WHERE workspace_id = '${WS2}')::int t, (SELECT count(*) FROM public.flights WHERE workspace_id = '${WS2}')::int f, (SELECT count(*) FROM public.budget_line_item_notes)::int n`)).rows[0], { t: 0, f: 0, n: 0 });
check('members kept as accounts', (await db.query(`SELECT count(*)::int n FROM auth.users WHERE id IN ('${OTHER}','${CREW}')`)).rows[0].n, 2);
check("Other's profile: no workspace now", (await db.query(`SELECT workspace_id FROM public.profiles WHERE id = '${OTHER}'`)).rows, [{ workspace_id: null }]);
check("Crew's profile untouched (still on WS)", (await db.query(`SELECT workspace_id FROM public.profiles WHERE id = '${CREW}'`)).rows, [{ workspace_id: WS }]);
check('the other workspace is untouched', (await db.query(`SELECT count(*)::int n FROM public.tours WHERE id = '${T1}'`)).rows[0].n, 1);
const files = await as(ADAM, `SELECT bucket_id, name FROM public.admin_workspace_storage_objects('${WS2}') ORDER BY 1, 2`);
check('its files are listed (id as any folder), nothing else', files.map((f) => `${f.bucket_id}:${f.name}`), [`receipts:${WS2}/e1/r.jpg`, `tour-files:${WS2}/tour/x/rider.pdf`, `tour-files:advance-packs/${WS2}/t/pack.pdf`]);
check('file listing: site admin only', (await as(CREW, `SELECT * FROM public.admin_workspace_storage_objects('${WS2}')`)).error?.includes('site admin only'), true);
check('anon cannot call either', (await as(null, `SELECT public.admin_delete_workspace('${WS}', 'Adam')`, 'anon')).error?.includes('permission denied'), true);
done();

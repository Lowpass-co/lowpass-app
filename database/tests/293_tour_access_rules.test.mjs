import fs from 'node:fs';
import { base, check, done, WS, WS2, ADAM, MGR, PA, CREW, NOBODY, OTHER, T1, T2, TX, R1, R2, PK1, PKA, L1, S1, P_CREW, P_OTHER } from './permissions_base.mjs';
const ROOT = process.env.ROOT ?? '';
const m292 = fs.readFileSync(ROOT + 'database/migrations/292_tour_access_foundation.sql', 'utf8');
const m293 = fs.readFileSync(ROOT + 'database/migrations/293_tour_access_rules.sql', 'utf8');
const down = fs.readFileSync(ROOT + 'database/migrations/_DOWN_293_workspace_rules.sql', 'utf8');
const { db, as } = await base();

// Build every table 293 names, with the columns it expects.
const specs = [...m293.matchAll(/lp_set_rules\('([a-z_]+)', ARRAY\[([^\]]*)\]/g)].map((m) => [m[1], [...m[2].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])]);
const have = new Set((await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`)).rows.map((r) => r.table_name));
for (const [t, cols] of specs) {
  if (have.has(t)) {
    for (const c of [...cols, 'workspace_id']) await db.exec(`ALTER TABLE public.${t} ADD COLUMN IF NOT EXISTS ${c} ${c === 'linked_to_type' ? 'text' : 'uuid'}`);
  } else {
    const defs = [...new Set([...cols, 'workspace_id'])].filter((c) => c !== 'id').map((c) => `${c} ${c === 'linked_to_type' ? 'text' : 'uuid'}`);
    await db.exec(`CREATE TABLE public.${t} (id uuid primary key default gen_random_uuid()${defs.length ? ', ' + defs.join(', ') : ''}, note text)`);
  }
  // a pre-existing catch-all rule, like the live ones, that 293 must remove
  await db.exec(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY; CREATE POLICY "old catch-all" ON public.${t} FOR ALL USING (true)`);
}
await db.exec(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated; GRANT USAGE ON ALL SEQUENCES IN SCHEMA storage TO authenticated;
CREATE TABLE public.rental_jobs (id uuid primary key, tour_id uuid, workspace_id uuid);
CREATE POLICY "tour_files_delete_own_workspace" ON storage.objects FOR DELETE USING (bucket_id = 'tour-files');
CREATE POLICY "tour_files_select_own_workspace" ON storage.objects FOR SELECT USING (bucket_id = 'tour-files');`);

const crewM = (await db.query(`SELECT id FROM public.workspace_members WHERE user_id = '${CREW}'`)).rows[0].id;
const paM = (await db.query(`SELECT id FROM public.workspace_members WHERE user_id = '${PA}'`)).rows[0].id;
const ART = '80000000-0000-0000-0000-000000000001', ART2 = '80000000-0000-0000-0000-000000000002';
await db.exec(`
UPDATE public.tours SET artist_id = '${ART}' WHERE id = '${T1}';
INSERT INTO public.artists (id, workspace_id) VALUES ('${ART}','${WS}'),('${ART2}','${WS}');
INSERT INTO public.parking_maps (workspace_id, tour_id, note) VALUES ('${WS}','${T1}','p1'),('${WS}','${T2}','p2'),('${WS2}','${TX}','px');
INSERT INTO public.advance_instances (routing_id, note) VALUES ('${R1}','a1'),('${R2}','a2');
INSERT INTO public.channel_list_rows (pack_id, note) VALUES ('${PK1}','tour pack row'),('${PKA}','artist pack row');
INSERT INTO public.file_references (workspace_id, linked_to_type, linked_to_id, note) VALUES ('${WS}','tour','${T1}','tour file'),('${WS}','artist','${ART}','artist file'),('${WS}','routing','${R2}','show file');
INSERT INTO public.expense_receipts (workspace_id, tour_id, note) VALUES ('${WS}','${T1}','r1');
INSERT INTO public.deal_memos (workspace_id, tour_id, note) VALUES ('${WS}','${T1}','deal');
INSERT INTO public.persons (id, workspace_id) VALUES ('${P_CREW}','${WS}'),('${P_OTHER}','${WS}'),('60000000-0000-0000-0000-000000000009','${WS}');
INSERT INTO public.tour_personnel (workspace_id, tour_id, person_id, note) VALUES ('${WS}','${T2}','${P_CREW}','me on T2'),('${WS}','${T1}','${P_OTHER}','sam on T1');
INSERT INTO public.payroll_entries (workspace_id, tour_id, person_id, note) VALUES ('${WS}','${T1}','${P_CREW}','my pay'),('${WS}','${T1}','${P_OTHER}','sam pay');
INSERT INTO public.rag_chunks (workspace_id, note) VALUES ('${WS}','deal memo chunk');
INSERT INTO public.settlement_payments (settlement_id, workspace_id, note) VALUES ('${S1}','${WS}','paid');
INSERT INTO public.venues (workspace_id, note) VALUES ('${WS}','Co-op');
INSERT INTO public.rate_types (workspace_id, note) VALUES (NULL,'built-in Show'),('${WS}','our custom'),('${WS2}','their custom');
INSERT INTO storage.objects (bucket_id, name) VALUES ('tour-files','${WS}/tour/${T1}/a.pdf'),('tour-files','${WS}/artist/${ART}/b.pdf'),('tour-files','${WS2}/tour/${TX}/c.pdf');
UPDATE public.personnel SET user_id = '${CREW}' WHERE id = '${P_CREW}';
`);

await db.exec(m292);
// Crew: Crew preset on all tours, parking edit + production view on T1. PA: receipts edit (all).
await db.exec(`INSERT INTO public.tour_access (workspace_id, member_id, tour_id, area, level) VALUES
 ('${WS}','${crewM}',NULL,'advance','view'),('${WS}','${crewM}',NULL,'files','view'),('${WS}','${crewM}',NULL,'schedule','view'),
 ('${WS}','${crewM}','${T1}','parking','edit'),('${WS}','${crewM}','${T1}','production','view'),
 ('${WS}','${paM}',NULL,'receipts','edit');`);

const before = await as(NOBODY, `SELECT count(*)::int n FROM public.parking_maps`);
check('before 293 the catch-all lets anyone read', before[0].n, 3);
const res = await db.exec(m293);
await db.exec(m293); // re-run
const report = res.at(-1).rows;
check('293 report', report.map((r) => r.status), ['OK', 'OK', 'OK', 'OK', 'OK']);
if (report.some((r) => r.status !== 'OK')) console.log(report);

const n = async (u, sql) => { const r = await as(u, sql); return r.error ? r.error : r.length; };
const notes = async (u, t) => { const r = await as(u, `SELECT note FROM public.${t} ORDER BY note`); return r.error ? r.error : r.map((x) => x.note); };
const denied = (r) => (typeof r === 'object' && r.error ? (r.error.includes('row-level security') ? 'denied' : r.error) : r);

// Admin / manager: unchanged
check('admin parking: own workspace only', await notes(ADAM, 'parking_maps'), ['p1', 'p2']);
check('manager deal memos', await notes(MGR, 'deal_memos'), ['deal']);
check('admin artist pack rows', await notes(ADAM, 'channel_list_rows'), ['artist pack row', 'tour pack row']);
check('other workspace admin sees only theirs', await notes(OTHER, 'parking_maps'), ['px']);
check('admin can add a tour', (await as(ADAM, `INSERT INTO public.tours (workspace_id, name) VALUES ('${WS}','New') RETURNING name`))[0]?.name, 'New');

// Crew member
check('crew: tours (all-tours rows include a tour added later)', (await as(CREW, `SELECT name FROM public.tours ORDER BY name`)).map((r) => r.name), ['New', 'Tour One', 'Tour Two']);
check('crew: cannot add a tour', denied(await as(CREW, `INSERT INTO public.tours (workspace_id, name) VALUES ('${WS}','X')`)), 'denied');
check('crew: routing (schedule view)', await n(CREW, `SELECT 1 FROM public.routing`), 2);
check('crew: cannot add a show day', denied(await as(CREW, `INSERT INTO public.routing (tour_id) VALUES ('${T1}')`)), 'denied');
check('crew: parking T1 only', await notes(CREW, 'parking_maps'), ['p1']);
check('crew: edit parking T1', (await as(CREW, `UPDATE public.parking_maps SET note = 'p1 edited' WHERE tour_id = '${T1}' RETURNING note`)).length, 1);
check('crew: add parking T2 refused', denied(await as(CREW, `INSERT INTO public.parking_maps (workspace_id, tour_id) VALUES ('${WS}','${T2}')`)), 'denied');
check('crew: cannot move a T1 map to T2', denied(await as(CREW, `UPDATE public.parking_maps SET tour_id = '${T2}' WHERE note = 'p1 edited'`)), 'denied');
check('crew: advance both days, read only', await notes(CREW, 'advance_instances'), ['a1', 'a2']);
check('crew: advance edit refused (0 rows)', (await as(CREW, `UPDATE public.advance_instances SET note = 'x' RETURNING 1`)).length, 0);
check('crew: rider rows — tour pack only', await notes(CREW, 'channel_list_rows'), ['tour pack row']);
check('crew: files — tour + show files, not artist', await notes(CREW, 'file_references'), ['show file', 'tour file']);
check('crew: cannot delete a tour file row', (await as(CREW, `DELETE FROM public.file_references WHERE note = 'tour file' RETURNING 1`)).length, 0);
check('crew: no budget', (await as(CREW, `SELECT name FROM public.budget_line_items`)).length, 0);
check('crew: no deal memos', await notes(CREW, 'deal_memos'), []);
check('crew: own crew row only (no logistics)', await notes(CREW, 'tour_personnel'), ['me on T2']);
check('crew: own pay line only (no payroll)', await notes(CREW, 'payroll_entries'), ['my pay']);
check('crew: own personnel record only', (await as(CREW, `SELECT id FROM public.personnel`)).map((r) => r.id), [P_CREW]);
check('crew: persons on visible tours', (await as(CREW, `SELECT id FROM public.persons ORDER BY id`)).map((r) => r.id), [P_CREW, P_OTHER]);
check('crew: artist of their tours only', (await as(CREW, `SELECT id FROM public.artists`)).map((r) => r.id), [ART]);
check('crew: AI index hidden', await notes(CREW, 'rag_chunks'), []);
check('crew: reference data readable', await notes(CREW, 'venues'), ['Co-op']);
// Built-in rows (no workspace) are everyone's — 293 as first pasted hid them,
// and Payroll lost its rate columns (fixed by 296, Nov 2026).
check('crew: built-in + own reference rows, never another workspace\'s', await notes(CREW, 'rate_types'), ['built-in Show', 'our custom']);
check('manager: built-in rate types readable', (await notes(MGR, 'rate_types')).includes('built-in Show'), true);
check('admin: a built-in can\'t be changed', (await as(ADAM, `UPDATE public.rate_types SET note = 'x' WHERE workspace_id IS NULL RETURNING 1`)).length, 0);
check('crew: reference data not writable', denied(await as(CREW, `INSERT INTO public.venues (workspace_id, note) VALUES ('${WS}','x')`)), 'denied');
check('crew: settlements hidden', await notes(CREW, 'settlement_payments'), []);

// PA: receipts edit, nothing else
check('PA: receipts', await notes(PA, 'expense_receipts'), ['r1']);
check('PA: add receipt', (await as(PA, `INSERT INTO public.expense_receipts (workspace_id, tour_id, note) VALUES ('${WS}','${T2}','r2') RETURNING 1`)).length, 1);
check('PA: can read budget lines to file against', (await as(PA, `SELECT name FROM public.budget_line_items`)).map((r) => r.name), ['Bus']);
check('PA: cannot change a budget line', (await as(PA, `UPDATE public.budget_line_items SET name = 'x' RETURNING 1`)).length, 0);
check('PA: can add a transaction (receipt → line)', (await as(PA, `INSERT INTO public.budget_line_item_transactions (workspace_id, line_item_id, note) VALUES ('${WS}','${L1}','t') RETURNING 1`)).length, 1);
check('PA: no tours outside access? sees all (receipts all tours)', await n(PA, `SELECT 1 FROM public.tours`), 3);
check('PA: no parking', await notes(PA, 'parking_maps'), []);

// Nobody (member with no access)
check('nobody: no tours', await n(NOBODY, `SELECT 1 FROM public.tours`), 0);
check('nobody: no files', await notes(NOBODY, 'file_references'), []);

// Storage
const obj = async (u) => (await as(u, `SELECT name FROM storage.objects ORDER BY name`)).map((r) => r.name.split('/').slice(1, 2)[0]);
check('crew storage: tour file only', await obj(CREW), ['tour']);
check('crew cannot delete tour file', (await as(CREW, `DELETE FROM storage.objects WHERE name LIKE '%a.pdf' RETURNING 1`)).length, 0);
check('admin storage: own workspace', await obj(ADAM), ['artist', 'tour']);
check('nobody storage: none', await obj(NOBODY), []);
check('crew cannot upload to tour folder', denied(await as(CREW, `INSERT INTO storage.objects (bucket_id, name) VALUES ('tour-files','${WS}/tour/${T1}/new.pdf')`)), 'denied');
check('admin deletes tour file', (await as(ADAM, `DELETE FROM storage.objects WHERE name LIKE '%a.pdf' RETURNING 1`)).length, 1);

// Emergency down
await db.exec(down);
check('down: admin still works', await notes(ADAM, 'parking_maps'), ['p1 edited', 'p2']);
check('down: member back on workspace scope', await notes(NOBODY, 'deal_memos'), ['deal']);
await db.exec(m293);
check('293 again after down', await notes(NOBODY, 'deal_memos'), []);

// 296 on a database that has the FIRST 293 (reference rows = own workspace only).
const m296 = fs.readFileSync(ROOT + 'database/migrations/296_shared_reference_rows.sql', 'utf8');
await db.exec(m293.replaceAll('workspace_id IS NULL OR workspace_id = (SELECT public.get_my_workspace_id())', 'workspace_id = (SELECT public.get_my_workspace_id())'));
check('first 293: built-ins hidden (the bug)', await notes(CREW, 'rate_types'), ['our custom']);
await db.exec(m296.slice(0, m296.lastIndexOf('-- Check:')));
check('296: built-ins back', await notes(CREW, 'rate_types'), ['built-in Show', 'our custom']);
await db.exec(m296.slice(0, m296.lastIndexOf('-- Check:')));
check('296 twice: same', await notes(CREW, 'rate_types'), ['built-in Show', 'our custom']);
check('296: tour rules untouched', await notes(NOBODY, 'deal_memos'), []);
done();

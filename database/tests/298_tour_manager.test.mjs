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
// ---------------- 298: the Tour manager tier ----------------
const m296 = fs.readFileSync(ROOT + 'database/migrations/296_shared_reference_rows.sql', 'utf8');
const m298 = fs.readFileSync(ROOT + 'database/migrations/298_tour_manager_role.sql', 'utf8');
await db.exec(m292);

await db.exec(`INSERT INTO public.tour_access (workspace_id, member_id, tour_id, area, level) VALUES
 ('${WS}','${paM}',NULL,'receipts','edit');`);
await db.exec(m293);
await db.exec(m296.slice(0, m296.lastIndexOf('COMMIT;') + 7)); // without its rate_types check query
await db.exec(`INSERT INTO public.budget_templates (workspace_id, note) VALUES ('${WS}','ours')`).catch(() => {});

const n = async (u, sql) => { const r = await as(u, sql); return r.error ? r.error : r.length; };
const notes = async (u, t) => { const r = await as(u, `SELECT note FROM public.${t} ORDER BY note`); return r.error ? r.error : r.map((x) => x.note); };
const denied = (r) => (Array.isArray(r) ? r.length : r?.error?.includes('row-level security') ? 'denied' : r?.error ?? r);

// The live tables carry 078's role checks (the test base has none).
await db.exec(`ALTER TABLE public.workspace_members ADD CONSTRAINT workspace_members_role_check CHECK (role IN ('admin','manager','readonly'));
ALTER TABLE public.workspace_invites ADD CONSTRAINT workspace_invites_invited_role_check CHECK (invited_role IN ('admin','manager','readonly'));`);
// Before 298 the role is refused.
const pre = await db.query(`SELECT 1`).then(() => db.exec(`UPDATE public.workspace_members SET role = 'tour_manager' WHERE user_id = '${NOBODY}'`)).then(() => 'allowed', (e) => 'refused');
check('before 298: tour_manager is not a role', pre, 'refused');

await db.exec(m298);
await db.exec(m298); // re-paste is a no-op
const tmM = (await db.query(`SELECT id FROM public.workspace_members WHERE user_id = '${NOBODY}'`)).rows[0].id;
await db.exec(`UPDATE public.workspace_members SET role = 'tour_manager' WHERE user_id = '${NOBODY}';
INSERT INTO public.tour_access (workspace_id, member_id, tour_id, area, level) VALUES ('${WS}','${tmM}','${T1}','schedule','view');`);
const TM = NOBODY;
check('after 298: still no made-up roles', await db.exec(`UPDATE public.workspace_members SET role = 'owner' WHERE user_id = '${PA}'`).then(() => 'allowed', () => 'refused'), 'refused');
check('after 298: an invite can be for a Tour manager', await db.exec(`INSERT INTO public.workspace_invites (workspace_id, invited_email, invited_role, token) VALUES ('${WS}','ben@x','tour_manager','t-ben')`).then(() => 'allowed', (e) => e.message), 'allowed');

// Their tours only, every area, edit.
check('TM reads parking on T1 only', await notes(TM, 'parking_maps'), ['p1']);
check('TM reads the deal memo on T1 (income)', await notes(TM, 'deal_memos'), ['deal']);
check('TM reads receipts on T1', await notes(TM, 'expense_receipts'), ['r1']);
check('TM writes parking on T1', denied(await as(TM, `INSERT INTO public.parking_maps (workspace_id, tour_id, note) VALUES ('${WS}','${T1}','new') RETURNING note`)), 1);
check('TM cannot write parking on T2', denied(await as(TM, `INSERT INTO public.parking_maps (workspace_id, tour_id, note) VALUES ('${WS}','${T2}','no')`)), 'denied');
check('TM edits a show day on T1', denied(await as(TM, `UPDATE public.routing SET date = '2026-12-03' WHERE id = '${R1}' RETURNING id`)), 1);
check('TM cannot touch T2 days', denied(await as(TM, `UPDATE public.routing SET date = '2026-12-04' WHERE id = '${R2}' RETURNING id`)), 0);
check('TM my_tour_access T1: every area at edit', (await as(TM, `SELECT count(*)::int n FROM public.my_tour_access('${T1}') WHERE level = 'edit'`))[0].n, 10);
check('TM my_tour_access T2: nothing', (await as(TM, `SELECT count(*)::int n FROM public.my_tour_access('${T2}')`))[0].n, 0);

// Tour row: edit theirs, never add / delete / move.
check('TM renames T1', denied(await as(TM, `UPDATE public.tours SET name = 'Aura' WHERE id = '${T1}' RETURNING name`)), 1);
check('TM cannot rename T2', denied(await as(TM, `UPDATE public.tours SET name = 'x' WHERE id = '${T2}' RETURNING name`)), 0);
check('TM cannot add a tour', denied(await as(TM, `INSERT INTO public.tours (workspace_id, name) VALUES ('${WS}','Mine')`)), 'denied');
check('TM cannot delete their tour', denied(await as(TM, `DELETE FROM public.tours WHERE id = '${T1}' RETURNING id`)), 0);
check('TM cannot move their tour to another workspace', denied(await as(TM, `UPDATE public.tours SET workspace_id = '${WS2}' WHERE id = '${T1}' RETURNING id`)), 'denied');

// People: those on T1 (Sam), not on T2 (Dil); add new ones; never delete.
const people = async (u) => { const r = await as(u, `SELECT name FROM public.personnel ORDER BY name`); return r.error ?? r.map((x) => x.name); };
check('TM reads People on their tours only', await people(TM), ['Sam']);
check('TM sees passports of people on their tour', denied(await as(TM, `SELECT passport_info FROM public.personnel WHERE id = '${P_OTHER}'`)), 1);
check('TM edits someone on their tour', denied(await as(TM, `UPDATE public.personnel SET name = 'Sam B' WHERE id = '${P_OTHER}' RETURNING name`)), 1);
check('TM cannot edit someone not on their tours', denied(await as(TM, `UPDATE public.personnel SET name = 'x' WHERE id = '${P_CREW}' RETURNING name`)), 0);
check('TM adds a new person (and reads it back)', denied(await as(TM, `INSERT INTO public.personnel (workspace_id, name) VALUES ('${WS}','Ben') RETURNING name`)), 1);
check('…who is theirs to see', await people(TM), ['Ben', 'Sam B']);
check('TM cannot delete a person', denied(await as(TM, `DELETE FROM public.personnel WHERE id = '${P_OTHER}' RETURNING id`)), 0);
check('TM cannot add a person to another workspace', denied(await as(TM, `INSERT INTO public.personnel (workspace_id, name) VALUES ('${WS2}','x')`)), 'denied');
check('TM cannot pass someone else off as the creator', denied(await as(TM, `INSERT INTO public.personnel (workspace_id, name, created_by_user_id) VALUES ('${WS}','x','${ADAM}')`)), 'denied');

// Crew on their tour.
check('TM adds crew to T1', denied(await as(TM, `INSERT INTO public.tour_personnel (workspace_id, tour_id, person_id, note) VALUES ('${WS}','${T1}','${P_OTHER}','again') RETURNING note`)), 1);
check('TM cannot add crew to T2', denied(await as(TM, `INSERT INTO public.tour_personnel (workspace_id, tour_id, person_id, note) VALUES ('${WS}','${T2}','${P_OTHER}','no')`)), 'denied');

// Templates + libraries.
check('TM writes a workspace template', denied(await as(TM, `INSERT INTO public.budget_templates (workspace_id, note) VALUES ('${WS}','TM template') RETURNING note`)), 1);
check('TM never writes a built-in', denied(await as(TM, `INSERT INTO public.rate_types (workspace_id, note) VALUES (NULL,'x')`)), 'denied');
check('Member still cannot write a template', denied(await as(PA, `INSERT INTO public.budget_templates (workspace_id, note) VALUES ('${WS}','PA template')`)), 'denied');

// Never: the manager-only tables.
check('TM cannot read the AI index', await notes(TM, 'rag_chunks'), []);
check('TM reads their tour’s rider rows, never artist-level ones', await notes(TM, 'channel_list_rows'), ['tour pack row']);

// An invite as Tour manager, accepted: their tours come with it.
const BEN = '00000000-0000-0000-0000-0000000000be';
await db.exec(`INSERT INTO auth.users VALUES ('${BEN}','ben@x'); INSERT INTO public.profiles (id, workspace_id, email) VALUES ('${BEN}', NULL, 'ben@x');
UPDATE public.workspace_invites SET initial_access = '[{"tour_id":"${T2}","area":"schedule","level":"view"}]'::jsonb WHERE token = 't-ben';`);
const acc = await as(BEN, `SELECT public.accept_workspace_invite('t-ben') AS ws`);
check('Ben accepts the Tour manager invite', acc.error ?? 'ok', 'ok');
await db.exec(`UPDATE public.profiles SET workspace_id = '${WS}' WHERE id = '${BEN}'`);
check('Ben is a Tour manager', (await db.query(`SELECT role FROM public.workspace_members WHERE user_id = '${BEN}'`)).rows[0]?.role, 'tour_manager');
check('…on T2 only, every area', await notes(BEN, 'parking_maps'), ['p2']);
check('…editing it', denied(await as(BEN, `INSERT INTO public.parking_maps (workspace_id, tour_id, note) VALUES ('${WS}','${T2}','ben') RETURNING note`)), 1);

// Nobody else moved.
check('Member PA unchanged: receipts on every tour', await notes(PA, 'expense_receipts'), ['r1']);
check('Member PA still cannot read parking', await notes(PA, 'parking_maps'), []);
check('Manager still sees everything', await notes(MGR, 'parking_maps'), ['ben', 'new', 'p1', 'p2']);
check('Member cannot read People records', await people(PA), []);
check('Other workspace untouched', await notes(OTHER, 'parking_maps'), ['px']);

done();

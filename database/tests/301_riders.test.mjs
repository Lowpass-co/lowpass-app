// 301 — the rider rebuild: tables, guards, generated rules (production area).
import fs from 'node:fs';
import { base, check, done, WS, WS2, ADAM, MGR, PA, CREW, NOBODY, T1, T2, TX, R1, R2 } from './permissions_base.mjs';
const ROOT = process.env.ROOT ?? '';
const read = (f) => fs.readFileSync(ROOT + 'database/migrations/' + f, 'utf8');
const m293 = read('293_tour_access_rules.sql');
const m301 = read('301_riders.sql');
const { db, as } = await base();

// Every table 293 names EXCEPT the ones 301 creates, as uuid-column stubs.
const NEW = new Set([...m301.matchAll(/CREATE TABLE IF NOT EXISTS public\.([a-z_]+)/g)].map((m) => m[1]));
const specs = [...m293.matchAll(/lp_set_rules\('([a-z_]+)', ARRAY\[([^\]]*)\]/g)].map((m) => [m[1], [...m[2].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])]);
const have = new Set((await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`)).rows.map((r) => r.table_name));
for (const [t, cols] of specs) {
  if (NEW.has(t)) continue;
  if (have.has(t)) {
    for (const c of [...cols, 'workspace_id']) await db.exec(`ALTER TABLE public.${t} ADD COLUMN IF NOT EXISTS ${c} ${c === 'linked_to_type' ? 'text' : 'uuid'}`);
  } else {
    const defs = [...new Set([...cols, 'workspace_id'])].filter((c) => c !== 'id').map((c) => `${c} ${c === 'linked_to_type' ? 'text' : 'uuid'}`);
    await db.exec(`CREATE TABLE public.${t} (id uuid primary key default gen_random_uuid()${defs.length ? ', ' + defs.join(', ') : ''}, note text)`);
  }
}
await db.exec(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated; CREATE TABLE public.rental_jobs (id uuid primary key, tour_id uuid, workspace_id uuid);`);
await db.exec(read('292_tour_access_foundation.sql'));
await db.exec(m293);
const m296 = read('296_shared_reference_rows.sql');
await db.exec(m296.slice(0, m296.lastIndexOf('COMMIT;') + 7));
await db.exec(`ALTER TABLE public.workspace_members ADD CONSTRAINT workspace_members_role_check CHECK (role IN ('admin','manager','readonly'));
ALTER TABLE public.workspace_invites ADD CONSTRAINT workspace_invites_invited_role_check CHECK (invited_role IN ('admin','manager','readonly'));`);
await db.exec(read('298_tour_manager_role.sql'));

// ---------------- 301 ----------------
await db.exec(m301);
await db.exec(m301); // re-paste is a no-op
await db.exec(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated`);
check('301 made its tables', NEW.size, 11);

const member = async (u) => (await db.query(`SELECT id FROM public.workspace_members WHERE user_id = '${u}'`)).rows[0].id;
// CREW: production EDIT on T1. PA: production VIEW on T1. NOBODY: Tour manager on T2.
await db.exec(`INSERT INTO public.tour_access (workspace_id, member_id, tour_id, area, level) VALUES
  ('${WS}','${await member(CREW)}','${T1}','production','edit'),
  ('${WS}','${await member(PA)}','${T1}','production','view');
UPDATE public.workspace_members SET role = 'tour_manager' WHERE user_id = '${NOBODY}';
INSERT INTO public.tour_access (workspace_id, member_id, tour_id, area, level) VALUES ('${WS}','${await member(NOBODY)}','${T2}','schedule','view');`);
const TM = NOBODY;
const denied = (r) => (Array.isArray(r) ? r.length : r?.error?.includes('row-level security') ? 'denied' : r?.error ?? r);

// Documents: one Tech + one Hospitality per tour.
const tech = (await as(ADAM, `INSERT INTO public.riders (workspace_id, tour_id, kind, title) VALUES ('${WS2}','${T1}','tech','Tech') RETURNING id, workspace_id`))[0];
check('admin makes the Tech rider; workspace comes from the tour', tech.workspace_id, WS);
check('a second Tech rider on the tour is refused', await db.exec(`INSERT INTO public.riders (workspace_id, tour_id, kind) VALUES ('${WS}','${T1}','tech')`).then(() => 'allowed', () => 'refused'), 'refused');
check('production EDIT member makes the Hospitality rider', denied(await as(CREW, `INSERT INTO public.riders (workspace_id, tour_id, kind, title) VALUES ('${WS}','${T1}','hospitality','Hosp') RETURNING id`)), 1);
check('production VIEW member cannot write (T1 settings)', denied(await as(PA, `INSERT INTO public.rider_settings (workspace_id, tour_id, party_size) VALUES ('${WS}','${T1}',7)`)), 'denied');
check('…nor on a tour they cannot see (refused before RLS)', (await as(PA, `INSERT INTO public.riders (workspace_id, tour_id, kind) VALUES ('${WS}','${T2}','tech')`)).error ? 'refused' : 'allowed', 'refused');
check('VIEW member reads T1 riders', denied(await as(PA, `SELECT id FROM public.riders`)), 2);
check('admin of another workspace reads none', denied(await as('00000000-0000-0000-0000-00000000000b', `SELECT id FROM public.riders`)), 0);
const anon = await as(null, `SELECT id FROM public.riders`, 'anon');
check('anon reads nothing', anon.error ? 0 : anon.length, 0);

// Blocks: placed by their rider, version bumps on every update.
const blk = (await as(CREW, `INSERT INTO public.rider_blocks (rider_id, workspace_id, tour_id, position, kind, content)
  VALUES ('${tech.id}','${WS2}','${T2}','V','request','{"item":"Riser"}') RETURNING id, tour_id, workspace_id, version`))[0];
check('a block takes its tour + workspace from its rider', [blk.tour_id, blk.workspace_id, blk.version], [T1, WS, 1]);
const upd = await as(CREW, `UPDATE public.rider_blocks SET content = '{"item":"Riser 8x8"}' WHERE id = '${blk.id}' AND version = 1 RETURNING version`);
check('save against version 1 → version 2', upd.map((r) => r.version), [2]);
const stale = await as(CREW, `UPDATE public.rider_blocks SET content = '{"item":"x"}' WHERE id = '${blk.id}' AND version = 1 RETURNING version`);
check('a second save against version 1 changes nothing (the 409)', stale.length, 0);
check('a block cannot move to another rider', (await as(ADAM, `UPDATE public.rider_blocks SET rider_id = gen_random_uuid() WHERE id = '${blk.id}' RETURNING rider_id`))[0].rider_id, tech.id);
check('a bad position key is refused', await db.exec(`INSERT INTO public.rider_blocks (rider_id, workspace_id, tour_id, position, kind) VALUES ('${tech.id}','${WS}','${T1}','a b','text')`).then(() => 'allowed', () => 'refused'), 'refused');
check('VIEW member cannot edit a block', denied(await as(PA, `UPDATE public.rider_blocks SET content = '{}' WHERE id = '${blk.id}' RETURNING id`)), 0);
check('until before from is refused', await db.exec(`INSERT INTO public.rider_blocks (rider_id, workspace_id, tour_id, position, kind, applies_from, applies_until) VALUES ('${tech.id}','${WS}','${T1}','W','text','2026-12-10','2026-12-01')`).then(() => 'allowed', () => 'refused'), 'refused');

// Versions: frozen. Deleting the tour still takes them.
await as(ADAM, `INSERT INTO public.rider_versions (workspace_id, tour_id, major, minor, snapshot) VALUES ('${WS}','${T1}',1,0,'{}')`);
check('a version cannot be edited', await as(ADAM, `UPDATE public.rider_versions SET note = 'x' RETURNING id`).then((r) => (r.error ? 'refused' : 'allowed')), 'refused');
check('a version cannot be deleted on its own', await as(ADAM, `DELETE FROM public.rider_versions RETURNING id`).then((r) => (r.error ? 'refused' : 'allowed')), 'refused');
check('…not even by the service role', await db.exec(`DELETE FROM public.rider_versions`).then(() => 'allowed', () => 'refused'), 'refused');
check('version numbers are unique per tour', await db.exec(`INSERT INTO public.rider_versions (workspace_id, tour_id, major, minor, snapshot) VALUES ('${WS}','${T1}',1,0,'{}')`).then(() => 'allowed', () => 'refused'), 'refused');
const ver = (await db.query(`SELECT id FROM public.rider_versions`)).rows[0].id;

// Links: one live per show; the show must be on the tour.
check('link for a show on the tour', denied(await as(ADAM, `INSERT INTO public.rider_links (workspace_id, tour_id, routing_id, token) VALUES ('${WS}','${T1}','${R1}','tok-aaaaaaaaaaaaaaaaaaaaaa') RETURNING id`)), 1);
check('a second live link for that show is refused', await db.exec(`INSERT INTO public.rider_links (workspace_id, tour_id, routing_id, token) VALUES ('${WS}','${T1}','${R1}','tok-bbbbbbbbbbbbbbbbbbbbbb')`).then(() => 'allowed', () => 'refused'), 'refused');
check('a show from another tour is refused', await db.exec(`INSERT INTO public.rider_links (workspace_id, tour_id, routing_id, token) VALUES ('${WS}','${T1}','${R2}','tok-cccccccccccccccccccccc')`).then(() => 'allowed', (e) => (e.message.includes('not on tour') ? 'refused' : e.message)), 'refused');
check('…and a tour-wide link is fine alongside', await db.exec(`INSERT INTO public.rider_links (workspace_id, tour_id, token) VALUES ('${WS}','${T1}','tok-dddddddddddddddddddddd')`).then(() => 'allowed', (e) => e.message), 'allowed');
const link = (await db.query(`SELECT id FROM public.rider_links WHERE routing_id = '${R1}'`)).rows[0].id;
check('after revoking, a new live link can be made', await db.exec(`UPDATE public.rider_links SET revoked_at = now() WHERE id = '${link}'; INSERT INTO public.rider_links (workspace_id, tour_id, routing_id, token) VALUES ('${WS}','${T1}','${R1}','tok-eeeeeeeeeeeeeeeeeeeeee')`).then(() => 'allowed', (e) => e.message), 'allowed');

// Promoter rows are written by the service role; members read them by area.
await db.exec(`INSERT INTO public.rider_acks (workspace_id, tour_id, link_id, routing_id, version_id, name) VALUES ('${WS2}','${T1}','${link}','${R1}','${ver}','Jo at the venue');
INSERT INTO public.rider_replies (workspace_id, tour_id, link_id, routing_id, block_id, line, author, body) VALUES ('${WS}','${T1}','${link}','${R1}','${blk.id}','(1) Riser','venue','We have a 4x8 only');`);
check('an ack takes the tour workspace', (await db.query(`SELECT workspace_id FROM public.rider_acks`)).rows[0].workspace_id, WS);
check('VIEW member reads acks + replies', [denied(await as(PA, `SELECT id FROM public.rider_acks`)), denied(await as(PA, `SELECT id FROM public.rider_replies`))], [1, 1]);
check('an empty reply is refused', await db.exec(`INSERT INTO public.rider_replies (workspace_id, tour_id, link_id, block_id, line, author, body) VALUES ('${WS}','${T1}','${link}','${blk.id}','x','venue','  ')`).then(() => 'allowed', () => 'refused'), 'refused');
check('EDIT member marks the line for the show', denied(await as(CREW, `INSERT INTO public.rider_line_states (workspace_id, tour_id, routing_id, block_id, state, note) VALUES ('${WS}','${T1}','${R1}','${blk.id}','substitute','4x8x1') RETURNING id`)), 1);
check('one state per line per show', await db.exec(`INSERT INTO public.rider_line_states (workspace_id, tour_id, routing_id, block_id, state) VALUES ('${WS}','${T1}','${R1}','${blk.id}','cut')`).then(() => 'allowed', () => 'refused'), 'refused');

// Tour manager: everything on their tours, nothing on others; templates too.
check('TM makes T2 riders', denied(await as(TM, `INSERT INTO public.riders (workspace_id, tour_id, kind) VALUES ('${WS}','${T2}','tech') RETURNING id`)), 1);
check('TM cannot touch T1 riders', denied(await as(TM, `SELECT id FROM public.riders WHERE tour_id = '${T1}'`)), 0);
check('TM writes a workspace rider template', denied(await as(TM, `INSERT INTO public.rider_templates (workspace_id, name, kind) VALUES ('${WS}','Club tech','tech') RETURNING id`)), 1);
check('a Member cannot write a template', denied(await as(PA, `INSERT INTO public.rider_templates (workspace_id, name, kind) VALUES ('${WS}','x','tech')`)), 'denied');
check('…but reads them', denied(await as(PA, `SELECT id FROM public.rider_templates`)), 1);
check('bring-over ledger is admin / manager only', [denied(await as(MGR, `SELECT pack_id FROM public.rider_legacy_imports`)), denied(await as(CREW, `INSERT INTO public.rider_legacy_imports (pack_id, workspace_id, target) VALUES (gen_random_uuid(),'${WS}','x')`))], [0, 'denied']);

// Deleting the tour takes everything with it — versions included.
await db.exec(`DELETE FROM public.tours WHERE id = '${T1}'`);
check('tour delete cascades through the frozen versions', (await db.query(`SELECT (SELECT count(*) FROM public.rider_versions)::int v, (SELECT count(*) FROM public.rider_blocks)::int b, (SELECT count(*) FROM public.rider_links WHERE tour_id = '${T1}')::int l`)).rows[0], { v: 0, b: 0, l: 0 });
void TX; void R2;
done();

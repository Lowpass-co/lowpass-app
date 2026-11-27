// 302 — two more rider block kinds: input_list + stage_plot (shown, never
// edited, in the rider). Same base as 301's test, then 302 pasted twice.
import fs from 'node:fs';
import { base, check, done, WS, ADAM, CREW, PA, T1 } from './permissions_base.mjs';
const ROOT = process.env.ROOT ?? '';
const read = (f) => fs.readFileSync(ROOT + 'database/migrations/' + f, 'utf8');
const m293 = read('293_tour_access_rules.sql');
const m301 = read('301_riders.sql');
const m302 = read('302_rider_embed_blocks.sql');
const { db, as } = await base();

// Every table 293 names EXCEPT the ones 301 creates, as uuid-column stubs (as in 301's test).
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
await db.exec(m301);
await db.exec(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated`);

const member = async (u) => (await db.query(`SELECT id FROM public.workspace_members WHERE user_id = '${u}'`)).rows[0].id;
await db.exec(`INSERT INTO public.tour_access (workspace_id, member_id, tour_id, area, level) VALUES
  ('${WS}','${await member(CREW)}','${T1}','production','edit'),
  ('${WS}','${await member(PA)}','${T1}','production','view');`);
const tech = (await as(ADAM, `INSERT INTO public.riders (workspace_id, tour_id, kind, title) VALUES ('${WS}','${T1}','tech','Tech') RETURNING id`))[0];
const insert = (kind, pos) => db.exec(`INSERT INTO public.rider_blocks (rider_id, workspace_id, tour_id, position, kind, content) VALUES ('${tech.id}','${WS}','${T1}','${pos}','${kind}','{}')`).then(() => 'allowed', () => 'refused');

check('before 302: an input_list block is refused (the 301 CHECK)', await insert('input_list', 'A'), 'refused');

await db.exec(m302);
await db.exec(m302); // re-paste is a no-op
const checks = (await db.query(`SELECT conname FROM pg_constraint WHERE conrelid = 'public.rider_blocks'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%kind%'`)).rows.map((r) => r.conname);
check('one kind CHECK after two pastes, under the same name', checks, ['rider_blocks_kind_check']);

check('input_list block', await insert('input_list', 'B'), 'allowed');
check('stage_plot block', await insert('stage_plot', 'C'), 'allowed');
check('the old kinds still go in', await insert('files', 'D'), 'allowed');
check('anything else is still refused', await insert('channel_list', 'E'), 'refused');
check('production EDIT member adds one (rules unchanged)', (await as(CREW, `INSERT INTO public.rider_blocks (rider_id, workspace_id, tour_id, position, kind, content) VALUES ('${tech.id}','${WS}','${T1}','F','stage_plot','{}') RETURNING id`)).length, 1);
check('production VIEW member cannot', (await as(PA, `INSERT INTO public.rider_blocks (rider_id, workspace_id, tour_id, position, kind, content) VALUES ('${tech.id}','${WS}','${T1}','G','input_list','{}') RETURNING id`)).error ? 'denied' : 'allowed', 'denied');
done();

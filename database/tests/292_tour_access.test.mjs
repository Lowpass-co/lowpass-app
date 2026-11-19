import fs from 'node:fs';
import { base, check, done, WS, ADAM, MGR, PA, CREW, NOBODY, OTHER, T1, T2, TX, R1, PK1, PKA, L1, S1, P_CREW } from './permissions_base.mjs';
const { db, as } = await base();
const memberId = async (u) => (await db.query(`SELECT id FROM public.workspace_members WHERE user_id = '${u}'`)).rows[0].id;
const crewM = await memberId(CREW), paM = await memberId(PA);
// Legacy grants before 292: PA write receipts (user), crew tag read advance + operations.files.
await db.exec(`
INSERT INTO public.permission_grants (workspace_id, subject_type, subject_id, resource_type, resource_id, permission) VALUES
 ('${WS}','user','${PA}','page','budget.receipts','write'),
 ('${WS}','user','${PA}','page','budget.receipts','read'),
 ('${WS}','user','${PA}','page','artist.contracts','read'),
 ('${WS}','tag','crew','page','advance','read'),
 ('${WS}','tag','crew','page','operations.files','read'),
 ('${WS}','user','${MGR}','page','budget.line_items','write');
INSERT INTO public.workspace_member_tags (workspace_id, member_id, tag_name) VALUES ('${WS}','${crewM}','crew');
`);
const sql = fs.readFileSync('database/migrations/292_tour_access_foundation.sql', 'utf8');
const r = await db.exec(sql);
check('292 report all OK', r.at(-1).rows.map((x) => x.status), ['OK', 'OK', 'OK', 'OK', 'OK', 'OK', 'OK']);
await db.exec(sql); // re-run
check('re-run: still one row per member/area', (await db.query(`SELECT count(*)::int n FROM public.tour_access`)).rows[0].n, 3);
check('copied grants', (await db.query(`SELECT m.user_id = '${PA}' AS pa, area, level FROM public.tour_access a JOIN public.workspace_members m ON m.id = a.member_id ORDER BY 1, 2`)).rows,
  [{ pa: false, area: 'advance', level: 'view' }, { pa: false, area: 'files', level: 'view' }, { pa: true, area: 'receipts', level: 'edit' }]);

const tours = (u, area, level = 'view') => as(u, `SELECT x FROM private.tours_i_can('${area}','${level}') x ORDER BY 1`).then((rs) => rs.error ?? rs.map((x) => x.x));
check('admin: all own-workspace tours', await tours(ADAM, 'income', 'edit'), [T1, T2]);
check('manager: all', await tours(MGR, 'payroll', 'edit'), [T1, T2]);
check('PA receipts edit: all tours (copied all-tours row)', await tours(PA, 'receipts', 'edit'), [T1, T2]);
check('PA budget: none', await tours(PA, 'budget'), []);
check('crew advance view', await tours(CREW, 'advance'), [T1, T2]);
check('crew advance edit: none', await tours(CREW, 'advance', 'edit'), []);
check('nobody: none', await tours(NOBODY, 'advance'), []);
check('other workspace admin: only theirs', await tours(OTHER, 'advance'), [TX]);

// Per-tour rows: crew gets parking edit on T1 only.
await db.exec(`INSERT INTO public.tour_access (workspace_id, member_id, tour_id, area, level) VALUES ('${WS}','${crewM}','${T1}','parking','edit')`);
check('crew parking edit: T1 only', await tours(CREW, 'parking', 'edit'), [T1]);
check('crew sees T1+T2 (all-tours rows)', await as(CREW, `SELECT x FROM private.tours_i_see() x ORDER BY 1`).then((rs) => rs.map((x) => x.x)), [T1, T2]);
check('nobody sees no tours', await as(NOBODY, `SELECT x FROM private.tours_i_see() x`), []);
check('days', await as(CREW, `SELECT x FROM private.days_i_can('parking','edit') x`).then((rs) => rs.map((x) => x.x)), [R1]);
check('packs: crew without production → none', await as(CREW, `SELECT x FROM private.packs_i_can('view') x`), []);
check('packs: admin → tour + artist pack', await as(ADAM, `SELECT x FROM private.packs_i_can('edit') x ORDER BY 1`).then((rs) => rs.map((x) => x.x)), [PK1, PKA]);
await db.exec(`INSERT INTO public.tour_access (workspace_id, member_id, tour_id, area, level) VALUES ('${WS}','${crewM}','${T1}','production','view')`);
check('packs: crew production T1 → tour pack only (not artist pack)', await as(CREW, `SELECT x FROM private.packs_i_can('view') x`).then((rs) => rs.map((x) => x.x)), [PK1]);
check('lines: PA has no budget', await as(PA, `SELECT x FROM private.lines_i_can('budget','view') x`), []);
check('lines: admin', await as(ADAM, `SELECT x FROM private.lines_i_can('budget','view') x`).then((rs) => rs.map((x) => x.x)), [L1]);
check('settlements: admin', await as(ADAM, `SELECT x FROM private.settlements_i_can('edit') x`).then((rs) => rs.map((x) => x.x)), [S1]);

const my = (u, t) => as(u, `SELECT area, level FROM public.my_tour_access('${t}') ORDER BY area`);
check('my_tour_access admin: 10 areas edit', (await my(ADAM, T1)).length, 10);
check('my_tour_access crew T1', await my(CREW, T1), [{ area: 'advance', level: 'view' }, { area: 'files', level: 'view' }, { area: 'parking', level: 'edit' }, { area: 'production', level: 'view' }]);
check('my_tour_access crew T2', await my(CREW, T2), [{ area: 'advance', level: 'view' }, { area: 'files', level: 'view' }]);
check('my_tour_access foreign tour: nothing', await my(ADAM, TX), []);
// all-tours view + per-tour edit → edit wins
await db.exec(`INSERT INTO public.tour_access (workspace_id, member_id, tour_id, area, level) VALUES ('${WS}','${crewM}','${T2}','files','edit')`);
check('higher level wins (view all + edit T2)', (await my(CREW, T2)).find((x) => x.area === 'files').level, 'edit');

// Private schema: not reachable by anon.
check('anon cannot call private', (await as(null, `SELECT private.is_manager()`, 'anon')).error?.includes('permission denied'), true);

// tour_access rules
check('crew reads only own rows', (await as(CREW, `SELECT count(*)::int n FROM public.tour_access`))[0].n, 5);
check('PA reads only own rows', (await as(PA, `SELECT count(*)::int n FROM public.tour_access`))[0].n, 1);
check('admin reads all rows', (await as(ADAM, `SELECT count(*)::int n FROM public.tour_access`))[0].n, 6);
check('crew cannot grant self', (await as(CREW, `INSERT INTO public.tour_access (workspace_id, member_id, area, level) VALUES ('${WS}','${crewM}','budget','edit')`)).error?.includes('row-level security'), true);
check('manager cannot grant', (await as(MGR, `INSERT INTO public.tour_access (workspace_id, member_id, area, level) VALUES ('${WS}','${crewM}','budget','edit')`)).error?.includes('row-level security'), true);
check('admin grants', await as(ADAM, `INSERT INTO public.tour_access (workspace_id, member_id, area, level) VALUES ('${WS}','${paM}','budget','view') RETURNING area`), [{ area: 'budget' }]);
check('admin cannot grant a foreign tour', (await as(ADAM, `INSERT INTO public.tour_access (workspace_id, member_id, tour_id, area, level) VALUES ('${WS}','${paM}','${TX}','budget','view')`)).error, 'tour_access: tour is not in this workspace');
check('bad area refused', !!(await as(ADAM, `INSERT INTO public.tour_access (workspace_id, member_id, area, level) VALUES ('${WS}','${paM}','merch','view')`)).error, true);

// Invite: crew record + access.
await db.exec(`INSERT INTO auth.users VALUES ('70000000-0000-0000-0000-000000000001','new@x');
INSERT INTO public.profiles (id, workspace_id, email) VALUES ('70000000-0000-0000-0000-000000000001', NULL, 'new@x');
INSERT INTO public.workspace_invites (workspace_id, invited_email, invited_role, token, invited_by_user_id, personnel_id, initial_access)
VALUES ('${WS}','new@x','readonly','tok1','${ADAM}','${P_CREW}', '[{"tour_id":"${T1}","area":"parking","level":"view"},{"tour_id":null,"area":"advance","level":"view"},{"tour_id":"${T1}","area":"parking","level":"edit"}]');`);
const NEW = '70000000-0000-0000-0000-000000000001';
check('accept invite', await as(NEW, `SELECT public.accept_workspace_invite('tok1') AS ws`), [{ ws: WS }]);
check('linked to crew record', (await db.query(`SELECT user_id FROM public.personnel WHERE id = '${P_CREW}'`)).rows[0].user_id, NEW);
check('access written (edit wins)', await my(NEW, T1), [{ area: 'advance', level: 'view' }, { area: 'parking', level: 'edit' }]);
check('my_person_ids', await as(NEW, `SELECT x FROM private.my_person_ids() x`).then((rs) => rs.map((x) => x.x)), [P_CREW]);
check('accept twice → already accepted', (await as(NEW, `SELECT public.accept_workspace_invite('tok1')`)).error, 'Invite already accepted');
// A second invite can't steal a linked record.
await db.exec(`INSERT INTO auth.users VALUES ('70000000-0000-0000-0000-000000000002','thief@x');
INSERT INTO public.profiles (id, workspace_id, email) VALUES ('70000000-0000-0000-0000-000000000002', NULL, 'thief@x');
INSERT INTO public.workspace_invites (workspace_id, invited_email, token, personnel_id) VALUES ('${WS}','thief@x','tok2','${P_CREW}');`);
await as('70000000-0000-0000-0000-000000000002', `SELECT public.accept_workspace_invite('tok2')`);
check('linked record keeps its login', (await db.query(`SELECT user_id FROM public.personnel WHERE id = '${P_CREW}'`)).rows[0].user_id, NEW);

// Beta codes: site admin only.
check('site admin makes a code', await as(ADAM, `INSERT INTO public.beta_codes (code, email) VALUES ('ABC','t@x') RETURNING email`), [{ email: 't@x' }]);
check('others cannot read codes', await as(MGR, `SELECT * FROM public.beta_codes`), []);
check('email must be lower', !!(await as(ADAM, `INSERT INTO public.beta_codes (code, email) VALUES ('ABD','T@x')`)).error, true);

// Removing a member removes their access.
await db.exec(`DELETE FROM public.workspace_members WHERE user_id = '${CREW}'`);
check('member removed → rows gone', (await db.query(`SELECT count(*)::int n FROM public.tour_access WHERE member_id = '${crewM}'`)).rows[0].n, 0);
done();

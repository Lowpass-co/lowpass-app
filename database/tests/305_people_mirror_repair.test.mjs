// 305 — a new People record gets its persons copy again, so it can join a tour.
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

const db = new PGlite();
// The shape that matters, with 285's trigger MISSING (Adam's database).
await db.exec(`
CREATE TABLE public.persons (id uuid PRIMARY KEY, workspace_id uuid NOT NULL, full_name text NOT NULL, preferred_name text,
  pronouns text, email text, phone text, dietary text);
CREATE TABLE public.personnel (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, name text,
  email text, phone text, dietary_needs text, extended_profile jsonb DEFAULT '{}');
CREATE TABLE public.personnel_rates (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid, person_id uuid, person_name text);
CREATE TABLE public.tour_personnel (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tour_id uuid,
  person_id uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE);
INSERT INTO public.personnel (id, workspace_id, name, email) VALUES
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', 'Made while broken', 'a@x.com');
`);

let err = null;
try {
  await db.exec(`INSERT INTO public.tour_personnel (tour_id, person_id) VALUES (gen_random_uuid(), '00000000-0000-4000-8000-000000000001')`);
} catch (e) {
  err = e.message;
}
check('before 305: Adam’s error', /tour_personnel_person_id_fkey/.test(err ?? ''), true);

const sql = fs.readFileSync('database/migrations/305_people_mirror_repair.sql', 'utf8');
const r1 = await db.exec(sql);
check('report: nobody without a copy, trigger listed', r1.at(-1).rows, [{ people_without_copy: 0, personnel_triggers: 'personnel_mirror_person' }]);
const r2 = await db.exec(sql);
check('re-paste: same', r2.at(-1).rows, [{ people_without_copy: 0, personnel_triggers: 'personnel_mirror_person' }]);
check('the person made while broken got a copy', (await db.query(`SELECT full_name, email FROM public.persons`)).rows, [{ full_name: 'Made while broken', email: 'a@x.com' }]);

// Someone new now goes straight onto a tour.
await db.exec(`INSERT INTO public.personnel (id, workspace_id, name) VALUES ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000aa', 'New Person')`);
await db.exec(`INSERT INTO public.tour_personnel (tour_id, person_id) VALUES (gen_random_uuid(), '00000000-0000-4000-8000-000000000002')`);
check('new person joins a tour', (await db.query(`SELECT count(*)::int n FROM public.tour_personnel`)).rows[0].n, 1);
await db.exec(`UPDATE public.personnel SET name = 'Renamed' WHERE id = '00000000-0000-4000-8000-000000000002'`);
check('a rename follows', (await db.query(`SELECT full_name FROM public.persons WHERE id = '00000000-0000-4000-8000-000000000002'`)).rows[0].full_name, 'Renamed');

if (failed) {
  console.log(`${failed} failed`);
  process.exit(1);
}
console.log('all passed');

// 306 — one stock list for the job builder, quantity, week pricing.
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const WS = '00000000-0000-4000-8000-0000000000aa';

async function fresh({ with249 }) {
  const db = new PGlite();
  await db.exec(`
  CREATE TABLE public.workspaces (id uuid PRIMARY KEY);
  INSERT INTO public.workspaces VALUES ('${WS}');
  CREATE TABLE public.rental_inventory (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid, name text NOT NULL,
    category text, serial_number text, image_url text, notes text, country_of_origin text, customs_hs_code text,
    purchase_cost numeric, day_rate numeric, day_rate_manual boolean, weight_kg numeric, value_amount numeric,
    value_currency text, dimensions_cm jsonb, qr_token text, status text, last_used_at timestamptz);
  CREATE TABLE public.gear (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, name text NOT NULL,
    category text, serial_number text, image_url text, notes text, ownership text, hire_cost_amount numeric,
    hire_cost_currency text, hire_cost_period text, country_of_origin text, customs_hs_code text, purchase_cost numeric,
    day_rate numeric, day_rate_manual boolean NOT NULL DEFAULT false, weight_kg numeric, value_amount numeric,
    value_currency text, dimensions_cm jsonb NOT NULL DEFAULT '{}', qr_token text, status text NOT NULL DEFAULT 'available',
    last_used_at timestamptz, rental_inventory_id uuid);
  CREATE TABLE public.rental_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid, name text);
  CREATE TABLE public.rental_job_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid REFERENCES public.rental_jobs(id),
    inventory_id uuid NOT NULL REFERENCES public.rental_inventory(id) ON DELETE RESTRICT, quantity int NOT NULL DEFAULT 1);
  INSERT INTO public.rental_inventory (id, workspace_id, name, day_rate) VALUES
    ('00000000-0000-4000-8000-000000000001', '${WS}', 'LV1', 270),
    ('00000000-0000-4000-8000-000000000002', '${WS}', 'SD12 (stock never copied)', 300);
  -- 248 ran once, for the LV1 only (the second item arrived later).
  INSERT INTO public.gear (workspace_id, name, day_rate, rental_inventory_id) VALUES ('${WS}', 'LV1', 270, '00000000-0000-4000-8000-000000000001');
  INSERT INTO public.rental_jobs (id, workspace_id, name) VALUES ('00000000-0000-4000-8000-0000000000b1', '${WS}', 'Roxy');
  `);
  if (with249) await db.exec(`ALTER TABLE public.rental_job_items ADD COLUMN gear_id uuid REFERENCES public.gear(id);`);
  await db.exec(`INSERT INTO public.rental_job_items (job_id, inventory_id, quantity) VALUES
    ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 1),
    ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000002', 2);`);
  return db;
}

const sql = fs.readFileSync('database/migrations/306_rental_phase1.sql', 'utf8');
for (const with249 of [false, true]) {
  const db = await fresh({ with249 });
  const r1 = await db.exec(sql);
  const report = r1.at(-1).rows[0];
  check(`(249 ${with249 ? 'pasted' : 'never pasted'}) report all zero`, report, { stock_not_in_gear: 0, job_lines_without_gear: 0, stock_with_no_workspace: 0, inventory_id_still_required: 0 });
  const r2 = await db.exec(sql);
  check(`(249 ${with249 ? 'pasted' : 'never pasted'}) re-paste: same`, r2.at(-1).rows[0], report);
  check('the item 248 missed is in gear once', (await db.query(`SELECT count(*)::int n FROM public.gear WHERE name LIKE 'SD12%'`)).rows[0].n, 1);
  check('existing lines point at gear', (await db.query(`SELECT count(*)::int n FROM public.rental_job_items WHERE gear_id IS NULL`)).rows[0].n, 0);
  // A line for an item that only exists in gear.
  await db.exec(`INSERT INTO public.gear (id, workspace_id, name) VALUES ('00000000-0000-4000-8000-0000000000c1', '${WS}', 'New IEM rack');
    INSERT INTO public.rental_job_items (job_id, gear_id, quantity) VALUES ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000c1', 1);`);
  check('new gear-only stock can go on a job', (await db.query(`SELECT count(*)::int n FROM public.rental_job_items`)).rows[0].n, 3);
  let refused = false;
  try { await db.exec(`INSERT INTO public.rental_job_items (job_id, quantity) VALUES ('00000000-0000-4000-8000-0000000000b1', 1)`); } catch { refused = true; }
  check('a line with no item is refused', refused, true);
  check('quantity defaults to 1', (await db.query(`SELECT min(quantity)::int q FROM public.gear`)).rows[0].q, 1);
  check('week defaults to 3', Number((await db.query(`SELECT rental_days_per_week d FROM public.workspaces`)).rows[0].d), 3);
  let bad = false;
  try { await db.exec(`UPDATE public.workspaces SET rental_days_per_week = 9`); } catch { bad = true; }
  check('a 9-day week is refused', bad, true);
}
if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log('all passed');

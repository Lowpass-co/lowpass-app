// 307 — quote validity + payment details on the workspace.
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const refuses = async (db, q) => { try { await db.exec(q); return false; } catch { return true; } };

const db = new PGlite();
await db.exec(`CREATE TABLE public.workspaces (id uuid PRIMARY KEY); INSERT INTO public.workspaces VALUES ('00000000-0000-4000-8000-0000000000aa');`);
const sql = fs.readFileSync('database/migrations/307_rental_quote_settings.sql', 'utf8');
const r1 = await db.exec(sql);
check('report', r1.at(-1).rows[0], { has_valid_days: 1, has_payment_details: 1 });
check('existing workspace gets 14 days, no details', (await db.query('SELECT rental_quote_valid_days d, rental_payment_details p FROM public.workspaces')).rows[0], { d: 14, p: null });
await db.exec(`UPDATE public.workspaces SET rental_quote_valid_days = 30, rental_payment_details = 'Sort 00-00-00'`);
const r2 = await db.exec(sql);
check('re-paste: same report', r2.at(-1).rows[0], { has_valid_days: 1, has_payment_details: 1 });
check('re-paste keeps saved values', (await db.query('SELECT rental_quote_valid_days d, rental_payment_details p FROM public.workspaces')).rows[0], { d: 30, p: 'Sort 00-00-00' });
check('0 days refused', await refuses(db, 'UPDATE public.workspaces SET rental_quote_valid_days = 0'), true);
check('366 days refused', await refuses(db, 'UPDATE public.workspaces SET rental_quote_valid_days = 366'), true);
check('over 2000 chars refused', await refuses(db, `UPDATE public.workspaces SET rental_payment_details = repeat('x', 2001)`), true);

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');

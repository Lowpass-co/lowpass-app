// 297 — change_tour_currency(): the money stays right when a tour's currency
// changes. Run: node database/tests/297_change_tour_currency.test.mjs
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const ROOT = new URL('../../', import.meta.url).pathname;
const sql = fs.readFileSync(ROOT + 'database/migrations/297_change_tour_currency.sql', 'utf8');
const db = new PGlite();
let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const one = async (q) => (await db.query(q)).rows;

await db.exec(`
CREATE ROLE authenticated; CREATE ROLE anon;
CREATE TABLE public.tours (id uuid PRIMARY KEY, workspace_id uuid NOT NULL, currency text);
CREATE TABLE public.budget_line_items (id text PRIMARY KEY, tour_id uuid, currency text, locked_fx_rate numeric);
CREATE TABLE public.budget_income (id text PRIMARY KEY, tour_id uuid, currency text, locked_fx_rate numeric);
CREATE TABLE public.budget_fx_rates (tour_id uuid, workspace_id uuid, currency text, rate_to_tour_currency numeric,
  updated_at timestamptz, UNIQUE (tour_id, currency));
INSERT INTO public.tours VALUES ('11111111-1111-1111-1111-111111111111','99999999-9999-9999-9999-999999999999','GBP'),
                                ('22222222-2222-2222-2222-222222222222','99999999-9999-9999-9999-999999999999','GBP');
-- A EUR actual locked at 0.85 GBP; a USD one locked at 0.80 GBP; a £ line (no currency, no lock).
INSERT INTO public.budget_line_items VALUES ('eur','11111111-1111-1111-1111-111111111111','EUR',0.85),
  ('usd','11111111-1111-1111-1111-111111111111','USD',0.80), ('gbp','11111111-1111-1111-1111-111111111111',NULL,NULL),
  ('other','22222222-2222-2222-2222-222222222222','EUR',0.85);
INSERT INTO public.budget_income VALUES ('show','11111111-1111-1111-1111-111111111111','EUR',0.86);
INSERT INTO public.budget_fx_rates VALUES ('11111111-1111-1111-1111-111111111111','99999999-9999-9999-9999-999999999999','EUR',0.85,now()),
  ('11111111-1111-1111-1111-111111111111','99999999-9999-9999-9999-999999999999','USD',0.80,now());
`);
await db.exec(sql);
await db.exec(sql); // re-paste is a no-op

const T = `'11111111-1111-1111-1111-111111111111'`;
// 1 GBP = 1.25 USD
const r = (await one(`SELECT public.change_tour_currency(${T}, 'usd', 1.25) AS r`))[0].r;
check('changed GBP → USD', [r.changed, r.from, r.to, r.locked_lines, r.locked_income], [true, 'GBP', 'USD', 2, 1]);
check('tour is in USD', (await one(`SELECT currency FROM public.tours WHERE id = ${T}`))[0].currency, 'USD');

const lines = Object.fromEntries((await one(`SELECT id, locked_fx_rate::float8 AS r FROM public.budget_line_items`)).map((x) => [x.id, x.r]));
check('EUR actual: 0.85 GBP → 1.0625 USD per EUR', lines.eur, 1.0625);
check('USD actual: now ≈ 1 (USD is the tour currency)', lines.usd, 1);
check('a £ line with no currency is untouched (it now reads as $)', lines.gbp, null);
check("another tour's locks untouched", lines.other, 0.85);
check('settled show restated', (await one(`SELECT locked_fx_rate::float8 AS r FROM public.budget_income`))[0].r, 1.075);

const fx = Object.fromEntries((await one(`SELECT currency, rate_to_tour_currency::float8 AS r FROM public.budget_fx_rates WHERE tour_id = ${T}`)).map((x) => [x.currency, x.r]));
check('FX: no row for the tour currency; EUR restated; GBP added', fx, { EUR: 1.0625, GBP: 1.25 });

const again = (await one(`SELECT public.change_tour_currency(${T}, 'USD', 1.25) AS r`))[0].r;
check('same currency again → nothing (never multiplies twice)', again.changed, false);
check('…locks unchanged', (await one(`SELECT locked_fx_rate::float8 AS r FROM public.budget_line_items WHERE id = 'eur'`))[0].r, 1.0625);

// And back: 1 USD = 0.8 GBP → the original numbers.
await one(`SELECT public.change_tour_currency(${T}, 'GBP', 0.8)`);
check('back to GBP restores the EUR lock', (await one(`SELECT locked_fx_rate::float8 AS r FROM public.budget_line_items WHERE id = 'eur'`))[0].r, 0.85);

const bad = async (q) => { try { await db.query(q); return 'ok'; } catch (e) { return e.code; } };
check('a bad code is refused', await bad(`SELECT public.change_tour_currency(${T}, 'dollars', 1)`), '22023');
check('no rate → refused', await bad(`SELECT public.change_tour_currency(${T}, 'EUR', NULL)`), '22023');
check('unknown tour → P0002', await bad(`SELECT public.change_tour_currency('33333333-3333-3333-3333-333333333333', 'EUR', 1)`), 'P0002');
check('tour unchanged after refusals', (await one(`SELECT currency FROM public.tours WHERE id = ${T}`))[0].currency, 'GBP');

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log('\nall passed');

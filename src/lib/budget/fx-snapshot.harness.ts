/* ============================================================
   LOWPASS — FX-unify P&L snapshot harness (Stage 2 money gate)

   Runs the P&L-affecting waterfall over a fixed multi-currency fixture, the
   BEFORE way (expenses converted with the static GBP-pivot table, fx.ts
   convertToCurrency) and the AFTER way (expenses converted with the tour's
   budget_fx_rates via toTourCurrency — the same converter income already uses).

   The income side is UNCHANGED by Stage 2 (it already converts through
   budget_fx_rates + locked_fx_rate), so any P&L delta is entirely the expense
   conversion moving off the stale hardcoded table onto the tour's real rates —
   which is the whole point: the old expense numbers were wrong.

   Pure: imports only fx.ts (no imports) + fxRates.ts (type-only import), so it
   runs under `node --experimental-strip-types` like reconcile.harness.ts.

   Run:  node --experimental-strip-types src/lib/budget/fx-snapshot.harness.ts
   ============================================================ */

import { convertToCurrency } from './fx.ts';
import { toTourCurrency, type FxRateMap } from './fxRates.ts';

const TOUR = 'GBP';

/* The tour's real per-currency rates (budget_fx_rates). Deliberately DIFFERENT
   from fx.ts's static table (USD 0.79, EUR 0.85, CAD 0.58) so the diff is
   visible — this is what a real tour's admin-set rates look like. */
const RATES: FxRateMap = { USD: 0.80, EUR: 0.86, CAD: 0.60 };

interface Line { ccy: string; proposed: number; actual: number }
const EXPENSES: Line[] = [
  { ccy: 'GBP', proposed: 2000, actual: 1800 },
  { ccy: 'USD', proposed: 5000, actual: 4500 },
  { ccy: 'EUR', proposed: 3000, actual: 2800 },
  { ccy: 'CAD', proposed: 1200, actual: 0 },
];

/* Income (unchanged by Stage 2). Per-tour live rate for projected; locked rate
   for a settled row. Modelled exactly as computeBudgetPnl does. */
interface Inc { ccy: string; guarProj: number; guarAct: number; locked?: number }
const INCOME: Inc[] = [
  { ccy: 'GBP', guarProj: 10000, guarAct: 10000 },
  { ccy: 'USD', guarProj: 8000, guarAct: 8000, locked: 0.82 }, // settled at 0.82
  { ccy: 'EUR', guarProj: 6000, guarAct: 0 }, // not settled → live rate
];

const SETTINGS = { insurance: 0.03, contingency: 0.02, accountancy: 0.10 };

function grossIncome(): { projected: number; actual: number } {
  let projected = 0;
  let actual = 0;
  for (const i of INCOME) {
    const fLive = toTourCurrency(1, i.ccy, TOUR, RATES);
    const fLocked = i.locked != null && i.locked > 0 ? i.locked : fLive;
    projected += i.guarProj * fLive;
    actual += i.guarAct * fLocked;
  }
  return { projected, actual };
}

function baseExpenses(mode: 'before' | 'after'): { projected: number; actual: number } {
  let projected = 0;
  let actual = 0;
  for (const l of EXPENSES) {
    if (mode === 'before') {
      projected += convertToCurrency(l.proposed, l.ccy, TOUR);
      actual += convertToCurrency(l.actual, l.ccy, TOUR);
    } else {
      // AFTER: expense conversion goes through the tour's budget_fx_rates, the
      // same converter income uses. (No expense row is locked in this fixture —
      // migration 234's locked_fx_rate is empty until a line first actualizes.)
      projected += toTourCurrency(l.proposed, l.ccy, TOUR, RATES);
      actual += toTourCurrency(l.actual, l.ccy, TOUR, RATES);
    }
  }
  return { projected, actual };
}

function waterfall(mode: 'before' | 'after') {
  const gross = grossIncome();
  const base = baseExpenses(mode);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const overheads = (baseVal: number, grossVal: number) =>
    SETTINGS.insurance * baseVal + SETTINGS.contingency * baseVal + SETTINGS.accountancy * grossVal;
  const totalProj = base.projected + overheads(base.projected, gross.projected);
  const totalAct = base.actual + overheads(base.actual, gross.actual);
  return {
    grossProjected: r2(gross.projected),
    grossActual: r2(gross.actual),
    baseProjected: r2(base.projected),
    baseActual: r2(base.actual),
    totalProjected: r2(totalProj),
    totalActual: r2(totalAct),
    netProjected: r2(gross.projected - totalProj),
    netActual: r2(gross.actual - totalAct),
  };
}

const before = waterfall('before');
const after = waterfall('after');

const rows: Array<[string, keyof typeof before]> = [
  ['Gross income  (proj)', 'grossProjected'],
  ['Gross income  (act) ', 'grossActual'],
  ['Base expenses (proj)', 'baseProjected'],
  ['Base expenses (act) ', 'baseActual'],
  ['Total expense (proj)', 'totalProjected'],
  ['Total expense (act) ', 'totalActual'],
  ['NET           (proj)', 'netProjected'],
  ['NET           (act) ', 'netActual'],
];

console.log('\nFX-unify P&L snapshot — tour currency', TOUR);
console.log('  static table (fx.ts): USD 0.79 / EUR 0.85 / CAD 0.58');
console.log('  tour rates  (after):  USD 0.80 / EUR 0.86 / CAD 0.60\n');
console.log('line'.padEnd(22), 'BEFORE'.padStart(12), 'AFTER'.padStart(12), 'Δ'.padStart(12));
console.log('-'.repeat(60));
for (const [label, key] of rows) {
  const b = before[key];
  const a = after[key];
  const d = Math.round((a - b) * 100) / 100;
  console.log(label.padEnd(22), b.toFixed(2).padStart(12), a.toFixed(2).padStart(12), (d >= 0 ? '+' : '') + d.toFixed(2));
}
console.log('-'.repeat(60));
console.log('Income rows identical before/after (already per-tour). All Δ is the');
console.log('expense conversion moving off the stale static table onto tour rates.\n');

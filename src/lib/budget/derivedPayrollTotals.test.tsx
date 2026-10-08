/* ============================================
   LOWPASS — the derived-payroll read path, and the commission hole it closes

   These tests exist because of a SILENT failure, so they are written as
   positive assertions about a NUMBER rather than "it doesn't throw".

   The bug: `computeCommissionContext` summed `payroll_entries.total_fee` for
   actuals and pre-261 legacy-column arithmetic for proposed. On a tour where
   nobody had painted a day status the first is empty and the second is zero,
   so `subtotalDirect{Proposed,Actual}` silently omitted EVERY salary and
   per diem — and every commission on a `net` basis was computed against it.
   Nothing errored. Nothing logged. The harnesses stayed green, because they
   test `fees.ts`, which was never the broken part.

   So the pins below assert (a) that the derived lines are read at all, and
   (b) that a salary present in the lines MOVES a net-basis commission. A test
   that only checked "returns a number" would have passed throughout.

   Named .test.tsx because vitest is scoped to that extension here; both
   modules under test are pure TypeScript with no DOM.
   ============================================ */

import { describe, it, expect } from 'vitest';
import {
  derivedPayrollTotals,
  derivedPayrollByPerson,
  PAYROLL_SALARY_SOURCE,
  PAYROLL_PER_DIEM_SOURCE,
} from './derivedPayrollTotals';
import { computeBudgetPnl } from '@/lib/budget/computeBudgetPnl';
import type { BudgetLineItem } from '@/types';

/** A tour's derived lines as `reconcileDerivedBudgetLines` writes them:
 *  one salary + one per-diem line per roster member, proposed == actual
 *  while the active version is a draft. */
const LINES = [
  { source_entity_type: PAYROLL_SALARY_SOURCE, source_entity_id: 'p1', category: 'crew', proposed_cost: 5000, actual_cost: 5000 },
  { source_entity_type: PAYROLL_SALARY_SOURCE, source_entity_id: 'p2', category: 'crew', proposed_cost: 3000, actual_cost: 3200 },
  { source_entity_type: PAYROLL_PER_DIEM_SOURCE, source_entity_id: 'p1', category: 'per_diems', proposed_cost: 650, actual_cost: 650 },
  { source_entity_type: PAYROLL_PER_DIEM_SOURCE, source_entity_id: 'p2', category: 'per_diems', proposed_cost: 650, actual_cost: 700 },
  // Manual, non-derived lines that must NOT be counted as payroll.
  { source_entity_type: null, source_entity_id: null, category: 'hotels', proposed_cost: 1200, actual_cost: 1200 },
  { source_entity_type: 'hotel_booking', source_entity_id: 'h1', category: 'hotels', proposed_cost: 400, actual_cost: 400 },
];

describe('derivedPayrollTotals', () => {
  it('sums salary and per-diem separately, proposed and actual', () => {
    expect(derivedPayrollTotals(LINES)).toEqual({
      proposedSalaries: 8000,
      actualSalaries: 8200,
      proposedPerDiem: 1300,
      actualPerDiem: 1350,
    });
  });

  it('counts nothing that is not a derived payroll line', () => {
    const hotelsOnly = LINES.filter((l) => l.category === 'hotels');
    expect(derivedPayrollTotals(hotelsOnly)).toEqual({
      proposedSalaries: 0,
      actualSalaries: 0,
      proposedPerDiem: 0,
      actualPerDiem: 0,
    });
  });

  it('is zero-safe on an empty / absent line set', () => {
    expect(derivedPayrollTotals([]).actualSalaries).toBe(0);
    expect(derivedPayrollTotals(null).actualSalaries).toBe(0);
    expect(derivedPayrollTotals(undefined).proposedPerDiem).toBe(0);
  });

  it('coerces the numeric-string costs Postgres numerics arrive as', () => {
    const t = derivedPayrollTotals([
      { source_entity_type: PAYROLL_SALARY_SOURCE, source_entity_id: 'p1', proposed_cost: '1500.50', actual_cost: '1500.50' },
    ]);
    expect(t.proposedSalaries).toBeCloseTo(1500.5, 6);
  });

  it('keys per-person totals by personnel_rates.id, both buckets on one entry', () => {
    const byPerson = derivedPayrollByPerson(LINES);
    expect(byPerson.get('p2')).toEqual({
      proposedFee: 3000,
      actualFee: 3200,
      proposedPerDiem: 650,
      actualPerDiem: 700,
    });
    // Hotels carry a source_entity_id too — it must not land in the map.
    expect(byPerson.has('h1')).toBe(false);
  });
});

/* ── The commission hole ─────────────────────────────────────────────────── */

/* Money repair (Oct 2026): `computeCommissionContext` is deleted — it was one
   of four commission formulas, with no live caller. The same pins now hold the
   ONE formula every screen uses, `computeBudgetPnl`. */
const INCOME = [{ post_tax_guarantee: 100_000, actual_guarantee: 100_000 }];
const NO_OVERHEADS = { insurance_pct: 0, contingency_pct: 0, accountancy_pct: 0 };
const NET_10 = [{ id: 'c1', label: 'Agency', percentage: 0.1, basis: 'net' }];
const GROSS_10 = [{ id: 'c1', label: 'Agency', percentage: 0.1, basis: 'gross' }];
const pnl = (lines: typeof LINES, commissions = NET_10) =>
  computeBudgetPnl({
    lines: lines as unknown as BudgetLineItem[],
    income: INCOME,
    commissions,
    settings: NO_OVERHEADS,
    tourCurrency: 'GBP',
  });

describe('computeBudgetPnl — salaries reach the expense base', () => {
  it('includes derived salary + per diem in the base on BOTH sides', () => {
    // 8000 salary + 1300 per diem + 1600 hotels
    expect(pnl(LINES).baseExpenses.projected).toBe(10_900);
    // 8200 salary + 1350 per diem + 1600 hotels
    expect(pnl(LINES).baseExpenses.actual).toBe(11_150);
  });

  it('a net-basis commission MOVES when payroll is present — the regression pin', () => {
    const withPayroll = pnl(LINES).commissions.projected;
    const withoutPayroll = pnl(LINES.filter((l) => l.category === 'hotels')).commissions.projected;
    // net = gross − expenses. 100_000 − 10_900 vs 100_000 − 1_600.
    expect(withPayroll).toBeCloseTo(8_910, 6);
    expect(withoutPayroll).toBeCloseTo(9_840, 6);
  });

  it('a gross-basis commission is unaffected — the documented exception', () => {
    expect(pnl(LINES, GROSS_10).commissions.projected).toBe(10_000);
    expect(pnl([], GROSS_10).commissions.projected).toBe(10_000);
  });

  it('a 0% overhead stays 0% (the deleted summary formula read 0% insurance as 3%)', () => {
    const r = pnl(LINES, GROSS_10);
    expect(r.insurance.projected).toBe(0);
    expect(r.contingency.projected).toBe(0);
  });

  it('a whole-number commission (15 = 15%) is normalised, not 1500%', () => {
    const r = pnl([], [{ id: 'c1', label: 'Agency', percentage: 15, basis: 'gross' }]);
    expect(r.commissions.projected).toBe(15_000);
  });
});

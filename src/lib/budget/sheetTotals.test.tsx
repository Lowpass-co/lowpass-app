/* ============================================
   LOWPASS — sheet totals tie to the P&L (Oct 2026)

   The budget sheet's top-left block must add up to exactly what
   computeBudgetPnl calls base expenses — both columns, with foreign-currency
   lines and a locked actual rate in the mix.
   ============================================ */

import { describe, it, expect } from 'vitest';
import { sheetTotalsBySection } from './sheetTotals';
import { computeBudgetPnl } from './computeBudgetPnl';
import type { BudgetLineItem, BudgetSection } from '@/types';

const sec = (id: string, name: string, sort_order: number) => ({ id, name, sort_order }) as unknown as BudgetSection;
const line = (o: Record<string, unknown>) =>
  ({ id: Math.random().toString(36), proposed_cost: 0, actual_cost: 0, currency: null, section: null, section_id: null, locked_fx_rate: null, ...o }) as unknown as BudgetLineItem;

const sections = [sec('s2', 'Hotels', 2), sec('s1', 'Salaries', 1), sec('s3', 'Empty', 3)];
const fx = { USD: 0.8 };
const lines = [
  line({ section_id: 's1', proposed_cost: 1000, actual_cost: 900 }),
  line({ section_id: 's1', proposed_cost: 500, actual_cost: 0 }),
  line({ section_id: 's2', proposed_cost: 100, actual_cost: 100, currency: 'USD' }),
  line({ section_id: 's2', proposed_cost: 200, actual_cost: 200, currency: 'USD', locked_fx_rate: 0.75 }),
  line({ section_id: null, proposed_cost: 50, actual_cost: 10 }),
  line({ section_id: 'gone', proposed_cost: 5, actual_cost: 0 }),
  line({ section: 'income', proposed_cost: 99999, actual_cost: 99999 }),
];

describe('sheetTotalsBySection', () => {
  const rows = sheetTotalsBySection(lines, sections, 'GBP', fx);

  it('one row per section that has money, in sheet order, then Uncategorised', () => {
    expect(rows.map((r) => r.name)).toEqual(['Salaries', 'Hotels', 'Uncategorised']);
  });

  it('converts like the P&L (live rate for proposed, locked rate for actual)', () => {
    const hotels = rows.find((r) => r.name === 'Hotels')!;
    expect(hotels.projected).toBeCloseTo(100 * 0.8 + 200 * 0.8);
    expect(hotels.actual).toBeCloseTo(100 * 0.8 + 200 * 0.75);
  });

  it('Σ rows === computeBudgetPnl base expenses, both columns', () => {
    const pnl = computeBudgetPnl({ lines, income: [], commissions: [], settings: null, tourCurrency: 'GBP', fxRates: fx });
    const p = rows.reduce((n, r) => n + r.projected, 0);
    const a = rows.reduce((n, r) => n + r.actual, 0);
    expect(p).toBeCloseTo(pnl.baseExpenses.projected);
    expect(a).toBeCloseTo(pnl.baseExpenses.actual);
  });

  it('income rows never count as expenses', () => {
    expect(rows.every((r) => r.projected < 99999)).toBe(true);
  });
});

import { rateFactFor } from '@/server/budget/payrollRateFacts';
import { countDayStatuses } from '@/lib/payroll/fees';

describe('rateFactFor — the days explain a day-rate person\'s pay', () => {
  it('rehearsal and travel count as off days, so rate × days = pay', () => {
    const ctx = {
      types: [],
      linesByRateId: new Map([['p', [{ rate_type_id: '00000000-0000-0000-0000-0000000000a6', amount: 250 }]]]),
      legacyByRateId: new Map(),
    };
    const counts = countDayStatuses({ d1: 'show', d2: 'show', d3: 'off_travel', d4: 'rehearsal', d5: 'pd_only' });
    const f = rateFactFor(ctx as never, 'p', counts);
    expect(f).toMatchObject({ showRate: 250, offRate: 250, showDays: 2, offDays: 2 });
  });
});

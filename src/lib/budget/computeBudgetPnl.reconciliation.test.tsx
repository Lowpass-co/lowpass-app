/* ============================================
   LOWPASS — P&L options from the USA '26 reconciliation (migration 274)

   Rebuilds the Charlotte Sands USA '26 figures the business manager (W&A)
   reported, so each new option is pinned against a real P&L:

     show income (commissionable) 50,857.58 · CAN withholding 675
     agency 10% / management 15% / business management 5% of show income
       = 5,085.76 / 7,628.64 / 2,542.88
     buy-on 10,000 + sponsorship 1,500 (tour-level income)
     BandWagon refundable damage deposit 3,500 (owed back, not a cost)
     insurance: the real invoice 808.81, not 3%
     Lowpass INV-0050: £14,926.32 paid at the bank's 1.3508 = $20,162.47
   ============================================ */

import { describe, it, expect } from 'vitest';
import { computeBudgetPnl, normalizeComponents, type IncomeInput } from './computeBudgetPnl';
import { sheetTotalsBySection } from './sheetTotals';
import type { BudgetLineItem, BudgetSection } from '@/types';

const line = (o: Record<string, unknown>) =>
  ({
    id: Math.random().toString(36),
    proposed_cost: 0,
    actual_cost: 0,
    currency: null,
    section: null,
    section_id: null,
    locked_fx_rate: null,
    ...o,
  }) as unknown as BudgetLineItem;

// W&A's per-show revenue (actuals, pre-tax). Toronto carries 15% withholding,
// itemised on the settlement → actual_deductions.
const REVENUE = [7500, 5500, 5137.46, 6000, 4500, 4000, 5000, 2000, 1500, 3220.12, 6500];
const shows: IncomeInput[] = REVENUE.map((g, i) => ({
  pre_tax_guarantee: g,
  withholding_pct: i === 4 ? 15 : 0,
  actual_guarantee: g,
  actual_deductions: i === 4 ? 675 : 0,
}));

const W_AND_A = [
  { id: 'agency', label: 'Agency', percentage: 0.1, basis: 'gross', basis_components: ['show'] },
  { id: 'mgmt', label: 'Management', percentage: 0.15, basis: 'gross', basis_components: ['show'] },
  { id: 'bm', label: 'Business management', percentage: 0.05, basis: 'gross', basis_components: ['show'] },
];

describe('commission components — W&A\'s method', () => {
  const pnl = computeBudgetPnl({ lines: [], income: shows, commissions: W_AND_A, settings: null, tourCurrency: 'USD' });
  const row = (id: string) => pnl.commissionRows.find((r) => r.id === id)!;

  it('show income before tax is W&A\'s commissionable income', () => {
    expect(pnl.showIncome.preTax.actual).toBeCloseTo(50857.58, 2);
  });

  it('agency / management / business management match W&A to the cent', () => {
    expect(row('agency').actual).toBeCloseTo(5085.76, 2);
    expect(row('mgmt').actual).toBeCloseTo(7628.64, 2);
    expect(row('bm').actual).toBeCloseTo(2542.88, 2);
  });

  it('after-tax show income takes the itemised withholding off', () => {
    expect(pnl.showIncome.postTax.actual).toBeCloseTo(50857.58 - 675, 2);
    const post = computeBudgetPnl({
      lines: [],
      income: shows,
      commissions: [{ ...W_AND_A[0], basis_pre_tax: false }],
      settings: null,
      tourCurrency: 'USD',
    });
    expect(post.commissionRows[0].actual).toBeCloseTo(0.1 * (50857.58 - 675), 2);
  });

  it('show + merch + VIP: management on merch (net of COGS) and VIP too', () => {
    const income: IncomeInput[] = [...shows, { actual_merch: 16834.18, actual_vip: 10751.67 }];
    const p = computeBudgetPnl({
      lines: [],
      income,
      commissions: [{ id: 'm', label: 'Management', percentage: 15, basis_components: ['vip', 'show', 'merch', 'show'] }],
      settings: { merch_cogs_pct: 0 },
      tourCurrency: 'USD',
    });
    expect(p.commissionRows[0].components).toEqual(['show', 'merch', 'vip']);
    expect(p.commissionRows[0].actual).toBeCloseTo(0.15 * (50857.58 + 16834.18 + 10751.67), 2);
  });

  it('unknown / empty components fall back to the legacy single basis', () => {
    expect(normalizeComponents(['tips'])).toBeNull();
    expect(normalizeComponents([])).toBeNull();
    expect(normalizeComponents(null)).toBeNull();
    const p = computeBudgetPnl({
      lines: [],
      income: shows,
      commissions: [{ id: 'g', label: 'Legacy', percentage: 0.1, basis: 'gross', basis_components: [] }],
      settings: null,
      tourCurrency: 'USD',
    });
    expect(p.commissionRows[0].actual).toBeCloseTo(0.1 * p.grossIncome.actual, 2);
  });
});

describe('Other income — buy-on + sponsorship are income, not lost', () => {
  const lines = [
    line({ section: 'income', label: 'Support buy-on', proposed_cost: 10000, actual_cost: 10000, income_commissionable: false }),
    line({ section: 'income', label: 'Sponsorship', proposed_cost: 1500, actual_cost: 1500 }),
    line({ label: 'Fuel', proposed_cost: 5250, actual_cost: 7655.89 }),
  ];
  const pnl = computeBudgetPnl({
    lines,
    income: shows,
    commissions: [{ id: 'o', label: 'Mgmt on other', percentage: 0.15, basis_components: ['other'] }],
    settings: null,
    tourCurrency: 'USD',
  });

  it('adds to gross income (before 274 it vanished from both sides)', () => {
    expect(pnl.incomeBreakdown.other.actual).toBe(11500);
    expect(pnl.grossIncome.actual).toBeCloseTo(50857.58 - 675 + 11500, 2);
  });

  it('is never an expense', () => {
    expect(pnl.baseExpenses.actual).toBeCloseTo(7655.89, 2);
  });

  it('only commissionable lines feed an "Other income" commission', () => {
    expect(pnl.commissionRows[0].actual).toBeCloseTo(0.15 * 1500, 2);
  });
});

describe('refundable deposits — owed back, not a cost', () => {
  const lines = [
    line({ label: 'BandWagon rental', proposed_cost: 12880.44, actual_cost: 12880.44 }),
    line({ label: 'Damage deposit', proposed_cost: 3500, actual_cost: 3500, refundable_status: 'pending' }),
    line({ label: 'Old deposit', proposed_cost: 500, actual_cost: 500, refundable_status: 'returned' }),
    line({ label: 'Lost deposit', proposed_cost: 200, actual_cost: 200, refundable_status: 'forfeited' }),
  ];
  const pnl = computeBudgetPnl({ lines, income: [], commissions: [], settings: null, tourCurrency: 'USD' });

  it('pending + returned stay out of costs; forfeited counts', () => {
    expect(pnl.baseExpenses.actual).toBeCloseTo(12880.44 + 200, 2);
  });

  it('reports what is still owed back, and what came back', () => {
    expect(pnl.deposits.owedBack.actual).toBe(3500);
    expect(pnl.deposits.returned.actual).toBe(500);
  });
});

describe('overheads — flat amounts, real invoices, show-income base', () => {
  const base = [line({ label: 'Costs', proposed_cost: 60000, actual_cost: 65000 })];

  it('insurance: projected 3% of income, actual = the real invoice', () => {
    const pnl = computeBudgetPnl({
      lines: base,
      income: shows,
      commissions: [],
      settings: { insurance_pct: 0.03, insurance_basis: 'income_gross', insurance_actual_amount: 808.81 },
      tourCurrency: 'USD',
    });
    expect(pnl.insurance.projected).toBeCloseTo(0.03 * pnl.grossIncome.projected, 2);
    expect(pnl.insurance.actual).toBe(808.81);
    expect(pnl.actualOverridden.insurance).toBe(true);
  });

  it('flat mode: a fixed fee both columns (Mumford\'s $1,500 accountancy)', () => {
    const pnl = computeBudgetPnl({
      lines: base,
      income: shows,
      commissions: [],
      settings: { accountancy_pct: 0.05, accountancy_mode: 'flat', accountancy_flat_amount: 1500 },
      tourCurrency: 'USD',
    });
    expect(pnl.accountancy.projected).toBe(1500);
    expect(pnl.accountancy.actual).toBe(1500);
    expect(pnl.mode.accountancy).toBe('flat');
  });

  it('income_show base: 5% of show income before tax', () => {
    const pnl = computeBudgetPnl({
      lines: base,
      income: shows,
      commissions: [],
      settings: { accountancy_pct: 0.05, accountancy_basis: 'income_show' },
      tourCurrency: 'USD',
    });
    expect(pnl.accountancy.actual).toBeCloseTo(2542.88, 2);
  });

  it('a blank typed actual is ignored (computed figure stays)', () => {
    const pnl = computeBudgetPnl({
      lines: base,
      income: [],
      commissions: [],
      settings: { contingency_pct: 0.02, contingency_basis: 'expenses_total', contingency_actual_amount: null },
      tourCurrency: 'USD',
    });
    expect(pnl.contingency.actual).toBeCloseTo(0.02 * 65000, 2);
    expect(pnl.actualOverridden.contingency).toBe(false);
  });
});

describe('bank margin + the rate the bank actually paid', () => {
  const fx = { GBP: 1.3251, EUR: 1.1 };
  const lines = [
    // Lowpass INV-0050: entered in £, actualized at the bank's 1.3508.
    line({ label: 'INV-0050', currency: 'GBP', proposed_cost: 14926.32, actual_cost: 14926.32, locked_fx_rate: 1.3508 }),
    line({ label: 'Local cost', currency: 'USD', proposed_cost: 1000, actual_cost: 1000 }),
  ];
  const income: IncomeInput[] = [{ pre_tax_guarantee: 2500, currency: 'EUR' }];
  const pnl = computeBudgetPnl({ lines, income, commissions: [], settings: { fx_margin_pct: 0.02 }, tourCurrency: 'USD', fxRates: fx });

  it('the actual is what the bank paid ($20,162.47), no margin', () => {
    expect(pnl.baseExpenses.actual - 1000).toBeCloseTo(20162.47, 1);
  });

  it('a foreign projected cost costs 2% more; a home-currency one does not', () => {
    expect(pnl.baseExpenses.projected).toBeCloseTo(14926.32 * 1.3251 * 1.02 + 1000, 2);
  });

  it('foreign projected income arrives 2% light', () => {
    expect(pnl.grossIncome.projected).toBeCloseTo(2500 * 1.1 * 0.98, 2);
    expect(pnl.fxMarginPct).toBe(0.02);
  });

  it('an out-of-range margin is ignored', () => {
    const p = computeBudgetPnl({ lines, income, commissions: [], settings: { fx_margin_pct: 0.9 }, tourCurrency: 'USD', fxRates: fx });
    expect(p.fxMarginPct).toBe(0);
  });
});

describe('the sheet still ties to the P&L with every option on', () => {
  const sections = [{ id: 's1', name: 'Transport', sort_order: 1 }] as unknown as BudgetSection[];
  const fx = { GBP: 1.3251 };
  const lines = [
    line({ section_id: 's1', proposed_cost: 12880.44, actual_cost: 12880.44 }),
    line({ section_id: 's1', proposed_cost: 3500, actual_cost: 3500, refundable_status: 'pending' }),
    line({ section_id: 's1', currency: 'GBP', proposed_cost: 1000, actual_cost: 1000, locked_fx_rate: 1.3508 }),
    line({ section: 'income', proposed_cost: 10000, actual_cost: 10000 }),
  ];
  const settings = { fx_margin_pct: 0.02 };
  const pnl = computeBudgetPnl({ lines, income: [], commissions: [], settings, tourCurrency: 'USD', fxRates: fx });
  const rows = sheetTotalsBySection(lines, sections, 'USD', fx, settings.fx_margin_pct);

  it('Σ section rows === base expenses (both columns)', () => {
    expect(rows.reduce((n, r) => n + r.projected, 0)).toBeCloseTo(pnl.baseExpenses.projected, 6);
    expect(rows.reduce((n, r) => n + r.actual, 0)).toBeCloseTo(pnl.baseExpenses.actual, 6);
  });
});

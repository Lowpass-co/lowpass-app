/* Income & settlements — the rules (Nov 2026, Adam). */

import { describe, expect, it } from 'vitest';
import type { IncomeRow } from '@/lib/budget/income';
import type { ShowWalk } from '@/lib/settlement/loadWalk';
import { computeWalk } from '@/lib/settlement/walk';
import { applySettlementPatch, blankWalk, buildShowList, defaultShowId, expectedOf, fillFromDeal, fillPlan, hasNightFigures, recomputeWalk, showStatus, statusSummary, withholdingToAdd } from './showMoney';
import { dealLabel, normaliseDealType, tieredShare } from './deal';

const inc = (o: Partial<IncomeRow>): IncomeRow =>
  ({
    routing_id: 'r',
    date: '2026-11-01',
    venue_name: 'Venue',
    city: 'City',
    day_type: 'show',
    pre_tax_guarantee: 0,
    withholding_pct: 0,
    pre_tax_overage: 0,
    merch_income: 0,
    vip_income: 0,
    currency: null,
    actual_vip: null,
    ...o,
  }) as unknown as IncomeRow;

const walkOf = (o: Partial<ShowWalk>): ShowWalk => {
  const w = {
    settlementId: null,
    routingId: 'r',
    currency: 'USD',
    guarantee: 0,
    overage: 0,
    merch: 0,
    depositReceived: 0,
    fullAndFinal: false,
    comps: null,
    ticketsSold: null,
    grossBO: null,
    contractedGuarantee: 0,
    deductionsAreLegacy: false,
    deductions: [],
    expenses: [],
    payments: [],
    date: '2026-11-01',
    city: 'City',
    venue_name: 'Venue',
    day_type: 'show',
    ...o,
  } as ShowWalk;
  w.walk = computeWalk({ guarantee: w.guarantee, deductions: w.deductions, expenses: w.expenses, overage: w.overage, merch: w.merch, depositReceived: w.depositReceived, payments: w.payments });
  return w;
};

describe('Expected', () => {
  it('equals the old "Contracted": post-tax guarantee + post-tax overage + merch + VIP', () => {
    const e = expectedOf(inc({ pre_tax_guarantee: 10000, pre_tax_overage: 2000, withholding_pct: 20, merch_income: 1500, vip_income: 500 }));
    const oldContracted = 10000 * 0.8 + 2000 * 0.8 + 1500 + 500;
    expect(e.total).toBeCloseTo(oldContracted, 6);
    expect(e.withholding).toBeCloseTo(2400, 6);
    expect(e.settlementTotal).toBeCloseTo(oldContracted - 500, 6); // VIP paid separately
  });
});

describe('status is honest', () => {
  const today = '2026-11-10';
  it('untouched: upcoming before the date, to settle after — never settled', () => {
    expect(showStatus('2026-11-20', walkOf({}), today)).toBe('upcoming');
    expect(showStatus('2026-11-01', walkOf({}), today)).toBe('to_settle');
    expect(showStatus('2026-11-01', null, today)).toBe('to_settle');
  });
  it('anything typed → in progress; full & final → settled, or awaiting payment while owed', () => {
    expect(showStatus('2026-11-01', walkOf({ guarantee: 5000 }), today)).toBe('in_progress');
    expect(showStatus('2026-11-01', walkOf({ ticketsSold: 900 }), today)).toBe('in_progress');
    expect(showStatus('2026-11-01', walkOf({ guarantee: 5000, fullAndFinal: true }), today)).toBe('awaiting_payment');
    expect(showStatus('2026-11-01', walkOf({ guarantee: 5000, fullAndFinal: true, payments: [{ id: 'p', method: 'wire', amount: 5000, currency: null, paid_on: null, note: null }] }), today)).toBe('settled');
  });
  it('a legacy single deductions figure counts as typed', () => {
    expect(hasNightFigures(walkOf({ deductionsAreLegacy: true }))).toBe(true);
  });
});

describe('the show list', () => {
  const today = '2026-11-10';
  it('joins income and settlements by day, adds a non-show day only when it has income, sorts by date', () => {
    const rows = buildShowList(
      [inc({ routing_id: 'a', date: '2026-11-05', pre_tax_guarantee: 1000, currency: 'GBP' }), inc({ routing_id: 'off', date: '2026-11-06', day_type: 'off' }), inc({ routing_id: 'tv', date: '2026-11-07', day_type: 'tv', pre_tax_guarantee: 300 })],
      [walkOf({ routingId: 'b', date: '2026-11-01' }), walkOf({ routingId: 'a', date: '2026-11-05' })],
      'usd',
      today,
    );
    expect(rows.map((r) => r.routingId)).toEqual(['b', 'a', 'tv']);
    expect(rows.find((r) => r.routingId === 'a')!.currency).toBe('GBP');
    expect(rows.find((r) => r.routingId === 'b')!.currency).toBe('USD');
    expect(rows.find((r) => r.routingId === 'a')!.walk).not.toBeNull();
  });
  it('opens on the show that needs you first; counts read in plain words', () => {
    const rows = buildShowList([], [walkOf({ routingId: 'past', date: '2026-11-01' }), walkOf({ routingId: 'next', date: '2026-11-20' })], 'USD', today);
    expect(defaultShowId(rows)).toBe('past');
    expect(statusSummary(rows)).toBe('1 to settle · 1 upcoming');
    expect(statusSummary([])).toBe('No shows yet');
  });
});

describe('Fill from the deal', () => {
  it('fills only the blank actuals, pre-tax (withholding is a deduction on the night)', () => {
    const e = expectedOf(inc({ pre_tax_guarantee: 10000, pre_tax_overage: 500, withholding_pct: 20, merch_income: 900 }));
    expect(fillFromDeal(e, null)).toEqual({ reconciled_guarantee: 10000, reconciled_overage: 500, reconciled_merch: 900 });
    expect(fillFromDeal(e, walkOf({ guarantee: 9000 }))).toEqual({ reconciled_overage: 500, reconciled_merch: 900 });
    expect(fillFromDeal(expectedOf(null), null)).toEqual({});
  });
});

describe('one deal list', () => {
  it('maps both old vocabularies', () => {
    expect(['VS', 'vs', 'guarantee_plus'].map(normaliseDealType)).toEqual(['VS', 'VS', 'VS']);
    expect(['FLAT', 'guarantee', 'flat', 'festival'].map(normaliseDealType)).toEqual(['FLAT', 'FLAT', 'FLAT', 'FLAT']);
    expect(['door_deal', 'DOOR'].map(normaliseDealType)).toEqual(['DOOR', 'DOOR']);
    expect(normaliseDealType('PLUS')).toBe('PLUS');
    expect(dealLabel('guarantee_plus')).toBe('Versus');
    expect(dealLabel(null)).toBe('No deal set');
  });
  it('the escalator is marginal', () => {
    expect(tieredShare(30000, 600, 0.85, 500, 0.9)).toBeCloseTo(25750, 6);
    expect(tieredShare(30000, 500, 0.85, 500, 0.9)).toBeCloseTo(25500, 6);
    expect(tieredShare(30000, 600, 0.85, null, 0.9)).toBeCloseTo(25500, 6);
  });
});

describe('the night, edited on the page (Nov 2026 — no page reload)', () => {
  const deal = expectedOf({ pre_tax_guarantee: 2500, withholding_pct: 30, pre_tax_overage: 0, merch_income: 0, vip_income: 0 } as IncomeRow);

  it('Adam’s screenshot: guarantee typed, withholding not — the night offers the $750 the deal takes off', () => {
    const w = walkOf({ guarantee: 2500 });
    expect(deal.settlementTotal).toBe(1750);
    expect(withholdingToAdd(deal, w)).toBe(750);
    // Once a withholding line is there, no second one.
    expect(withholdingToAdd(deal, walkOf({ guarantee: 2500, deductions: [{ id: 'd', kind: 'withholding', label: null, amount: 750, currency: null }] }))).toBeNull();
    // Nothing typed yet → nothing to take it off.
    expect(withholdingToAdd(deal, walkOf({}))).toBeNull();
    // No withholding on the deal → nothing.
    expect(withholdingToAdd(expectedOf({ pre_tax_guarantee: 2500 } as IncomeRow), w)).toBeNull();
  });

  it('Fill from the deal types the guarantee AND the withholding, so Actual = Expected', () => {
    const plan = fillPlan(deal, null);
    expect(plan.patch).toEqual({ reconciled_guarantee: 2500 });
    expect(plan.withholding).toBe(750);
    let w = applySettlementPatch(blankWalk({ routingId: 'r', currency: 'USD', date: null, city: null, venue: null, dayType: 'show' }), plan.patch);
    w = recomputeWalk({ ...w, deductions: [{ id: 't', kind: 'withholding', label: '30%', amount: plan.withholding!, currency: null }] });
    expect(w.walk.artistTotal).toBe(deal.settlementTotal);
  });

  it('withholding is taken off the ACTUAL guarantee + overage, to the cent', () => {
    expect(withholdingToAdd(expectedOf({ pre_tax_guarantee: 1000, withholding_pct: 37 } as IncomeRow), walkOf({ guarantee: 1234.56, overage: 100 }))).toBe(493.79);
  });

  it('a settlement save is shown at once with the same maths the server keeps', () => {
    const w = applySettlementPatch(walkOf({ guarantee: 1000 }), { reconciled_overage: 200, deposit_received: 300, comps: 12, full_and_final: true, status: 'reconciled' });
    expect(w.overage).toBe(200);
    expect(w.walk.artistTotal).toBe(1200);
    expect(w.walk.balanceDue).toBe(900);
    expect(w.comps).toBe(12);
    expect(w.fullAndFinal).toBe(true);
    // Clearing a figure is 0 on the walk (blank on screen), not a crash.
    expect(applySettlementPatch(w, { reconciled_overage: null }).walk.artistTotal).toBe(1000);
  });

  it('a legacy one-figure deduction still counts until lines are added', () => {
    const legacy = { ...walkOf({ guarantee: 1000, deductionsAreLegacy: true }), walk: computeWalk({ guarantee: 1000, deductions: [{ amount: 100 }], expenses: [], overage: 0, merch: 0, depositReceived: 0, payments: [] }) };
    expect(recomputeWalk(legacy).walk.artistTotal).toBe(900);
  });
});

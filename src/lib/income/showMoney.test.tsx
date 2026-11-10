/* Income & settlements — the rules (Nov 2026, Adam). */

import { describe, expect, it } from 'vitest';
import type { IncomeRow } from '@/lib/budget/income';
import type { ShowWalk } from '@/lib/settlement/loadWalk';
import { computeWalk } from '@/lib/settlement/walk';
import { buildShowList, defaultShowId, expectedOf, fillFromDeal, hasNightFigures, showStatus, statusSummary } from './showMoney';
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

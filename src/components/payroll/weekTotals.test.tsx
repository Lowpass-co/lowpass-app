/* LOWPASS — week blocks' totals add up to the tour total (Oct 2026). */
import { describe, it, expect } from 'vitest';
import { buildAmountMap, oneOffTotals, personTotals, weekTotals } from './rateLinesClient';
import { countDayStatuses } from '@/lib/payroll/fees';
import { DEFAULT_RATE_TYPE_IDS as ID, type RateTypeMeta } from '@/lib/payroll/rateLines';

const types: RateTypeMeta[] = [
  { id: ID.show, name: 'Show', bucket: 'fee', basis: 'per_day_status', dayStatuses: ['show'], orderIndex: 1 },
  { id: ID.offTravel, name: 'Travel', bucket: 'fee', basis: 'per_day_status', dayStatuses: ['off_travel', 'travel', 'off'], orderIndex: 2 },
  { id: ID.rehearsal, name: 'Rehearsal', bucket: 'fee', basis: 'per_day_status', dayStatuses: ['rehearsal'], orderIndex: 3 },
  { id: ID.perDiem, name: 'Per diem', bucket: 'per_diem', basis: 'per_assigned_day', dayStatuses: [], orderIndex: 4 },
  { id: ID.advance, name: 'Advance', bucket: 'fee', basis: 'flat_once', dayStatuses: [], orderIndex: 5 },
] as RateTypeMeta[];

const map = buildAmountMap([
  { personnel_rate_id: 'p', rate_type_id: ID.show, amount: 500 },
  { personnel_rate_id: 'p', rate_type_id: ID.offTravel, amount: 250 },
  { personnel_rate_id: 'p', rate_type_id: ID.rehearsal, amount: 300 },
  { personnel_rate_id: 'p', rate_type_id: ID.perDiem, amount: 20 },
  { personnel_rate_id: 'p', rate_type_id: ID.advance, amount: 1000 },
]);

const week1 = { '2027-03-08': 'no_tour', '2027-03-12': 'travel', '2027-03-13': 'rehearsal', '2027-03-14': 'rehearsal' };
const week2 = { '2027-03-15': 'show', '2027-03-16': 'off', '2027-03-17': 'show', '2027-03-18': 'pd_only' };

describe('weekTotals', () => {
  it('a week counts only its own days, without the one-off advance', () => {
    expect(weekTotals(map, 'p', types, week1)).toEqual({ fee: 250 + 600, perDiem: 60 });
  });

  it('Σ weeks + one-offs === the tour total, fee and per diem', () => {
    const all = { ...week1, ...week2 };
    const tour = personTotals(map, 'p', types, countDayStatuses(all));
    const w1 = weekTotals(map, 'p', types, week1);
    const w2 = weekTotals(map, 'p', types, week2);
    const once = oneOffTotals(map, 'p', types, countDayStatuses(all));
    expect(w1.fee + w2.fee + once.fee).toBeCloseTo(tour.totalFee);
    expect(w1.perDiem + w2.perDiem + once.perDiem).toBeCloseTo(tour.totalPerDiem);
    expect(once.fee).toBe(1000);
  });
});

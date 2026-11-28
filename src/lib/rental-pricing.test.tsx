import { describe, expect, it } from 'vitest';
import { calcRentalBillableDays, jobDaysPerWeek, weekLength } from './rental-pricing';

const d = (n: number) => {
  const end = new Date(Date.UTC(2026, 11, 1 + n - 1));
  return ['2026-12-01', end.toISOString().slice(0, 10)] as const;
};

describe('3-day week (Nov 2026 fix)', () => {
  it('days 1–3 cost themselves, days 4–7 cost the week — never more', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((n) => calcRentalBillableDays(...d(n)))).toEqual([1, 2, 3, 3, 3, 3, 3]);
  });
  it('the bug: a 6-day hire cost 6 days while a 7-day hire cost 3', () => {
    expect(calcRentalBillableDays(...d(6))).toBeLessThanOrEqual(calcRentalBillableDays(...d(7)));
  });
  it('more than a week: full weeks + leftovers capped at a week', () => {
    expect(calcRentalBillableDays(...d(9))).toBe(5); // 3 + 2
    expect(calcRentalBillableDays(...d(13))).toBe(6); // 3 + 3
    expect(calcRentalBillableDays(...d(14))).toBe(6);
    expect(calcRentalBillableDays(...d(30))).toBe(14); // 4×3 + 2
  });
  it('a customised week (4 days, 3.5 days, 7 = no discount)', () => {
    expect(calcRentalBillableDays(...d(7), 4)).toBe(4);
    expect(calcRentalBillableDays(...d(14), 3.5)).toBe(7);
    expect(calcRentalBillableDays(...d(10), 7)).toBe(10);
  });
  it('no dates is one day', () => {
    expect(calcRentalBillableDays(null, null)).toBe(1);
  });
});

describe('which week a job uses', () => {
  it('the job’s own, else the workspace’s, else 3; nonsense falls back to 3', () => {
    expect(jobDaysPerWeek({ days_per_week: 4 }, 3.5)).toBe(4);
    expect(jobDaysPerWeek({ days_per_week: null }, '3.5')).toBe(3.5);
    expect(jobDaysPerWeek({}, null)).toBe(3);
    expect(weekLength(0)).toBe(3);
    expect(weekLength(9)).toBe(3);
    expect(weekLength(3.3)).toBe(3.5);
  });
});

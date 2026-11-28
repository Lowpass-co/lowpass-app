import { describe, expect, it } from 'vitest';
import { cleanValidDays, compareCategories, priceQuote, quoteValidUntil, weekRuleText } from './quote';
import { fmtRange, groupJobsByMonth, groupJobsByStatus, hireDays } from './jobList';

const stock = [
  { id: 'desk', name: 'S6L', category: 'Audio', purchase_cost: null, day_rate: 180, day_rate_manual: true },
  { id: 'mic', name: 'SM58', category: 'Audio', purchase_cost: null, day_rate: 4, day_rate_manual: true },
  { id: 'par', name: 'Par', category: 'Lighting', purchase_cost: 1000, day_rate: null, day_rate_manual: false },
  { id: 'odd', name: 'Thing', category: 'Zebra kit', purchase_cost: null, day_rate: 10, day_rate_manual: true },
  { id: 'nocat', name: 'Gaffer', category: null, purchase_cost: null, day_rate: 1, day_rate_manual: true },
];

describe('priceQuote', () => {
  it('prices qty × days × rate, groups by category in the fixed order, Other last', () => {
    const q = priceQuote({
      stock,
      days: 6,
      lines: [
        { id: 'l5', gear_id: 'nocat', quantity: 2, day_rate_override: null },
        { id: 'l4', gear_id: 'odd', quantity: 1, day_rate_override: null },
        { id: 'l3', gear_id: 'par', quantity: 4, day_rate_override: null },
        { id: 'l2', gear_id: 'mic', quantity: 8, day_rate_override: null },
        { id: 'l1', gear_id: 'desk', quantity: 1, day_rate_override: null },
      ],
    });
    expect(q.groups.map((g) => g.category)).toEqual(['Audio', 'Lighting', 'Zebra kit', 'Other']);
    expect(q.groups[0].subtotal).toBe(180 * 6 + 8 * 4 * 6);
    // Par: 3% of 1000 = 30/day
    expect(q.groups[1].subtotal).toBe(4 * 30 * 6);
    expect(q.subtotal).toBe(q.groups.reduce((s, g) => s + g.subtotal, 0));
    expect(q.lines.map((l) => l.id)).toEqual(['l2', 'l1', 'l3', 'l4', 'l5']);
    expect(q.pieces).toBe(16);
  });

  it('marks a changed rate custom, but not an override equal to the item’s own', () => {
    const q = priceQuote({
      stock,
      days: 1,
      lines: [
        { id: 'a', gear_id: 'mic', quantity: 1, day_rate_override: 8 },
        { id: 'b', gear_id: 'desk', quantity: 1, day_rate_override: 180 },
      ],
    });
    const byId = Object.fromEntries(q.lines.map((l) => [l.id, l]));
    expect(byId.a.custom).toBe(true);
    expect(byId.a.total).toBe(8);
    expect(byId.b.custom).toBe(false);
  });

  it('takes percent then fixed off, never below zero', () => {
    const base = { stock, days: 1, lines: [{ id: 'a', gear_id: 'desk', quantity: 1, day_rate_override: null }] };
    expect(priceQuote({ ...base, discountPercent: 10, discountFixed: 8 })).toMatchObject({ subtotal: 180, discount: 26, total: 154 });
    expect(priceQuote({ ...base, discountFixed: 999 })).toMatchObject({ discount: 180, total: 0 });
  });

  it('names a line whose item is gone, at zero unless it has its own rate', () => {
    const q = priceQuote({ stock, days: 3, lines: [{ id: 'x', gear_id: 'gone', quantity: 1, day_rate_override: null }] });
    expect(q.lines[0]).toMatchObject({ name: 'Unknown item', category: 'Other', total: 0 });
  });

  it('orders unknown categories A–Z between the list and Other', () => {
    expect(['Other', 'zz', 'Audio', 'aa'].sort(compareCategories)).toEqual(['Audio', 'aa', 'zz', 'Other']);
  });
});

describe('quote wording', () => {
  it('says the job’s real week', () => {
    expect(weekRuleText(3)).toBe('a week is charged as 3 days');
    expect(weekRuleText(2.5)).toBe('a week is charged as 2.5 days');
    expect(weekRuleText(1)).toBe('a week is charged as 1 day');
  });
  it('valid until = issue day + N days', () => {
    expect(quoteValidUntil(new Date(2026, 10, 28), 14)).toBe('2026-12-12');
    expect(quoteValidUntil(new Date(2026, 11, 25))).toBe('2027-01-08');
  });
  it('cleans the validity setting', () => {
    expect(cleanValidDays('30')).toBe(30);
    expect(cleanValidDays(0)).toBe(14);
    expect(cleanValidDays(400)).toBe(14);
    expect(cleanValidDays('x')).toBe(14);
  });
});

describe('jobs list grouping', () => {
  const j = (id: string, start: string | null, status = 'draft') => ({ id, name: id, start_date: start, status });
  const jobs = [j('old', '2026-09-03'), j('older', '2026-02-10'), j('nov-late', '2026-11-20'), j('nov', '2026-11-02', 'confirmed'), j('dec', '2026-12-01', 'invoiced'), j('nodate', null)];

  it('by month: this month on, soonest first; then earlier, newest first; undated last', () => {
    const g = groupJobsByMonth(jobs, new Date(2026, 10, 28));
    expect(g.map((x) => x.label)).toEqual(['November 2026', 'December 2026', 'September 2026', 'February 2026', 'No dates yet']);
    expect(g[0].jobs.map((x) => x.id)).toEqual(['nov', 'nov-late']);
    expect(g[2].past).toBe(true);
    expect(g[0].past).toBeUndefined();
  });

  it('by status: in the order a job moves through', () => {
    const g = groupJobsByStatus(jobs);
    expect(g.map((x) => x.key)).toEqual(['draft', 'confirmed', 'invoiced']);
    expect(g[0].jobs.map((x) => x.id)).toEqual(['older', 'old', 'nov-late', 'nodate']);
  });
});

describe('dates on the list', () => {
  it('reads a range the short way', () => {
    expect(fmtRange('2026-03-03', '2026-03-16')).toBe('3–16 Mar 2026');
    expect(fmtRange('2026-02-28', '2026-03-03')).toBe('28 Feb – 3 Mar 2026');
    expect(fmtRange('2026-12-29', '2027-01-04')).toBe('29 Dec 2026 – 4 Jan 2027');
    expect(fmtRange('2026-03-03', '2026-03-03')).toBe('3 Mar 2026');
    expect(fmtRange(null, null)).toBe('No dates');
  });
  it('counts both ends', () => {
    expect(hireDays('2026-03-03', '2026-03-16')).toBe(14);
    expect(hireDays('2026-03-03', null)).toBe(0);
    expect(hireDays('2026-03-16', '2026-03-03')).toBe(0);
  });
});

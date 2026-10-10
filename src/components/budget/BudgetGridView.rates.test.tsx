/* Read-only rate columns on the budget sheet (Oct 2026). */
import { describe, it, expect, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
import { expenseColumns, rateCellsFor } from './BudgetGridView';

const facts = { p1: { showRate: 430, offRate: 430, perDiem: 20, showDays: 21, offDays: 13 } };

describe('rate columns', () => {
  it('sit between Item and Estimate, read-only, only when asked for', () => {
    expect(expenseColumns(false).some((c) => c.id === 'showRate')).toBe(false);
    const ids = expenseColumns(true).map((c) => c.id);
    expect(ids.indexOf('showRate')).toBeLessThan(ids.indexOf('est'));
    expect(ids.indexOf('showRate')).toBeGreaterThan(ids.indexOf('item'));
    expect(expenseColumns(true).filter((c) => /Rate|Days/.test(c.id)).every((c) => c.ro)).toBe(true);
  });

  it('a salary line shows the person\'s rates and days', () => {
    expect(rateCellsFor({ source_entity_type: 'payroll', source_entity_id: 'p1' }, facts)).toEqual({ showRate: 430, offRate: 430, showDays: 21, offDays: 13 });
  });

  it('a per-diem line shows the per diem on both', () => {
    expect(rateCellsFor({ source_entity_type: 'payroll_per_diem', source_entity_id: 'p1' }, facts)).toEqual({ showRate: 20, offRate: 20, showDays: 21, offDays: 13 });
  });

  it('every other line is blank', () => {
    expect(rateCellsFor({ source_entity_type: 'hotel_booking', source_entity_id: 'p1' }, facts)).toBeNull();
    expect(rateCellsFor({ source_entity_type: null, source_entity_id: null }, facts)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { toCanonicalMetas } from './PayrollView';
import { CANONICAL_RATE_TYPE_IDS, DEFAULT_RATE_TYPE_IDS } from '@/lib/payroll/rateLines';

describe('Payroll rate columns', () => {
  it('none readable → the built-in canonical columns, never zero columns', () => {
    const m = toCanonicalMetas([]);
    expect(m.length).toBe(CANONICAL_RATE_TYPE_IDS.length);
    expect(m.some((t) => t.id === DEFAULT_RATE_TYPE_IDS.show)).toBe(true);
    expect(m.map((t) => t.orderIndex)).toEqual([...m.map((t) => t.orderIndex)].sort((a, b) => a - b));
  });
  it('readable rows win (their names)', () => {
    const m = toCanonicalMetas([{ id: DEFAULT_RATE_TYPE_IDS.show, name: 'Show day', bucket: 'fee', basis: 'per_day_status', day_statuses: ['show'], order_index: 1 }]);
    expect(m).toHaveLength(1);
    expect(m[0].name).toBe('Show day');
  });
});

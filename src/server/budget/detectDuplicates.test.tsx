/* ============================================
   LOWPASS — duplicate detection (Oct 2026 false positives)

   Before: same section + amount within 5% + created within a week = flagged.
   That flagged two crew salaries (£7,000 / £6,750) and "Flights £5" vs
   "Bus / truck £5". A duplicate is the same thing entered twice.
   ============================================ */

import { describe, it, expect } from 'vitest';
import { detectDuplicates } from './detectDuplicates';
import type { BudgetLineItem } from '@/types';

const day = '2026-10-01T10:00:00Z';
const line = (id: string, over: Record<string, unknown> = {}) =>
  ({ id, label: 'Catering', section_id: 's1', proposed_cost: 100, actual_cost: 0, notes: null, created_at: day, source_entity_type: null, ...over }) as unknown as BudgetLineItem;

describe('detectDuplicates', () => {
  it('flags the same line typed twice', () => {
    const m = detectDuplicates([line('a'), line('b', { proposed_cost: 102 })]);
    expect(m.get('a')).toEqual(['b']);
  });

  it('flags a contained label ("Catering" / "Catering Manchester")', () => {
    expect(detectDuplicates([line('a'), line('b', { label: 'Catering Manchester' })]).size).toBe(2);
  });

  it('does NOT flag different things that cost about the same', () => {
    expect(detectDuplicates([line('a', { label: 'Flights', proposed_cost: 5 }), line('b', { label: 'Bus / truck', proposed_cost: 5 })]).size).toBe(0);
  });

  it('does NOT flag two automatic lines — two people, two salaries', () => {
    const a = line('a', { label: 'Dillon — Guitarist', proposed_cost: 7000, source_entity_type: 'payroll' });
    const b = line('b', { label: 'Dillon — Guitarist', proposed_cost: 6750, source_entity_type: 'payroll' });
    expect(detectDuplicates([a, b]).size).toBe(0);
  });

  it('still flags the same vendor across sections', () => {
    const a = line('a', { label: 'PA hire', section_id: 's1', notes: 'Vendor: SSE' });
    const b = line('b', { label: 'Sound', section_id: 's2', notes: 'Vendor: SSE' });
    expect(detectDuplicates([a, b]).size).toBe(2);
  });

  it('two £0 rows are never duplicates', () => {
    expect(detectDuplicates([line('a', { proposed_cost: 0 }), line('b', { proposed_cost: 0 })]).size).toBe(0);
  });
});

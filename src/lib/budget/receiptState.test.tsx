/* ============================================
   LOWPASS — receipt state derivation (RQ-6)

   This module answers "where did my receipt go?", so the case that matters most
   is the one that has no positive evidence at all: a file that was saved, failed
   to scan, and has no proposal and no line. That receipt must come out as
   needs_details — VISIBLE — rather than falling through the rules into nothing.

   Named .test.tsx because vitest is scoped to that extension here; the module is
   pure TypeScript with no DOM.
   ============================================ */

import { describe, it, expect } from 'vitest';
import {
  deriveReceiptState,
  missingFields,
  canPropose,
  countByState,
  needsAttentionCount,
  type ReceiptStateInput,
} from './receiptState';

function receipt(over: Partial<ReceiptStateInput> = {}): ReceiptStateInput {
  return {
    linked_line_item_id: null,
    vendor: 'Shell',
    date: '2026-10-01',
    cost_tour_currency: 88.2,
    proposalStatuses: [],
    ...over,
  };
}

describe('the case this whole surface exists for', () => {
  it('a saved receipt that failed to scan is needs_details, not invisible', () => {
    // Exactly Adam's two files: stored, no fields, no proposal, no line.
    const failed = receipt({ vendor: null, date: null, cost_tour_currency: null });
    expect(deriveReceiptState(failed)).toBe('needs_details');
  });

  it('and it says what it is missing', () => {
    const failed = receipt({ vendor: null, date: null, cost_tour_currency: null });
    expect(missingFields(failed)).toEqual(['vendor', 'date', 'amount']);
    expect(canPropose(failed)).toBe(false);
  });

  it('needs_details is the DEFAULT — an unclassifiable receipt surfaces, never hides', () => {
    expect(deriveReceiptState(receipt({ proposalStatuses: [] }))).toBe('needs_details');
  });
});

describe('states, in order of certainty', () => {
  it('linked to a line → filed, even with a stale proposal row', () => {
    expect(deriveReceiptState(receipt({
      linked_line_item_id: 'line-1',
      proposalStatuses: ['pending'],
    }))).toBe('filed');
  });

  it('a pending proposal → proposed', () => {
    expect(deriveReceiptState(receipt({ proposalStatuses: ['pending'] }))).toBe('proposed');
  });

  it('all proposals turned down → rejected', () => {
    expect(deriveReceiptState(receipt({ proposalStatuses: ['rejected'] }))).toBe('rejected');
    expect(deriveReceiptState(receipt({ proposalStatuses: ['rejected', 'skipped'] }))).toBe('rejected');
  });

  it('pending alongside rejected still reads proposed — there is work queued', () => {
    expect(deriveReceiptState(receipt({ proposalStatuses: ['rejected', 'pending'] }))).toBe('proposed');
  });

  it('accepted but NOT linked → needs_details, because the line is gone', () => {
    /* The proposal was applied, then the line was deleted. Calling this "filed"
       would point the user at a line that no longer exists. */
    expect(deriveReceiptState(receipt({ proposalStatuses: ['accepted'] }))).toBe('needs_details');
  });
});

describe('missing fields', () => {
  it('a complete receipt is missing nothing and can be proposed', () => {
    expect(missingFields(receipt())).toEqual([]);
    expect(canPropose(receipt())).toBe(true);
  });

  it('a zero amount counts as missing — 0.00 is never a real receipt total', () => {
    expect(missingFields(receipt({ cost_tour_currency: 0 }))).toEqual(['amount']);
  });

  it('whitespace is not a vendor', () => {
    expect(missingFields(receipt({ vendor: '   ' }))).toEqual(['vendor']);
  });

  it('an already-filed receipt is not re-proposable even when complete', () => {
    expect(canPropose(receipt({ linked_line_item_id: 'line-1' }))).toBe(false);
  });
});

describe('counts drive the chips and the badge', () => {
  const rows = [
    receipt({ vendor: null, cost_tour_currency: null }),          // needs_details
    receipt({ vendor: null, cost_tour_currency: null }),          // needs_details
    receipt({ proposalStatuses: ['pending'] }),                    // proposed
    receipt({ linked_line_item_id: 'l1' }),                        // filed
    receipt({ proposalStatuses: ['rejected'] }),                   // rejected
  ];

  it('counts every state', () => {
    expect(countByState(rows)).toEqual({
      needs_details: 2, proposed: 1, filed: 1, rejected: 1,
    });
  });

  it('the badge counts ONLY needs_details — the rest is not the user’s move', () => {
    expect(needsAttentionCount(rows)).toBe(2);
  });

  it('no receipts, no badge', () => {
    expect(needsAttentionCount([])).toBe(0);
  });
});

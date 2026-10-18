import { describe, expect, it } from 'vitest';
import { perDiemOf, pickLatestCard, seedLines } from './seedFromLastTour';
import { DEFAULT_RATE_TYPE_IDS as T } from './rateLines';

describe('pickLatestCard', () => {
  const starts = new Map<string, string | null>([
    ['old', '2025-03-01'],
    ['new', '2026-08-30'],
    ['undated', null],
    ['this', '2026-11-01'],
  ]);
  it('takes the most recent OTHER tour by start date', () => {
    const cards = [
      { id: 'a', tour_id: 'old', created_at: '2026-10-01' },
      { id: 'b', tour_id: 'new', created_at: '2025-01-01' },
      { id: 'c', tour_id: 'this', created_at: '2026-10-10' },
      { id: 'd', tour_id: 'undated', created_at: '2026-10-12' },
    ];
    expect(pickLatestCard(cards, starts, 'this')?.id).toBe('b');
  });
  it('no other tour → null', () => {
    expect(pickLatestCard([{ id: 'c', tour_id: 'this', created_at: null }], starts, 'this')).toBeNull();
  });
});

describe('seedLines', () => {
  it('copies non-zero canonical lines and fills the five base lines with 0', () => {
    const lines = seedLines([
      { rate_type_id: T.dayRate, amount: 350 },
      { rate_type_id: T.perDiem, amount: '40' },
      { rate_type_id: T.show, amount: 0 },
      { rate_type_id: T.weekly, amount: 900 }, // retired type — not copied
    ]);
    const m = new Map(lines.map((l) => [l.rate_type_id, l.amount]));
    expect(m.get(T.dayRate)).toBe(350);
    expect(m.get(T.perDiem)).toBe(40);
    expect(m.has(T.weekly)).toBe(false);
    for (const id of [T.show, T.offTravel, T.rehearsal, T.advance]) expect(m.get(id)).toBe(0);
    expect(perDiemOf(lines)).toBe(40);
  });
  it('never writes a zero Flat day (it would flip the card to day-rate layout)', () => {
    const lines = seedLines([{ rate_type_id: T.dayRate, amount: 0 }]);
    expect(lines.some((l) => l.rate_type_id === T.dayRate)).toBe(false);
  });
  it('first tour ever → the five zero lines', () => {
    expect(seedLines(null)).toHaveLength(5);
    expect(seedLines(null).every((l) => l.amount === 0)).toBe(true);
  });
});

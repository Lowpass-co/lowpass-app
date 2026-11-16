import { describe, expect, it } from 'vitest';
import { answerText, nextDayIndex } from './format';

describe('crew formatting', () => {
  it('answers read as text; empties are nothing', () => {
    expect(answerText('  15:00 ')).toBe('15:00');
    expect(answerText('')).toBeNull();
    expect(answerText(['A', '', null, 3])).toBe('A, 3');
    expect(answerText(true)).toBe('Yes');
    expect(answerText({ name: 'Jo', phone: '07' })).toBe('Jo');
    expect(answerText({ load_in: '14:00', curfew: '' })).toBe('load in: 14:00');
    expect(answerText({})).toBeNull();
  });
  it('the next show is today or later, else the last', () => {
    expect(nextDayIndex(['2026-11-01', '2026-11-20', '2026-11-25'], '2026-11-16')).toBe(1);
    expect(nextDayIndex(['2026-11-01', '2026-11-02'], '2026-11-16')).toBe(1);
    expect(nextDayIndex([], '2026-11-16')).toBe(-1);
  });
});

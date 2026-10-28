/* Info pack rules: answers only for real questions, values in the question's
   type, quotes checked against the page, one suggestion per question. */
import { describe, expect, it } from 'vitest';
import { cleanExtraction, coerceValue, findQuote, matchShow, mergeExtras, mergeSuggestions, unansweredAfter, type Suggestion } from './packs';
import type { AdvSection } from './board';

const sections: AdvSection[] = [
  { template_id: 's1', label: 'Schedule', fields: [{ id: 'doors', label: 'Doors', type: 'time' }, { id: 'curfew', label: 'Curfew', type: 'time' }] },
  {
    template_id: 's2',
    label: 'Production',
    fields: [
      { id: 'power', label: 'Power details', type: 'textarea' },
      { id: 'forklift', label: 'Forklift', type: 'boolean' },
      { id: 'pm', label: 'Production manager', type: 'contact' },
    ],
  },
];
const pages = [
  { num: 2, text: 'Doors 19:00.\nStrict curfew 22:30 — residential area,\nno exceptions.' },
  { num: 6, text: 'Stage left: 1 × 125A CEE 3-phase,   15 m from the stage edge.' },
];

describe('coerceValue', () => {
  it('turns text into the question’s type, or drops it', () => {
    expect(coerceValue({ type: 'time' }, '7.30pm')).toBe('19:30');
    expect(coerceValue({ type: 'time' }, '22:30 hard')).toBe('22:30');
    expect(coerceValue({ type: 'time' }, '12am')).toBe('00:00');
    expect(coerceValue({ type: 'time' }, '19')).toBeUndefined();
    expect(coerceValue({ type: 'boolean' }, 'Yes, 2.5 t on request')).toBe(true);
    expect(coerceValue({ type: 'boolean' }, 'not available')).toBe(false);
    expect(coerceValue({ type: 'boolean' }, 'maybe')).toBeUndefined();
    expect(coerceValue({ type: 'number' }, 'Capacity 3,500 standing')).toBe(3500);
    expect(coerceValue({ type: 'select', options: ['Full catering', 'Buyout'] }, 'buyout')).toBe('Buyout');
  });
});

describe('findQuote', () => {
  it('finds the quote across line breaks, dashes and spacing; prefers the hinted page', () => {
    expect(findQuote(pages, 'Strict curfew 22:30 - residential area, no exceptions', 2)).toBe(2);
    expect(findQuote(pages, '125A CEE 3-phase, 15 m from the stage edge', 1)).toBe(6);
    expect(findQuote(pages, 'something it never said', 2)).toBeNull();
  });
});

describe('cleanExtraction', () => {
  it('keeps real questions only, checks quotes, drops contacts and bad values', () => {
    const out = cleanExtraction(
      {
        answers: [
          { section_id: 's1', field_id: 'curfew', value: '22:30', quote: 'Strict curfew 22:30', page: 6, confidence: 'high' },
          { section_id: 's2', field_id: 'power', value: '125A CEE SL', quote: 'not on any page', page: 6, confidence: 'medium' },
          { section_id: 's2', field_id: 'pm', value: 'Jo', quote: 'Jo', confidence: 'high' },
          { section_id: 's9', field_id: 'x', value: 'y', quote: 'y', confidence: 'high' },
          { section_id: 's1', field_id: 'doors', value: 'early', quote: 'Doors', confidence: 'high' },
        ],
        extras: [{ label: 'Bus shore power', value: '2 bays, 32A', quote: 'shore power', page: 3 }, { label: '', value: 'x', quote: 'x' }],
      },
      sections,
      pages,
      0,
    );
    expect(out.suggestions.map((s) => [s.field_id, s.value, s.page, s.verified])).toEqual([
      ['curfew', '22:30', 2, true], // page corrected from the text
      ['power', '125A CEE SL', 6, false], // quote not found → page hint only, flagged
    ]);
    expect(out.extras).toHaveLength(1);
  });
});

describe('merging files', () => {
  const s = (o: Partial<Suggestion>): Suggestion => ({ section_id: 's1', field_id: 'doors', value: '19:00', quote: '', page: 1, verified: false, confidence: 'medium', file: 0, ...o });
  it('verified beats unverified, then confidence', () => {
    const m = mergeSuggestions([[s({ value: '18:30' })], [s({ value: '19:00', verified: true, file: 1 })], [s({ value: '20:00', confidence: 'high' })]]);
    expect(m).toHaveLength(1);
    expect(m[0].value).toBe('19:00');
  });
  it('extras that repeat a question or each other are dropped', () => {
    const e = { value: 'v', quote: 'q', page: 1, verified: true, section_id: null, file: 0 };
    expect(mergeExtras([[{ ...e, label: 'Curfew' }, { ...e, label: 'Wi-Fi' }], [{ ...e, label: 'wi-fi' }]], sections).map((x) => x.label)).toEqual(['Wi-Fi']);
  });
  it('lists what nothing answered, skipping what you already have', () => {
    const left = unansweredAfter(sections, { s2: { forklift: true } }, [s({ field_id: 'curfew' })]);
    expect(left.map((l) => l.field_id)).toEqual(['doors', 'power']);
  });
});

describe('matchShow', () => {
  const shows = [
    { routingId: 'a', date: '2026-10-10', venue: 'Sporthalle Hamburg', city: 'Hamburg' },
    { routingId: 'b', date: '2026-10-12', venue: 'Den Grå Hal', city: 'København' },
  ];
  it('matches on date and venue words; refuses a weak guess', () => {
    expect(matchShow({ venue: 'Sporthalle', date: null }, shows)).toBe('a');
    expect(matchShow({ date: '2026-10-12' }, shows)).toBe('b');
    expect(matchShow({ city: 'Hamburg' }, shows)).toBeNull();
  });
});

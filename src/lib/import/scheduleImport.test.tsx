/* The AI schedule import's rules: what the model says → clean days → a review
   against the tour → the minimal patch. Never deletes; blanks never blank. */
import { describe, expect, it } from 'vitest';
import {
  chunkText,
  diffDays,
  mergeExtractions,
  normaliseDayType,
  normaliseExtraction,
  rangeToCover,
  toApplyDays,
} from './scheduleImport';

describe('normaliseDayType', () => {
  it('maps the words tour books use', () => {
    expect(normaliseDayType('Show')).toBe('show');
    expect(normaliseDayType('DAY OFF')).toBe('off');
    expect(normaliseDayType('Drive day')).toBe('travel');
    expect(normaliseDayType('Production rehearsal')).toBe('rehearsal');
    expect(normaliseDayType('travel / show')).toBe('show,travel'); // show leads
    expect(normaliseDayType('Gig + press')).toBe('show,press');
    expect(normaliseDayType('???')).toBe('');
  });
});

describe('normaliseExtraction', () => {
  it('validates dates, merges a date given twice, fills the range', () => {
    const out = normaliseExtraction({
      tour: { name: 'Satellite UK', artist: 'Charlotte Sands' },
      days: [
        { date: '2027-02-02', day_type: 'travel', city: 'London', confidence: 'high' },
        { date: '2027-02-02', day_type: 'show', venue: 'Roundhouse', notes: 'Support: X', confidence: 'medium' },
        { date: '2027-02-31', day_type: 'show' },
        { date: 'Tuesday', day_type: 'show' },
        { date: '2027-02-04', day_type: 'Day off', confidence: 'low', source: 'Thu — OFF' },
      ],
    });
    expect(out.days).toHaveLength(2);
    expect(out.days[0]).toMatchObject({ date: '2027-02-02', day_type: 'show,travel', venue_name: 'Roundhouse', city: 'London', notes: 'Support: X', confidence: 'medium' });
    expect(out.days[1]).toMatchObject({ day_type: 'off', confidence: 'low', source: 'Thu — OFF' });
    expect(out.warnings).toHaveLength(2);
    expect(out.meta).toEqual({ tourName: 'Satellite UK', artistName: 'Charlotte Sands', startDate: '2027-02-02', endDate: '2027-02-04' });
  });
  it('copes with garbage', () => {
    expect(normaliseExtraction(null).days).toEqual([]);
    expect(normaliseExtraction({ days: 'nope' }).days).toEqual([]);
  });
});

const day = (date: string, o: Record<string, string> = {}) => ({
  date, day_type: '', venue_name: '', city: '', country: '', address: '', notes: '', confidence: 'high' as const, source: '', ...o,
});

describe('diffDays + toApplyDays', () => {
  const existing = [
    { date: '2026-10-09', day_type: 'show', venue_name: 'Roundhouse', city: 'London', country: 'UK', address: '', notes: 'Bus call 10:00' },
    { date: '2026-10-10', day_type: 'travel', venue_name: '', city: '', country: '', address: '', notes: '' },
    { date: '2026-10-11', day_type: '', venue_name: '', city: '', country: '', address: '', notes: '' }, // empty row
  ];
  const imported = [
    day('2026-10-09', { day_type: 'Show', venue_name: 'roundhouse', city: 'London', address: 'Chalk Farm Rd, NW1', notes: 'Doors 19:00' }),
    day('2026-10-10', { day_type: 'travel' }),
    day('2026-10-11', { day_type: 'show', venue_name: 'O2 Ritz', city: 'Manchester' }),
    day('2026-10-12', { day_type: 'off', city: '' }),
  ];
  const rows = diffDays(imported, existing);

  it('classifies new / changes / same, case-insensitively, ignoring blanks', () => {
    expect(rows.map((r) => r.status)).toEqual(['changes', 'same', 'new', 'new']);
    expect(rows[0].changes.map((c) => c.field)).toEqual(['address', 'notes']); // "roundhouse" == "Roundhouse"
  });

  it('patches only what changes; notes are appended; kept fields are left', () => {
    const patch = toApplyDays(rows);
    expect(patch).toEqual([
      { date: '2026-10-09', fields: { address: 'Chalk Farm Rd, NW1', notes: 'Bus call 10:00\nDoors 19:00' } },
      { date: '2026-10-11', fields: { day_type: 'show', venue_name: 'O2 Ritz', city: 'Manchester' } },
      { date: '2026-10-12', fields: { day_type: 'off' } },
    ]);
    const kept = toApplyDays(rows, { '2026-10-09': ['notes'] });
    expect(kept[0]).toEqual({ date: '2026-10-09', fields: { address: 'Chalk Farm Rd, NW1' } });
  });

  it('a blank imported value never blanks an existing one', () => {
    const r = diffDays([day('2026-10-09', { day_type: 'show' })], existing);
    expect(r[0].status).toBe('same');
    expect(toApplyDays(r)).toEqual([]);
  });
});

describe('rangeToCover', () => {
  it('widens only the side that needs it', () => {
    expect(rangeToCover(['2026-09-28', '2026-10-05'], '2026-10-01', '2026-10-31')).toEqual({ start: '2026-09-28', end: null });
    expect(rangeToCover(['2026-10-05'], '2026-10-01', '2026-10-31')).toEqual({ start: null, end: null });
    expect(rangeToCover(['2026-11-02'], null, null)).toEqual({ start: '2026-11-02', end: '2026-11-02' });
  });
});

describe('long documents', () => {
  it('chunks on line boundaries and merges by date', () => {
    const text = Array.from({ length: 100 }, (_, i) => `line ${i} ${'x'.repeat(50)}`).join('\n');
    const chunks = chunkText(text, 1000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('\n')).toBe(text);
    const a = normaliseExtraction({ days: [{ date: '2026-10-01', day_type: 'show', city: 'Leeds' }] });
    const b = normaliseExtraction({ tour: { name: 'T' }, days: [{ date: '2026-10-01', day_type: 'travel' }, { date: '2026-10-02', day_type: 'off' }] });
    const m = mergeExtractions([a, b]);
    expect(m.days.map((d) => [d.date, d.day_type])).toEqual([['2026-10-01', 'show,travel'], ['2026-10-02', 'off']]);
    expect(m.meta.tourName).toBe('T');
  });
});

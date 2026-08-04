/* ============================================
   LOWPASS — carnet completeness (D-1)

   An incomplete general list is REFUSED at the border. Not queried — refused,
   with a truck outside. These pin the two rules that follow from that:
   every gap is named, and no gap is ever silent.
   ============================================ */

import { describe, it, expect } from 'vitest';
import {
  analyseCarnetCompleteness,
  carnetCell,
  CARNET_GAP_MARK,
} from './carnet-completeness';

const item = (over: Partial<Parameters<typeof analyseCarnetCompleteness>[0][number]> = {}) => ({
  id: 'g1',
  name: 'SM58',
  country_of_origin: 'MX',
  customs_hs_code: '8518.10',
  value_amount: 99,
  ...over,
});

describe('which item is missing which field', () => {
  it('a complete list reports complete', () => {
    const r = analyseCarnetCompleteness([item(), item({ id: 'g2' })]);
    expect(r.incomplete).toEqual([]);
    expect(r.summary).toBe('All 2 items complete');
  });

  it('NAMES the item and the fields, not just a count', () => {
    /* "3 items incomplete" is useless at a counter; you need to know which. */
    const r = analyseCarnetCompleteness([
      item(),
      item({ id: 'g2', name: 'Wedge', country_of_origin: null, customs_hs_code: null }),
    ]);
    expect(r.incomplete).toEqual([
      { id: 'g2', name: 'Wedge', missing: ['country_of_origin', 'customs_hs_code'] },
    ]);
    expect(r.summary).toBe('1 of 2 items incomplete');
  });

  it('EMPTY AND WHITESPACE ARE MISSING — a half-filled form is not filled', () => {
    const r = analyseCarnetCompleteness([item({ country_of_origin: '', customs_hs_code: '   ' })]);
    expect(r.incomplete[0].missing).toEqual(['country_of_origin', 'customs_hs_code']);
  });

  it('a zero or negative value is missing, deliberately over-reporting', () => {
    /* A zero-value carnet line is refused as readily as a blank one. Better to
       name it and be wrong than to have a truck turned around. */
    expect(analyseCarnetCompleteness([item({ value_amount: 0 })]).incomplete[0].missing).toEqual(['value_amount']);
    expect(analyseCarnetCompleteness([item({ value_amount: -1 })]).incomplete[0].missing).toEqual(['value_amount']);
    expect(analyseCarnetCompleteness([item({ value_amount: '' })]).incomplete[0].missing).toEqual(['value_amount']);
  });

  it('a numeric string value counts — spreadsheets import as text', () => {
    expect(analyseCarnetCompleteness([item({ value_amount: '450.00' })]).incomplete).toEqual([]);
  });

  it('an unnamed item still gets a usable label', () => {
    const r = analyseCarnetCompleteness([item({ name: null, customs_hs_code: null })]);
    expect(r.incomplete[0].name).toBe('Untitled item');
  });

  it('an empty list is complete, not an error', () => {
    expect(analyseCarnetCompleteness([]).summary).toBe('All 0 items complete');
  });
});

describe('NO SILENT BLANKS', () => {
  it('a missing cell prints a visible mark, never an empty string', () => {
    /* An empty cell on paper reads as "nothing to declare". */
    for (const v of [null, undefined, '', '  ', 0, -1, NaN]) {
      const c = carnetCell(v);
      expect(c.missing).toBe(true);
      expect(c.text).toBe(CARNET_GAP_MARK);
      expect(c.text.trim()).not.toBe('');
    }
  });

  it('a present cell prints its value, trimmed', () => {
    expect(carnetCell(' MX ')).toEqual({ text: 'MX', missing: false });
    expect(carnetCell(450)).toEqual({ text: '450', missing: false });
  });

  it('the summary and the marks agree — one source for both', () => {
    /* The UI count and the document marks are computed from the same predicate,
       so a document cannot claim complete while printing a gap. */
    const items = [item(), item({ id: 'g2', country_of_origin: null })];
    const r = analyseCarnetCompleteness(items);
    const marked = items.filter((i) => carnetCell(i.country_of_origin).missing).length;
    expect(marked).toBe(r.incomplete.length);
  });
});

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
  resolveCarnetValue,
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

/* ── D1-L1: value has two sources ─────────────────────────────────────────── */

describe('resolveCarnetValue — declared wins, purchase cost is the labelled fallback', () => {
  it('THE PRODUCTION SHAPE: value_amount null, purchase_cost set → complete', () => {
    /* All 33 rows on production look exactly like this. Before the fallback the
       carnet reported "33 of 33 incomplete" and printed — MISSING — in the
       value column of every row. */
    const row = { id: 'g1', name: 'AKG 414', country_of_origin: 'AU', customs_hs_code: '8518.10', value_amount: null, purchase_cost: 300 };
    expect(resolveCarnetValue(row)).toEqual({ amount: 300, source: 'purchase_cost' });
    expect(analyseCarnetCompleteness([row]).incomplete).toEqual([]);
  });

  it('a declared value WINS over purchase cost and is not labelled', () => {
    expect(resolveCarnetValue({ value_amount: 500, purchase_cost: 300 }))
      .toEqual({ amount: 500, source: 'declared' });
  });

  it('neither source → still missing, still named', () => {
    expect(resolveCarnetValue({ value_amount: null, purchase_cost: null }))
      .toEqual({ amount: null, source: 'none' });
    const r = analyseCarnetCompleteness([
      { id: 'g1', name: 'Case', country_of_origin: 'GB', customs_hs_code: '4202', value_amount: null, purchase_cost: null },
    ]);
    expect(r.incomplete[0].missing).toEqual(['value_amount']);
  });

  it('zero or negative in EITHER source does not satisfy', () => {
    /* The over-report rule survives the fallback — a zero-value line is refused
       as readily as a blank one, from whichever column it came. */
    expect(resolveCarnetValue({ value_amount: 0, purchase_cost: 0 }).amount).toBeNull();
    expect(resolveCarnetValue({ value_amount: 0, purchase_cost: 300 }))
      .toEqual({ amount: 300, source: 'purchase_cost' });
    expect(resolveCarnetValue({ value_amount: -5, purchase_cost: -1 }).amount).toBeNull();
  });

  it('numeric strings work in both columns — spreadsheets import as text', () => {
    expect(resolveCarnetValue({ value_amount: null, purchase_cost: '300.00' }))
      .toEqual({ amount: 300, source: 'purchase_cost' });
  });

  it('THE ACCEPTANCE SHAPE: only HS code is left missing on production data', () => {
    /* 33 rows, all with country_of_origin (bar 2) and purchase_cost, none with
       an HS code. After the fallback the gaps must be HS-code-driven, which is
       Adam data entry, not a code defect. */
    const rows = Array.from({ length: 33 }, (_, i) => ({
      id: `g${i}`, name: `Item ${i}`,
      country_of_origin: i < 2 ? null : 'AU',
      customs_hs_code: null,
      value_amount: null,
      purchase_cost: 300,
    }));
    const r = analyseCarnetCompleteness(rows);
    expect(r.incomplete).toHaveLength(33);
    /* Every gap is HS code; only the two known rows also lack origin. */
    expect(r.incomplete.every((g) => g.missing.includes('customs_hs_code'))).toBe(true);
    expect(r.incomplete.filter((g) => g.missing.includes('country_of_origin'))).toHaveLength(2);
    expect(r.incomplete.some((g) => g.missing.includes('value_amount'))).toBe(false);
  });
});

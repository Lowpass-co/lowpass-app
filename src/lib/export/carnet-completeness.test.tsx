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
  summariseCarnetValues,
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
    expect(resolveCarnetValue(row)).toEqual({ amount: 300, source: 'purchase_cost', currency: null });
    expect(analyseCarnetCompleteness([row]).incomplete).toEqual([]);
  });

  it('a declared value WINS over purchase cost and is not labelled', () => {
    expect(resolveCarnetValue({ value_amount: 500, purchase_cost: 300, value_currency: 'GBP' }))
      .toEqual({ amount: 500, source: 'declared', currency: 'GBP' });
  });

  it('neither source → still missing, still named', () => {
    expect(resolveCarnetValue({ value_amount: null, purchase_cost: null }))
      .toEqual({ amount: null, source: 'none', currency: null });
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
      .toEqual({ amount: 300, source: 'purchase_cost', currency: null });
    expect(resolveCarnetValue({ value_amount: -5, purchase_cost: -1 }).amount).toBeNull();
  });

  it('numeric strings work in both columns — spreadsheets import as text', () => {
    expect(resolveCarnetValue({ value_amount: null, purchase_cost: '300.00' }))
      .toEqual({ amount: 300, source: 'purchase_cost', currency: null });
  });

  it('after the fallback, NO gap is value-driven — the assertion that matters', () => {
    /* R3-4 — framing corrected. This is a UNIT test over a fixture built to
       resemble production; it proves the predicate behaves correctly given that
       shape, NOT that production has it. The 33 is decorative — it would pass
       identically at 5. And "every gap is HS-driven" was false on this very
       fixture: every ROW has an HS gap, but two rows also carry an origin gap.
       The claim worth making is the last assertion: value is no longer a gap. */
    const rows = Array.from({ length: 33 }, (_, i) => ({
      id: `g${i}`, name: `Item ${i}`,
      country_of_origin: i < 2 ? null : 'AU',
      customs_hs_code: null,
      value_amount: null,
      purchase_cost: 300,
    }));
    const r = analyseCarnetCompleteness(rows);
    expect(r.incomplete).toHaveLength(33);
    /* Every ROW has an HS gap; two of them additionally lack an origin. */
    expect(r.incomplete.every((g) => g.missing.includes('customs_hs_code'))).toBe(true);
    expect(r.incomplete.filter((g) => g.missing.includes('country_of_origin'))).toHaveLength(2);
    expect(r.incomplete.some((g) => g.missing.includes('value_amount'))).toBe(false);
  });
});

/* ── R3-1: the unit travels with the number ──────────────────────────────── */

describe('resolveCarnetValue currency — R2-6 must not recur here', () => {
  it('a DECLARED value carries its declared currency', () => {
    expect(resolveCarnetValue({ value_amount: 500, purchase_cost: 300, value_currency: 'USD' }))
      .toEqual({ amount: 500, source: 'declared', currency: 'USD' });
  });

  it('THE REGRESSION: a purchase-cost fallback has NO currency', () => {
    /* purchase_cost has no currency column anywhere — not on gear (247:22), not
       on rental_inventory (092:43). Printing value_currency beside it is R2-6:
       a symbol from one column over a number from another. */
    const v = resolveCarnetValue({ value_amount: null, purchase_cost: 300, value_currency: 'GBP' });
    expect(v).toEqual({ amount: 300, source: 'purchase_cost', currency: null });
    expect(v.currency).not.toBe('GBP');
  });

  it('a blank or whitespace declared currency is unknown, not empty text', () => {
    expect(resolveCarnetValue({ value_amount: 10, value_currency: '   ' }).currency).toBeNull();
    expect(resolveCarnetValue({ value_amount: 10, value_currency: null }).currency).toBeNull();
  });
});

describe('summariseCarnetValues — a wrong total is worse than no total', () => {
  const row = (id: string, over: Record<string, unknown> = {}) => ({
    id, name: id, country_of_origin: 'AU', customs_hs_code: '8518', ...over,
  });

  it('one known currency, no fallbacks → summable', () => {
    const t = summariseCarnetValues([
      row('a', { value_amount: 100, value_currency: 'GBP' }),
      row('b', { value_amount: 50, value_currency: 'GBP' }),
    ]);
    expect(t.summable).toBe(true);
    expect(t.byCurrency).toEqual([{ currency: 'GBP', amount: 150, rows: 2 }]);
  });

  it('MIXED CURRENCIES → refuses to sum, reports per currency', () => {
    const t = summariseCarnetValues([
      row('a', { value_amount: 100, value_currency: 'GBP' }),
      row('b', { value_amount: 50, value_currency: 'USD' }),
    ]);
    expect(t.summable).toBe(false);
    expect(t.byCurrency).toHaveLength(2);
  });

  it('ANY unknown-unit row poisons the total, even with one known currency', () => {
    /* This is the production shape: all fallbacks, all unit-unknown. A single
       GBP-looking total would be a mixed-unit figure wearing a symbol. */
    const t = summariseCarnetValues([
      row('a', { value_amount: 100, value_currency: 'GBP' }),
      row('b', { value_amount: null, purchase_cost: 300, value_currency: 'GBP' }),
    ]);
    expect(t.hasUnknownUnit).toBe(true);
    expect(t.summable).toBe(false);
    expect(t.byCurrency.find((b) => b.currency === null)).toEqual({ currency: null, amount: 300, rows: 1 });
  });

  it('rows with no value at all are excluded, not counted as zero', () => {
    const t = summariseCarnetValues([row('a', { value_amount: null, purchase_cost: null })]);
    expect(t.byCurrency).toEqual([]);
    expect(t.summable).toBe(false);
  });
});

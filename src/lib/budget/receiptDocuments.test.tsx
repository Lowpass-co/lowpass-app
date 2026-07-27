/* ============================================
   LOWPASS — normaliseDocuments (RC-5)

   The boundary between a model's JSON and the money pipeline. Everything that
   arrives here is untrusted: the shape can drift, `pages` can be invented, and a
   retry can answer in the old flat format. The pipeline downstream assumes an
   array of well-formed documents, so this is where that assumption is EARNED.

   Named .test.tsx because vitest is scoped to that extension in this repo
   (.test.ts is reserved for the standalone money harnesses); the module under
   test is pure TypeScript with no DOM.
   ============================================ */

import { describe, it, expect } from 'vitest';
import { normaliseDocuments, pageRangeLabel } from './receiptDocuments';

const FOLIO = { pages: [1, 2, 3, 4], vendor: 'Premier Inn', date: '2026-10-02', total_amount: 412.5, currency: 'gbp' };

describe('the three shapes that actually arrive', () => {
  it('{documents:[…]} — the RC-5 shape', () => {
    const out = normaliseDocuments({ documents: [FOLIO] }, 4);
    expect(out.length).toBe(1);
    expect(out[0].vendor).toBe('Premier Inn');
    expect(out[0].pages).toEqual([1, 2, 3, 4]);
  });

  it('a flat object — the pre-RC-5 shape, treated as ONE document not a failure', () => {
    const out = normaliseDocuments({ vendor: 'Shell', total_amount: 88.2 }, 1);
    expect(out.length).toBe(1);
    expect(out[0].vendor).toBe('Shell');
  });

  it('a bare array — models emit this often enough to handle', () => {
    const out = normaliseDocuments([FOLIO, { vendor: 'Pret', total_amount: 14.8, pages: [5] }], 5);
    expect(out.length).toBe(2);
  });

  it('nothing usable → empty, which the route turns into a 422 and the client into store-and-flag', () => {
    expect(normaliseDocuments(null, null)).toEqual([]);
    expect(normaliseDocuments('nope', null)).toEqual([]);
    expect(normaliseDocuments({ documents: [] }, null)).toEqual([]);
    // An object with no vendor, no total and no date is not a receipt.
    expect(normaliseDocuments({ documents: [{ category: 'misc' }] }, 1)).toEqual([]);
  });
});

describe('pages are a CLAIM, and get checked against the real file', () => {
  it('drops pages the file does not have', () => {
    const out = normaliseDocuments({ documents: [{ ...FOLIO, pages: [1, 2, 9, 40] }] }, 3);
    expect(out[0].pages).toEqual([1, 2]);
  });

  it('sorts and dedupes a messy claim', () => {
    const out = normaliseDocuments({ documents: [{ ...FOLIO, pages: [3, 1, 3, 2] }] }, 4);
    expect(out[0].pages).toEqual([1, 2, 3]);
  });

  it('keeps the claim when the page count is unknown (an image, or an unreadable PDF)', () => {
    const out = normaliseDocuments({ documents: [{ ...FOLIO, pages: [7] }] }, null);
    expect(out[0].pages).toEqual([7]);
  });

  it('nonsense pages become null rather than a bad range', () => {
    const out = normaliseDocuments({ documents: [{ ...FOLIO, pages: [0, -2, 'x'] }] }, 4);
    expect(out[0].pages).toBeNull();
  });
});

describe('a single-page file cannot hold several documents', () => {
  it('collapses an over-eager split, keeping the one with a total', () => {
    const out = normaliseDocuments(
      { documents: [
        { vendor: 'Header', date: '2026-10-01' },
        { vendor: 'Shell', total_amount: 88.2 },
      ] },
      1,
    );
    expect(out.length).toBe(1);
    expect(out[0].total_amount).toBe(88.2);
  });

  it('but a multi-page file keeps its split', () => {
    const out = normaliseDocuments(
      { documents: [
        { vendor: 'Shell', total_amount: 88.2, pages: [1] },
        { vendor: 'Pret', total_amount: 14.8, pages: [2] },
      ] },
      2,
    );
    expect(out.length).toBe(2);
  });
});

describe('field coercion — money must survive intact', () => {
  it('reads an amount out of a formatted string without changing it', () => {
    const out = normaliseDocuments({ documents: [{ vendor: 'X', total_amount: '£1,234.56' }] }, 1);
    expect(out[0].total_amount).toBe(1234.56);
  });

  it('an unreadable amount is null, NEVER zero — zero is a real number and a lie here', () => {
    const out = normaliseDocuments({ documents: [{ vendor: 'X', total_amount: 'unknown' }] }, 1);
    expect(out[0].total_amount).toBeNull();
  });

  it('a genuine zero stays zero', () => {
    const out = normaliseDocuments({ documents: [{ vendor: 'X', total_amount: 0 }] }, 1);
    expect(out[0].total_amount).toBe(0);
  });

  it('currency is upper-cased; blanks become null', () => {
    const out = normaliseDocuments({ documents: [FOLIO] }, 4);
    expect(out[0].currency).toBe('GBP');
    expect(normaliseDocuments({ documents: [{ vendor: 'X', currency: '   ' }] }, 1)[0].currency).toBeNull();
  });

  it('line items keep only rows with something in them', () => {
    const out = normaliseDocuments(
      { documents: [{ vendor: 'X', total_amount: 5, line_items: [{ description: 'Room', amount: 4 }, {}, null] }] },
      1,
    );
    expect(out[0].line_items).toEqual([{ description: 'Room', amount: 4 }]);
  });
});

describe('pageRangeLabel', () => {
  it('reads the way a person would say it', () => {
    expect(pageRangeLabel([3])).toBe('p. 3');
    expect(pageRangeLabel([3, 4, 5])).toBe('pp. 3–5');
    expect(pageRangeLabel(null)).toBe('');
    expect(pageRangeLabel([])).toBe('');
  });
});

/* ============================================
   RQ-5 FOLLOW-UP — the extraction must reach the columns the bank reads.

   The reported symptom was "image-only PDFs return nulls". They don't: a live
   check confirmed the document block reads an image-only PDF exactly as well as
   the same content as a JPEG. What actually happened is that the OCR route wrote
   raw_ocr_json and the page range and NOTHING ELSE, while the Receipts bank
   reads vendor / date / cost_tour_currency — so a perfect scan displayed as
   "Missing vendor, date, amount", indistinguishable from a failed one.
   ============================================ */

import { receiptFieldsFromDocument, normaliseOcrDate } from './receiptDocuments';

const doc = (over: Partial<import('./receiptDocuments').ReceiptDocument> = {}) => ({
  pages: [1], vendor: 'ROCKET 6546', date: '2026-07-26', total_amount: 22.57,
  currency: 'USD', category: 'Fuel', description: null, payment_method: null,
  line_items: null, ...over,
});

describe('what a scan writes onto the receipt row', () => {
  it('writes the fields the bank actually reads', () => {
    const u = receiptFieldsFromDocument(doc());
    expect(u.vendor).toBe('ROCKET 6546');
    expect(u.date).toBe('2026-07-26');
    expect(u.cost_tour_currency).toBe(22.57);
    expect(u.category).toBe('Fuel');
  });

  it('OMITS keys it cannot fill — a re-scan must not erase a human’s correction', () => {
    const u = receiptFieldsFromDocument(doc({ vendor: null, date: null, total_amount: null }));
    expect('vendor' in u).toBe(false);
    expect('date' in u).toBe(false);
    expect('cost_tour_currency' in u).toBe(false);
  });

  it('a genuine zero is still written', () => {
    expect(receiptFieldsFromDocument(doc({ total_amount: 0 })).cost_tour_currency).toBe(0);
  });
});

describe('OCR dates — unambiguous or nothing', () => {
  it('passes ISO through', () => {
    expect(normaliseOcrDate('2026-07-26')).toBe('2026-07-26');
  });

  it('resolves an unambiguous US date off a real receipt', () => {
    // "07/26/2026" — 26 can't be a month, so the order is knowable.
    expect(normaliseOcrDate('07/26/2026')).toBe('2026-07-26');
  });

  it('resolves an unambiguous day-first date too', () => {
    expect(normaliseOcrDate('26/07/2026')).toBe('2026-07-26');
  });

  it('AMBIGUOUS returns null rather than guessing', () => {
    /* 05/06/2026 is 5 June on a British receipt and 6 May on an American one,
       and a scanned total says nothing about which. A missing date asks one
       question; a wrong date is never noticed. */
    expect(normaliseOcrDate('05/06/2026')).toBeNull();
  });

  it('rejects impossible dates instead of rolling over', () => {
    expect(normaliseOcrDate('2026-02-31')).toBeNull();
    expect(normaliseOcrDate('')).toBeNull();
    expect(normaliseOcrDate(null)).toBeNull();
  });
});

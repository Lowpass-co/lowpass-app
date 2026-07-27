/* ============================================
   LOWPASS — filename fallback (RQ-5)

   Adam's real filenames carry everything the scan failed to read. Using them is
   a clear win; using them CARELESSLY is worse than doing nothing, because a
   wrong pre-filled amount looks exactly like a correct one. So the tests are
   weighted toward what the parser must REFUSE to guess.
   ============================================ */

import { describe, it, expect } from 'vitest';
import {
  parseReceiptFilename,
  parseFilenameDate,
  parseFilenameAmount,
  filenameNote,
} from './receiptFilename';

const ADAM = '26:07:2026 | BNA Airport Parking | Nashville airport parking Jul24-26 | $72.00.pdf';

describe('Adam’s actual filename', () => {
  const f = parseReceiptFilename(ADAM);

  it('gets all four fields', () => {
    expect(f.date).toBe('2026-07-26');
    expect(f.vendor).toBe('BNA Airport Parking');
    expect(f.amount).toBe(72);
    expect(f.description).toBe('Nashville airport parking Jul24-26');
  });

  it('does NOT read “Jul24-26” as an amount', () => {
    // The description contains digits that look money-ish. Trusting them would
    // put 24 or 26 in the amount field of a $72 receipt.
    expect(f.amount).toBe(72);
  });

  it('labels itself as a guess', () => {
    expect(filenameNote(f)).toMatch(/from the filename/);
    expect(filenameNote(f)).toMatch(/confirm/i);
  });
});

describe('dates — day-first when ambiguous', () => {
  it('reads Adam’s colon format', () => {
    expect(parseFilenameDate('26:07:2026')).toBe('2026-07-26');
  });

  it('treats 05/06/2026 as 5 June, not 6 May', () => {
    /* British-run tour company, and Adam writes day-first. Guessing US order
       would silently swap day and month for the first twelve days of a month —
       wrong in a way nobody notices. */
    expect(parseFilenameDate('05/06/2026')).toBe('2026-06-05');
  });

  it('ISO is taken as ISO, needing no assumption', () => {
    expect(parseFilenameDate('2026-07-26')).toBe('2026-07-26');
  });

  it('swaps when the first number cannot be a day', () => {
    expect(parseFilenameDate('7-26-2026')).toBe('2026-07-26');
  });

  it('rejects impossible dates rather than rolling them over', () => {
    expect(parseFilenameDate('31:02:2026')).toBeNull();
    expect(parseFilenameDate('45:99:2026')).toBeNull();
  });

  it('two-digit years become 20xx', () => {
    expect(parseFilenameDate('26:07:26')).toBe('2026-07-26');
  });
});

describe('amounts — refuses more than it accepts', () => {
  it('reads a currency-marked amount', () => {
    expect(parseFilenameAmount('$72.00')).toBe(72);
    expect(parseFilenameAmount('£1,234.56')).toBe(1234.56);
    expect(parseFilenameAmount('€45')).toBe(45);
  });

  it('accepts a bare decimal only with two places', () => {
    expect(parseFilenameAmount('receipt 72.00 thing')).toBe(72);
    // A lone integer in a filename is far more often a count, a date part or an
    // invoice number than it is money.
    expect(parseFilenameAmount('receipt 72 thing')).toBeNull();
  });

  it('does not mistake a date range for money', () => {
    expect(parseFilenameAmount('Jul24-26')).toBeNull();
    expect(parseFilenameAmount('2026-07-26')).toBeNull();
  });
});

describe('what it refuses to guess', () => {
  it('an undelimited filename yields NO vendor', () => {
    // "IMG_4821" is not a vendor, and neither is "scan001".
    const f = parseReceiptFilename('IMG_4821.pdf');
    expect(f.vendor).toBeNull();
    expect(f.fields).toEqual([]);
    expect(filenameNote(f)).toBeNull();
  });

  it('an undelimited name still yields a date and amount when unambiguous', () => {
    const f = parseReceiptFilename('shell 2026-07-26 $88.20.pdf');
    expect(f.date).toBe('2026-07-26');
    expect(f.amount).toBe(88.2);
    expect(f.vendor).toBeNull(); // still won't claim a vendor
  });

  it('an empty or extension-only name yields nothing', () => {
    expect(parseReceiptFilename('').fields).toEqual([]);
    expect(parseReceiptFilename('.pdf').fields).toEqual([]);
  });

  it('a partial convention still works', () => {
    const f = parseReceiptFilename('Shell | $88.20.pdf');
    expect(f.vendor).toBe('Shell');
    expect(f.amount).toBe(88.2);
    expect(f.date).toBeNull();
    expect(f.fields).toEqual(['vendor', 'amount']);
  });

  it('field order does not matter — fields are found by shape', () => {
    const f = parseReceiptFilename('Premier Inn | 12:03:2026 | £412.50.pdf');
    expect(f.vendor).toBe('Premier Inn');
    expect(f.date).toBe('2026-03-12');
    expect(f.amount).toBe(412.5);
  });
});

/* ============================================
   LOWPASS — effectiveMediaType (RQ-5 FINAL)

   This is the rule that decides whether a receipt gets scanned at all. It exists
   because the old rule — trust `file.type` — silently skipped the scan on both of
   Adam's real receipts, and only a Re-scan button nobody would press rescued it.

   The tests are organised around the two ways it can be wrong, which pull in
   opposite directions: refusing something real (the bug), and accepting
   something it shouldn't (the temptation while fixing it).
   ============================================ */

import { describe, it, expect } from 'vitest';
import { effectiveMediaType, isScannableFile, extensionOf } from './mediaType';

describe('the bug: a browser that reports nothing useful', () => {
  it('an empty type falls back to the extension', () => {
    expect(effectiveMediaType('receipt.pdf', '')).toBe('application/pdf');
    expect(effectiveMediaType('photo.jpg', '')).toBe('image/jpeg');
  });

  it('application/octet-stream is treated as "I don’t know", not as a refusal', () => {
    expect(effectiveMediaType('folio.pdf', 'application/octet-stream')).toBe('application/pdf');
  });

  it('Adam’s actual filename resolves', () => {
    const name = '26:07:2026 | BNA Airport Parking | Nashville parking Jul24-26 | $72.00.pdf';
    expect(effectiveMediaType(name, '')).toBe('application/pdf');
    expect(isScannableFile(name, '')).toBe(true);
  });

  it('an uppercase extension is fine', () => {
    expect(effectiveMediaType('IMG_4821.JPG', '')).toBe('image/jpeg');
    expect(effectiveMediaType('SCAN.PDF', null)).toBe('application/pdf');
  });
});

describe('the temptation: don’t start accepting anything', () => {
  it('a reported type we don’t support is a real answer — refuse it', () => {
    /* Falling through to the extension here would let "invoice.pdf.zip" pass as
       a PDF. The browser knowing it's a zip is information, not noise. */
    expect(effectiveMediaType('invoice.pdf.zip', 'application/zip')).toBeNull();
    expect(effectiveMediaType('ledger.csv', 'text/csv')).toBeNull();
  });

  it('an unknown extension with no type is refused', () => {
    expect(effectiveMediaType('notes.txt', '')).toBeNull();
    expect(effectiveMediaType('archive.zip', '')).toBeNull();
    expect(effectiveMediaType('noextension', '')).toBeNull();
    expect(isScannableFile('ledger.csv', '')).toBe(false);
  });

  it('a real reported type WINS over the extension', () => {
    // The browser sniffed content; that beats a name anyone can type.
    expect(effectiveMediaType('receipt.pdf', 'image/png')).toBe('image/png');
  });
});

describe('extensionOf', () => {
  it('takes the LAST dot, so a name full of dots still works', () => {
    expect(extensionOf('26:07:2026 | thing | $72.00.pdf')).toBe('pdf');
    expect(extensionOf('a.b.c.png')).toBe('png');
  });

  it('handles no extension, a trailing dot, and nothing at all', () => {
    expect(extensionOf('receipt')).toBe('');
    expect(extensionOf('receipt.')).toBe('');
    expect(extensionOf('')).toBe('');
    expect(extensionOf(null)).toBe('');
  });
});

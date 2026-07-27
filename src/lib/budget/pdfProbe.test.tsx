/* ============================================
   LOWPASS — the PDF guard, against a REAL image-only file (RQ-5 · RCP-15)

   Adam dropped two receipts and both were rejected. They were iPhone photos
   saved as PDF: one page, an image, no text layer, ~500 KB. That is how most
   road receipts arrive, and it is precisely the class every fixture in this
   suite had missed, because every fixture was a generated TEXT pdf.

   So this file exercises the guard against a file with that exact shape. What it
   can prove: the structural gate does not refuse it, the page count comes out
   right (or fails SAFE), and an over-long file is still refused. What it cannot
   prove: that Claude reads the photo — that is the API's job and Cowork's walk.

   The failure mode being guarded against is subtle: pdf-parse is text-oriented,
   so an image-only file is the most likely input to make it throw or return
   nothing. If that were treated as "reject", the feature would refuse exactly
   the receipts it exists to read. Hence the unknown-count-passes rule, asserted
   below rather than left as a comment.
   ============================================ */

import { describe, it, expect } from 'vitest';
import { buildImageOnlyPdf, describePdf } from './imageOnlyPdfFixture';
import { isPdfUpload, pdfPageCount, pdfGate, MAX_PDF_PAGES } from './pdfProbe';

describe('the fixture really is the class that failed', () => {
  const pdf = buildImageOnlyPdf();
  const facts = describePdf(pdf);

  it('is image-only: /Image present, NO font resources', () => {
    expect(facts.hasImage).toBe(true);
    expect(facts.hasFont).toBe(false);
  });

  it('carries a GENUINE DCTDecode JPEG, like a phone does', () => {
    /* The first version of this fixture used FlateDecode raw RGB — image-only,
       but not what iOS produces, and "the synthetic fixture passes" is exactly
       why the real class went unreproduced. Adam's files are DCTDecode. */
    expect(facts.imageFilter).toBe('DCTDecode');
  });

  it('is one page, unencrypted — matching the real files', () => {
    expect(facts.declaredPageCount).toBe(1);
    expect(facts.encrypted).toBe(false);
  });

  it('is a realistic size, not a 3 KB toy', () => {
    // Adam's were 593,864 and 504,618 bytes. Same order of magnitude or the
    // fixture isn't exercising anything about real uploads.
    expect(facts.bytes).toBeGreaterThan(300_000);
    expect(facts.bytes).toBeLessThan(2_000_000);
  });

  it('is deterministic — the same bytes every run', () => {
    expect(buildImageOnlyPdf().equals(pdf)).toBe(true);
  });
});

describe('RCP-15 — an image-only PDF is NOT refused', () => {
  const pdf = buildImageOnlyPdf();

  it('is recognised as a PDF', () => {
    expect(isPdfUpload('application/pdf')).toBe(true);
    expect(isPdfUpload('APPLICATION/PDF')).toBe(true);
  });

  it('passes the page guard', async () => {
    const count = await pdfPageCount(pdf);
    const gate = pdfGate(count);
    expect(gate.ok).toBe(true);
  });

  it('its page count reads as 1, or as unknown — never as a rejection', async () => {
    const count = await pdfPageCount(pdf);
    // Either the parser handled it (1) or it couldn't (null). Both are fine;
    // what must never happen is a count that trips the limit.
    expect(count === 1 || count === null).toBe(true);
  });
});

describe('the unknown-count rule, which is what keeps image-only files working', () => {
  it('an unparseable file PASSES rather than being refused', () => {
    expect(pdfGate(null).ok).toBe(true);
  });

  it('garbage bytes yield null, not a throw', async () => {
    const count = await pdfPageCount(Buffer.from('this is not a pdf at all'));
    expect(count).toBeNull();
    expect(pdfGate(count).ok).toBe(true);
  });

  it('an empty buffer is survivable', async () => {
    await expect(pdfPageCount(Buffer.alloc(0))).resolves.toBeNull();
  });
});

describe('RCP-14 — the over-long guard still bites', () => {
  it('refuses past the limit, naming the count', () => {
    const gate = pdfGate(MAX_PDF_PAGES + 1);
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.message).toContain(String(MAX_PDF_PAGES + 1));
      expect(gate.message).toMatch(/saved/); // the file survives the refusal
    }
  });

  it('accepts exactly the limit — an off-by-one here refuses real work', () => {
    expect(pdfGate(MAX_PDF_PAGES).ok).toBe(true);
  });

  it('counts a genuinely multi-page image PDF correctly', async () => {
    const many = buildImageOnlyPdf({ width: 300, height: 400, pages: 4 });
    expect(describePdf(many).declaredPageCount).toBe(4);
    const count = await pdfPageCount(many);
    expect(count === 4 || count === null).toBe(true);
  });
});

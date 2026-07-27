/* ============================================
   LOWPASS — what kind of PDF is this? (RQ-5)

   Extracted from the OCR route so it can be TESTED. Adam dropped two real
   receipts and both were rejected; Cowork analysed the files:

     bytes 593,864 / 504,618 · pages 1 · /Image TRUE · /Font FALSE
     producer: "iOS Version 26.6"

   They are iPhone photos of receipts saved as PDF — no text layer at all. That
   is how most road receipts actually arrive, and every PDF fixture in the suite
   until now was a GENERATED TEXT PDF, which is exactly why the class was never
   caught. A guard that only ever sees text PDFs is a guard nobody has tested.

   Nothing here decides whether a receipt is readable — the API does that, and
   an image-only page is fine by it (each page is converted to an image anyway).
   These are the cheap structural questions the route asks BEFORE spending a
   call: is it a PDF, how many pages, and can we tell anything at all about it.
   ============================================ */

const PDF_TYPE = 'application/pdf';

/* RC-5 — page-count guard. The API allows 600 pages (100 under a 1M context),
   but a receipt is not a book: past ~50 pages it's a misdrop or a whole scanned
   ledger, and letting it through would spend a big slice of one batch's budget
   on a file nobody meant to send. Rejected CLEANLY — the caller keeps the stored
   file and fills the details by hand. */
export const MAX_PDF_PAGES = 50;

/** True when the upload is a PDF, which goes to Claude whole. */
export function isPdfUpload(mediaType: string | null | undefined): boolean {
  return (mediaType ?? '').toLowerCase() === PDF_TYPE;
}

/**
 * Page count, via pdf-parse — ALREADY a dependency (the deal-memo, rider and
 * tech-pack extractors use it), so this costs no new package and no native
 * binary.
 *
 * Returns null when the file won't parse, and the caller treats that as "let
 * Claude try". That default matters for RQ-5: an image-only PDF is the case most
 * likely to confuse a text-oriented parser, and the wrong response to "I can't
 * read the structure" is to refuse a receipt the API would have read fine. The
 * API's own limits are the real backstop.
 */
export async function pdfPageCount(buffer: Buffer): Promise<number | null> {
  try {
    const mod = await import('pdf-parse');
    const PDFParse = (mod as { PDFParse: new (opts: { data: Uint8Array }) => {
      getInfo: () => Promise<{ total?: number }>;
      destroy?: () => Promise<void>;
    } }).PDFParse;
    const parser = new PDFParse({ data: buffer });
    try {
      const info = await parser.getInfo();
      return typeof info?.total === 'number' ? info.total : null;
    } finally {
      if (typeof parser.destroy === 'function') await parser.destroy();
    }
  } catch {
    return null;
  }
}

/** The route's decision for a PDF upload: send it, or refuse it and say why. */
export type PdfGateVerdict =
  | { ok: true; pageCount: number | null }
  | { ok: false; pageCount: number; message: string };

/**
 * Apply the page guard. Split out from the route so the rule is testable
 * without a request, a session, or an API key.
 *
 * An UNKNOWN page count passes. See pdfPageCount — refusing what we can't parse
 * would refuse exactly the image-only receipts this feature exists to read.
 */
export function pdfGate(pageCount: number | null): PdfGateVerdict {
  if (pageCount !== null && pageCount > MAX_PDF_PAGES) {
    return {
      ok: false,
      pageCount,
      message: `That PDF is ${pageCount} pages — too long to scan (limit ${MAX_PDF_PAGES}). It's saved; enter the details manually.`,
    };
  }
  return { ok: true, pageCount };
}

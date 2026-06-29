/* ============================================
   LOWPASS — Shared export render (#8 Document Export)

   The ONE render path every export surface (Budget / Rooming / Payroll / Routing)
   goes through: build the doc → puppeteer → stream application/pdf. Two reasons it
   lives here instead of per-route:

     1. SURFACE THE ERROR. The export route used to fail silently — any throw became
        the client's generic "PDF cannot be generated." Here the whole build+render
        is wrapped: the real exception is logged server-side (it's a budget/rooming
        doc — fine to log the error; no card/PII data is in the error) and returned
        as a useful 500 JSON, never a silent non-PDF.

     2. ROBUST FOOTER. The footer/page-numbers need page.pdf's `displayHeaderFooter`
        + a footerTemplate — the one thing the export does that the proven-good rider
        route does NOT. A local render of the exact options + the real shell output
        renders fine, but if `@sparticuz/chromium` ever rejects the header/footer
        templates in production we retry once WITHOUT them (the rider's known-good
        options) so a PDF always comes back.

   Reuses getBrowser() (the same cached Chromium the rider route uses) + the shell's
   page.pdf options + footer template. Read-only.
   ============================================ */

import { NextResponse } from 'next/server';
import { getBrowser, closePage } from '@/lib/rider-packs/puppeteer';
import { PAGE_PDF_OPTIONS, PDF_HEADER_TEMPLATE, pdfFooterTemplate } from '@/lib/export/shell';

export interface ExportDoc {
  /** The full self-contained shell HTML (renderDocument output). */
  html: string;
  /** Footer left-note (e.g. "Artist — Tour · Budget"). */
  footerNote: string;
  /** Lowpass mark data-URI for the footer, or null (→ text mark). */
  markDataUri: string | null;
  /** Content-Disposition filename. */
  filename: string;
}

/** Build the doc (loaders + html) then render + stream it. The `build` callback is
 *  run INSIDE the try, so a loader/data throw is surfaced too — not just a render
 *  throw. `surface` tags the server log. */
export async function exportPdfResponse(
  surface: string,
  build: () => Promise<ExportDoc>,
): Promise<Response> {
  try {
    const { html, footerNote, markDataUri, filename } = await build();

    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'load', timeout: 20_000 });
      let buffer: Uint8Array;
      try {
        buffer = await page.pdf({
          ...PAGE_PDF_OPTIONS,
          headerTemplate: PDF_HEADER_TEMPLATE,
          footerTemplate: pdfFooterTemplate(footerNote, markDataUri),
        });
      } catch (footerErr) {
        // The header/footer templates are the only thing this does beyond the
        // proven-good rider route — if Chromium rejects them, render plain.
        console.error(`[export:${surface}] header/footer render failed, retrying plain:`, footerErr instanceof Error ? footerErr.message : footerErr);
        buffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '16mm', right: '14mm', bottom: '16mm', left: '14mm' } });
      }
      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      });
    } finally {
      await closePage(page);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Log the REAL exception (type + stack) so a failure is never invisible again.
    console.error(`[export:${surface}] PDF generation failed:`, err instanceof Error ? err.stack ?? err.message : message);
    return NextResponse.json({ error: 'Could not generate the PDF', detail: message }, { status: 500 });
  }
}

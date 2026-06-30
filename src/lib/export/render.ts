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
import { PAGE_PDF_OPTIONS, PDF_HEADER_TEMPLATE, pdfFooterTemplate, pdfRunningHeaderTemplate } from '@/lib/export/shell';

/** A header-safe `Content-Disposition` value (RFC 5987). HTTP header values must be
 *  Latin-1 (≤255), so a filename with an em dash (—, U+2014, the "<Artist> — <Tour>"
 *  separator) or an accent (José, Beyoncé) makes `new Response` throw
 *  "Cannot convert argument to a ByteString". We emit BOTH:
 *    - filename="…"  — ASCII fallback (non-ASCII → '-', quotes/backslashes stripped),
 *      Latin-1 safe so it can never throw.
 *    - filename*=UTF-8''… — the real Unicode name (percent-encoded → ASCII) for
 *      modern browsers.
 *  Shared here so Budget, Rooming, and the future Payroll/Routing all inherit it. */
export function contentDisposition(filename: string): string {
  const asciiFallback = filename.normalize('NFKD').replace(/[^\x20-\x7E]/g, '-').replace(/["\\]/g, '');
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export interface ExportDoc {
  /** The full self-contained shell HTML (renderDocument output). */
  html: string;
  /** Footer left-note (e.g. "Artist — Tour · Budget"). */
  footerNote: string;
  /** Lowpass mark data-URI for the footer, or null (→ text mark). */
  markDataUri: string | null;
  /** Content-Disposition filename. */
  filename: string;
  /** Phase 2 — footer styling (show / page numbers / summary line). Absent →
   *  today's footer (mark + note + page numbers). */
  footer?: { show?: boolean; pageNumbers?: boolean; summaryLine?: boolean };
  /** Part B — the reduced running header's left text ("Artist — Tour · Surface").
   *  When set, a slim repeating header band is printed on every page (page 1's full
   *  banner sits below it in the content). Null/absent → no running header. */
  runningHeader?: string | null;
}

/** Build the doc (loaders + html) then render + stream it. The `build` callback is
 *  run INSIDE the try, so a loader/data throw is surfaced too — not just a render
 *  throw. `surface` tags the server log. */
export async function exportPdfResponse(
  surface: string,
  build: () => Promise<ExportDoc>,
): Promise<Response> {
  try {
    const { html, footerNote, markDataUri, filename, footer, runningHeader } = await build();

    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'load', timeout: 20_000 });
      // Footer: show:false → a minimal non-empty template (Chromium needs one to
      // honour the bottom margin) with no mark/note/numbers.
      const footerTemplate =
        footer?.show === false
          ? '<span></span>'
          : pdfFooterTemplate(footerNote, markDataUri, { summaryLine: footer?.summaryLine, pageNumbers: footer?.pageNumbers });
      // Part B — the reduced running header (repeats on every page). Page 1's full
      // banner sits in the content below this slim margin band.
      const headerTemplate = runningHeader ? pdfRunningHeaderTemplate(runningHeader) : PDF_HEADER_TEMPLATE;
      let buffer: Uint8Array;
      try {
        buffer = await page.pdf({
          ...PAGE_PDF_OPTIONS,
          headerTemplate,
          footerTemplate,
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
          'Content-Disposition': contentDisposition(filename),
          'Cache-Control': 'no-store',
        },
      });
    } finally {
      await closePage(page);
    }
  } catch (err) {
    return exportErrorResponse(surface, err);
  }
}

/** The ONE error response for a failing export. Logs the real exception (type +
 *  stack) server-side AND returns it as a 500 JSON body — `{ error, detail, stack }`
 *  — so a failure is never a silent non-PDF again. Used by exportPdfResponse's own
 *  catch AND by the route handlers wrapping their ENTIRE body (auth / params /
 *  workspace-RLS / loaders / build / render) so NO throw can escape as a bare 500.
 *  Safe to surface: it's a budget/rooming doc — the stack carries no card/PII data. */
export function exportErrorResponse(surface: string, err: unknown): NextResponse {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack ?? null : null;
  console.error(`[export:${surface}] PDF generation failed: ${message}\n${stack ?? ''}`);
  return NextResponse.json({ error: 'Could not generate the PDF', detail: message, stack }, { status: 500 });
}

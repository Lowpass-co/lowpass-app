/* ============================================
   LOWPASS — Branded export shell (#8 Document Export)

   The SHARED letterhead + chrome that wraps every surface's PDF body (Budget
   first; Rooming / Payroll / Routing reuse this unchanged). Server-rendered HTML
   → PDF via the existing puppeteer pipeline (getBrowser() in
   src/lib/rider-packs/puppeteer.ts; mirrors pdf-render.ts).

   Contract (generic — NO surface-specific assumptions live here):
     - renderDocument({ letterhead, title, bodyHtml }) → a full, self-contained
       <!DOCTYPE html> A4 document. The per-surface body is an opaque HTML string.
     - PAGE_PDF_OPTIONS + pdfFooterTemplate()/PDF_HEADER_TEMPLATE → the page.pdf()
       options the route passes to puppeteer (footer = Lowpass mark + page numbers,
       which must live in page.pdf's footerTemplate — Chromium ignores CSS @page
       margin-box content).

   Tokens: a standalone Chromium doc does NOT load globals.css, so the shell
   defines the `var(--lp-*)` it uses in :root (same approach as pdf-render.ts).
   ============================================ */

export interface ShellLetterhead {
  artistName: string | null;
  tourName: string;
  /** e.g. "12 Mar – 28 Apr 2026". Null/empty → omitted. */
  tourDates?: string | null;
  /** Base64 data URI (NEVER a network URL — see logo.ts). Null → initials block. */
  logoDataUri?: string | null;
  /** Formatted generation timestamp, e.g. "27 Jun 2026". */
  generatedOn: string;
}

export interface ShellDocument {
  letterhead: ShellLetterhead;
  /** Surface title, e.g. "Budget — Projected vs Actual". */
  title: string;
  /** Optional one-line subtitle under the title (e.g. version + scope). */
  subtitle?: string | null;
  /** The per-surface body HTML (opaque to the shell). */
  bodyHtml: string;
}

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** Initials from an artist/tour name for the no-logo fallback block. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const SHELL_CSS = `
:root {
  --lp-orange: #FF4500;
  --lp-text: #14110f;
  --lp-text-secondary: #46413c;
  --lp-text-tertiary: #8a837b;
  --lp-border: #e4ded6;
  --lp-border-strong: #cfc7bc;
  --lp-bg-subtle: #faf8f5;
  --lp-panel: #ffffff;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: var(--lp-text);
  font-size: 10px;
  line-height: 1.45;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
@page { size: A4; margin: 16mm 14mm 20mm 14mm; }

/* ---- letterhead (first page) ---- */
.lp-letterhead {
  display: flex; align-items: center; gap: 14px;
  padding-bottom: 12px; margin-bottom: 16px;
  border-bottom: 2px solid var(--lp-orange);
}
.lp-lh-logo { height: 48px; width: auto; max-width: 160px; object-fit: contain; }
.lp-lh-initials {
  height: 48px; width: 48px; flex: 0 0 48px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--lp-orange) 12%, transparent);
  color: var(--lp-orange); font-weight: 800; font-size: 18px; letter-spacing: 0.5px;
}
.lp-lh-meta { flex: 1 1 auto; min-width: 0; }
.lp-lh-artist { font-size: 11px; font-weight: 700; color: var(--lp-text-secondary); text-transform: uppercase; letter-spacing: 0.6px; }
.lp-lh-tour { font-size: 19px; font-weight: 800; color: var(--lp-text); line-height: 1.15; margin-top: 1px; }
.lp-lh-dates { font-size: 10px; color: var(--lp-text-tertiary); margin-top: 2px; }
.lp-lh-right { text-align: right; flex: 0 0 auto; }
.lp-doc-title { font-size: 13px; font-weight: 700; color: var(--lp-orange); }
.lp-doc-sub { font-size: 9.5px; color: var(--lp-text-tertiary); margin-top: 2px; }
.lp-doc-gen { font-size: 9px; color: var(--lp-text-tertiary); margin-top: 4px; }

/* ---- shared table primitives (bodies reuse) ---- */
.lp-tbl { width: 100%; border-collapse: collapse; margin: 6px 0 14px; }
.lp-tbl th { text-align: left; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--lp-text-tertiary); border-bottom: 1px solid var(--lp-border-strong); padding: 4px 6px; }
.lp-tbl td { padding: 4px 6px; border-bottom: 1px solid var(--lp-border); vertical-align: top; }
.lp-tbl td.num, .lp-tbl th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.lp-tbl tr.lp-subtotal td { font-weight: 700; border-top: 1px solid var(--lp-border-strong); border-bottom: none; }
.lp-sec-head { font-size: 12px; font-weight: 800; color: var(--lp-text); margin: 16px 0 2px; }
.lp-native { color: var(--lp-text-tertiary); font-size: 8.5px; }
.lp-pos { color: #1f7a4d; } .lp-neg { color: #b4452f; }
.lp-page-break { page-break-before: always; }
`;

/** page.pdf() options — the route spreads these into puppeteer. Footer reserves
 *  the bottom margin; displayHeaderFooter wires the templates below. */
export const PAGE_PDF_OPTIONS = {
  format: 'A4' as const,
  printBackground: true,
  displayHeaderFooter: true,
  margin: { top: '16mm', right: '14mm', bottom: '20mm', left: '14mm' },
};

/** Empty header — the letterhead lives in the body's first page, not a repeating
 *  page header. (Chromium requires a non-empty template to honour the margin.) */
export const PDF_HEADER_TEMPLATE = '<span></span>';

/** Repeating footer (Chromium renders this per page): Lowpass mark + a note on
 *  the left, page x / y on the right. Chromium strips most CSS — inline only. */
export function pdfFooterTemplate(footerNote: string, markDataUri: string | null): string {
  const mark = markDataUri
    ? `<img src="${markDataUri}" style="height:9px;width:auto;vertical-align:middle;opacity:0.7;" />`
    : `<span style="font-weight:700;letter-spacing:0.5px;">LOWPASS</span>`;
  return `
<div style="width:100%;font-size:7px;color:#8a837b;font-family:-apple-system,Arial,sans-serif;padding:0 14mm;display:flex;align-items:center;justify-content:space-between;">
  <span style="display:inline-flex;align-items:center;gap:5px;">${mark}<span>${esc(footerNote)}</span></span>
  <span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
</div>`;
}

/** Compose the full self-contained A4 HTML document. The body is opaque. */
export function renderDocument(doc: ShellDocument): string {
  const { letterhead: lh, title, subtitle, bodyHtml } = doc;
  const logo = lh.logoDataUri
    ? `<img class="lp-lh-logo" src="${lh.logoDataUri}" alt="" />`
    : `<div class="lp-lh-initials">${esc(initials(lh.artistName || lh.tourName))}</div>`;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><style>${SHELL_CSS}</style></head>
<body>
  <header class="lp-letterhead">
    ${logo}
    <div class="lp-lh-meta">
      ${lh.artistName ? `<div class="lp-lh-artist">${esc(lh.artistName)}</div>` : ''}
      <div class="lp-lh-tour">${esc(lh.tourName)}</div>
      ${lh.tourDates ? `<div class="lp-lh-dates">${esc(lh.tourDates)}</div>` : ''}
    </div>
    <div class="lp-lh-right">
      <div class="lp-doc-title">${esc(title)}</div>
      ${subtitle ? `<div class="lp-doc-sub">${esc(subtitle)}</div>` : ''}
      <div class="lp-doc-gen">Generated ${esc(lh.generatedOn)}</div>
    </div>
  </header>
  ${bodyHtml}
</body></html>`;
}

/** Shared escape for surface bodies (so they don't each re-implement it). */
export const escapeHtml = esc;

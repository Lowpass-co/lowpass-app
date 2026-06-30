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

import type { GeneralStyle, HeaderStyle } from '@/lib/export/template-config';

export interface ShellLetterhead {
  artistName: string | null;
  tourName: string;
  /** e.g. "12 Mar – 28 Apr 2026". Null/empty → omitted. */
  tourDates?: string | null;
  /** Base64 data URI (NEVER a network URL — see logo.ts). Null → initials block. */
  logoDataUri?: string | null;
  /** Template config — show the logo/initials block at all (default true). When
   *  false the letterhead is text-only. */
  showLogo?: boolean;
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
  /** Template config — page size (default A4). */
  pageSize?: 'A4' | 'Letter';
  /** Phase 2 — document styling. Absent → today's output (no overrides). */
  general?: GeneralStyle;
  /** Phase 2 — letterhead styling (element order/visibility, logo, background). */
  header?: HeaderStyle;
  /** Phase 2 — the resolved background-image data URI (header.bgAssetPath → logo.ts). */
  bgDataUri?: string | null;
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
 *  the left, page x / y on the right. Chromium strips most CSS — inline only.
 *  Phase 2 — `opts` toggles the summary line (mark + note) and the page numbers;
 *  defaults preserve today's footer byte-for-byte. */
export function pdfFooterTemplate(
  footerNote: string,
  markDataUri: string | null,
  opts?: { summaryLine?: boolean; pageNumbers?: boolean },
): string {
  const summaryLine = opts?.summaryLine !== false;
  const pageNumbers = opts?.pageNumbers !== false;
  const mark = markDataUri
    ? `<img src="${markDataUri}" style="height:9px;width:auto;vertical-align:middle;opacity:0.7;" />`
    : `<span style="font-weight:700;letter-spacing:0.5px;">LOWPASS</span>`;
  const left = summaryLine
    ? `<span style="display:inline-flex;align-items:center;gap:5px;">${mark}<span>${esc(footerNote)}</span></span>`
    : `<span></span>`;
  const right = pageNumbers ? `<span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>` : `<span></span>`;
  return `
<div style="width:100%;font-size:7px;color:#8a837b;font-family:-apple-system,Arial,sans-serif;padding:0 14mm;display:flex;align-items:center;justify-content:space-between;">
  ${left}
  ${right}
</div>`;
}

/** The embed-safe font stacks for `general.fontFamily`. 'system' === the SHELL_CSS
 *  default (so it emits NO override). No network @font-face — all OS-resident. */
const FONT_STACKS: Record<string, string> = {
  serif: 'Georgia, "Times New Roman", "Liberation Serif", serif',
  mono: '"SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
};

/** Phase-2 general styling → an extra `<style>` block. CRITICAL: returns '' when
 *  every field is its default, so the default document is byte-for-byte today's
 *  output (SHELL_CSS is never modified). Presentation only. */
function generalOverrideCss(g?: GeneralStyle): string {
  if (!g) return '';
  const rules: string[] = [];
  if (g.fontFamily && FONT_STACKS[g.fontFamily]) rules.push(`body { font-family: ${FONT_STACKS[g.fontFamily]}; }`);
  if (g.fontScale && g.fontScale !== 1) rules.push(`body { zoom: ${g.fontScale}; }`);
  if (g.monochrome) rules.push(`html { filter: grayscale(100%); }`);
  if (g.dividers) rules.push(`.lp-sec-head { border-top: 1px dashed var(--lp-border-strong); padding-top: 10px; }`);
  if (g.hideBoxes) rules.push(`.lp-tbl, .lp-tbl th, .lp-tbl td, .lp-tbl tr.lp-subtotal td { border: none !important; }`);
  return rules.length ? `<style>${rules.join('\n')}</style>` : '';
}

/** Resolve the letterhead. Built from `header` (defaults reproduce today's exact
 *  letterhead bytes); `header.show === false` omits it entirely. */
function renderLetterhead(lh: ShellLetterhead, title: string, subtitle: string | null | undefined, header: HeaderStyle | undefined, bgDataUri: string | null | undefined): string {
  if (header && header.show === false) return '';

  // Logo (left block) — config.logo gates it via showLogo; align/size/radius via header.
  const logoStyle: string[] = [];
  if (header && header.logoMaxHeight !== 48) logoStyle.push(`height:${header.logoMaxHeight}px`);
  if (header && header.logoRadius) logoStyle.push(`border-radius:${header.logoRadius}px`);
  // logoAlign: left (default) keeps order; right pushes the logo to the end.
  if (header && header.logoAlign === 'right') logoStyle.push('order:9', 'margin-left:auto');
  const logoStyleAttr = logoStyle.length ? ` style="${logoStyle.join(';')}"` : '';
  const logo =
    lh.showLogo === false
      ? ''
      : lh.logoDataUri
        ? `<img class="lp-lh-logo" src="${lh.logoDataUri}" alt=""${logoStyleAttr} />`
        : `<div class="lp-lh-initials"${logoStyleAttr}>${esc(initials(lh.artistName || lh.tourName))}</div>`;

  // Meta zone (artist / tour / dates) — element order + visibility from header.
  const elements = header?.elements ?? [
    { id: 'artist' as const, show: true },
    { id: 'tour' as const, show: true },
    { id: 'dates' as const, show: true },
  ];
  const metaFor = (id: string): string => {
    if (id === 'artist') return lh.artistName ? `<div class="lp-lh-artist">${esc(lh.artistName)}</div>` : '';
    if (id === 'tour') return `<div class="lp-lh-tour">${esc(lh.tourName)}</div>`;
    if (id === 'dates') return lh.tourDates ? `<div class="lp-lh-dates">${esc(lh.tourDates)}</div>` : '';
    return '';
  };
  const metaParts = elements.map((e) => (e.show === false ? '' : metaFor(e.id)));

  // Right zone (title / subtitle / generated) — show toggles from header.
  const showTitle = header ? header.showTitle : true;
  const showSubtitle = header ? header.showSubtitle : true;
  const showGenerated = header ? header.showGenerated : true;
  const rightParts = [
    showTitle ? `<div class="lp-doc-title">${esc(title)}</div>` : '',
    showSubtitle && subtitle ? `<div class="lp-doc-sub">${esc(subtitle)}</div>` : '',
    showGenerated ? `<div class="lp-doc-gen">Generated ${esc(lh.generatedOn)}</div>` : '',
  ];

  // Background image (faded photo) — only when an asset resolved; positioned layer.
  const bg = bgDataUri
    ? `<div style="position:absolute;inset:0;background-image:url('${bgDataUri}');background-size:cover;background-position:center;opacity:${header?.bgOpacity ?? 0.15};z-index:0;"></div>`
    : '';
  const headerStyleAttr = bgDataUri ? ' style="position:relative;overflow:hidden"' : '';
  const zoneStyle = bgDataUri ? ' style="position:relative;z-index:1"' : '';

  return `<header class="lp-letterhead"${headerStyleAttr}>
    ${bg}${logo}
    <div class="lp-lh-meta"${zoneStyle}>
      ${metaParts.join('\n      ')}
    </div>
    <div class="lp-lh-right"${zoneStyle}>
      ${rightParts.join('\n      ')}
    </div>
  </header>`;
}

/** Compose the full self-contained A4 HTML document. The body is opaque. */
export function renderDocument(doc: ShellDocument): string {
  const { letterhead: lh, title, subtitle, bodyHtml } = doc;
  // Template config: page size (A4 default). The override @page (size only) merges
  // with SHELL_CSS's @page margin, so Letter keeps the same margins.
  const pageStyle = doc.pageSize && doc.pageSize !== 'A4' ? `<style>@page { size: ${doc.pageSize}; }</style>` : '';
  const styleOverride = generalOverrideCss(doc.general);
  const letterhead = renderLetterhead(lh, title, subtitle, doc.header, doc.bgDataUri);
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><style>${SHELL_CSS}</style>${pageStyle}${styleOverride}</head>
<body>
  ${letterhead}
  ${bodyHtml}
</body></html>`;
}

/** Shared escape for surface bodies (so they don't each re-implement it). */
export const escapeHtml = esc;

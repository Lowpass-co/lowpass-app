/* ============================================
   LOWPASS — Rider PDF HTML composer (Sprint 12 §10)

   Server-side HTML string emitter for the single-rider PDF
   endpoint. Builds a self-contained HTML document that
   Puppeteer feeds into page.setContent().

   WHY HAND-ROLLED HTML INSTEAD OF renderToStaticMarkup
   ----------------------------------------------------
   ReadOnlyPackView is 'use client', and Next 16 forbids
   importing it into a server module that also imports
   react-dom/server (the client/server boundary rule). We have
   two options:

     1. Duplicate the component as a non-client server-only
        twin and keep them in sync.
     2. Emit HTML directly as template strings.

   (2) wins because the PDF actually has different needs from
   the web reader (forced page breaks, no link behaviour, no
   asset-load JS handlers, no <img onError>). Hand-rolling
   lets us produce print-clean markup without compromise.

   The schema lives in @/lib/rider-packs/web-links
   PublicRiderPayload — same shape the public reader consumes,
   so anything in the payload renders identically in browser
   and PDF (modulo print stylesheet).

   COVERAGE
   --------
   - Cover page          ✓
   - Table of contents   ✓ (anchors only — page numbers come
                          from a future pagination pass)
   - Field sections      ✓ (text, table, contact, asset, time,
                          currency, number, checkbox_list, url)
   - Rich text sections  ✓ (h2, h3, p, ul, li, variableNode)
   - Advance summary     ✓ (subject/body table)
   - Channel list        ✗ STUB: data lives in separate tables
                          (sub_snakes, stage_boxes, channel_
                          list_rows) that the public payload
                          doesn't currently surface. Renders
                          "(channel list — see app for live
                          view)". Tracked as a §10 follow-up.
   ============================================ */

import type { PublicRiderPayload } from '@/lib/rider-packs/web-links';
import { formatOrdinalDate } from '@/lib/text/ordinalDate';

type Section = PublicRiderPayload['sections'][number];

interface FieldLike {
  type: string;
  key: string;
  label?: string;
  [k: string]: unknown;
}

export function buildRiderPdfHtml(payload: PublicRiderPayload): string {
  const { pack, sections, signedUrls } = payload;
  const ordered = [...sections].sort((a, b) => a.sort_order - b.sort_order);

  const artistName = escapeHtml(pack.artist_name);
  const riderTitle = escapeHtml(pack.title ?? 'Rider');
  const footerText = `${artistName} — ${riderTitle}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${artistName} — ${riderTitle}</title>
<style>${BASE_CSS}</style>
<style>${PRINT_CSS}</style>
</head>
<body>
${renderCover(pack)}
${renderToc(ordered)}
<main class="lp-pdf-body">
${ordered.map((s) => renderSection(s, signedUrls)).join('\n')}
</main>
<div class="lp-pdf-footer" aria-hidden="true">${footerText}</div>
</body>
</html>`;
}

/* ----------------------------------------------------------
   Cover page
   ---------------------------------------------------------- */
function renderCover(pack: PublicRiderPayload['pack']): string {
  const artistName = escapeHtml(pack.artist_name);
  const title = escapeHtml(pack.title?.trim() || 'Rider');
  const subtitle = pack.cover_subtitle?.trim();
  const disclaimer = pack.cover_disclaimer?.trim();
  const dateLabel = formatOrdinalDate(pack.updated_at);
  const logoUrl = pack.cover_logo_url;

  return `<section class="lp-pdf-cover">
  <div class="lp-cover-logo">${logoUrl ? `<img src="${escapeAttr(logoUrl)}" alt="${artistName} logo" />` : ''}</div>
  <h1 class="lp-cover-artist">${artistName}</h1>
  <h2 class="lp-cover-title">${title}</h2>
  ${subtitle ? `<p class="lp-cover-subtitle">${escapeHtml(subtitle)}</p>` : ''}
  <div class="lp-cover-spacer"></div>
  ${dateLabel ? `<p class="lp-cover-date">Rider Updated — ${escapeHtml(dateLabel)}</p>` : ''}
  ${disclaimer ? `<p class="lp-cover-disclaimer">${escapeHtml(disclaimer)}</p>` : ''}
</section>`;
}

/* ----------------------------------------------------------
   Table of contents
   ---------------------------------------------------------- */
function renderToc(sections: Section[]): string {
  if (sections.length === 0) return '';
  const items = sections.map((s) => {
    const title = fallbackTitle(s);
    return `<li><a href="#section-${escapeAttr(s.section_key)}">${escapeHtml(title)}</a><span class="lp-toc-page">Page —</span></li>`;
  });
  return `<section class="lp-pdf-toc">
  <h2 class="lp-toc-heading">Contents</h2>
  <ul class="lp-toc-list">${items.join('')}</ul>
</section>`;
}

function fallbackTitle(s: Section): string {
  const t = s.title?.trim();
  if (t) return t;
  switch (s.section_type) {
    case 'channel_list':
      return 'Channel list';
    case 'rich_text':
      return 'Rich text';
    case 'advance_summary':
      return 'Advance summary';
    default:
      return s.section_key;
  }
}

/* ----------------------------------------------------------
   Sections — dispatch on section_type.
   ---------------------------------------------------------- */
function renderSection(s: Section, signedUrls: Record<string, string | null>): string {
  const title = escapeHtml(s.title?.trim() || fallbackTitle(s));
  const body = renderSectionBody(s, signedUrls);
  return `<section id="section-${escapeAttr(s.section_key)}" class="lp-pdf-section">
  <h2 class="lp-section-heading">${title}</h2>
  <div class="lp-section-body">${body}</div>
</section>`;
}

function renderSectionBody(s: Section, signedUrls: Record<string, string | null>): string {
  const type = s.section_type ?? 'fields';

  if (type === 'rich_text') {
    const content = (s.metadata as { content?: unknown } | null)?.content;
    if (!content) return emptyMarker();
    return `<div class="lp-prose">${renderTiptap(content)}</div>`;
  }

  if (type === 'advance_summary') {
    const summary = (s.metadata as { summary?: unknown } | null)?.summary;
    if (!Array.isArray(summary) || summary.length === 0) return emptyMarker();
    return renderAdvanceSummary(summary as Array<{ subject?: unknown; body?: unknown }>);
  }

  if (type === 'channel_list') {
    /* See header note — channel list rendering requires data
     * the public payload doesn't currently carry. */
    return `<div class="lp-section-stub">Channel list — open in app for full routing detail.</div>`;
  }

  const fields = (s.fields as FieldLike[]) ?? [];
  if (fields.length === 0) return emptyMarker();
  return fields.map((f) => renderField(f, signedUrls)).join('');
}

function emptyMarker(): string {
  return `<div class="lp-empty">(empty)</div>`;
}

/* ----------------------------------------------------------
   Field renderers — one per FieldType.
   ---------------------------------------------------------- */
function renderField(f: FieldLike, signedUrls: Record<string, string | null>): string {
  const label = typeof f.label === 'string' ? f.label.trim() : '';
  const labelHtml = label ? `<div class="lp-field-label">${escapeHtml(label)}</div>` : '';
  return `<div class="lp-field">${labelHtml}<div class="lp-field-value">${renderFieldValue(f, signedUrls)}</div></div>`;
}

function renderFieldValue(f: FieldLike, signedUrls: Record<string, string | null>): string {
  switch (f.type) {
    case 'text': {
      const v = typeof f.value === 'string' ? f.value : '';
      if (!v) return dash();
      return `<div class="lp-text">${escapeHtml(v)}</div>`;
    }
    case 'table': {
      const cols = Array.isArray(f.columns)
        ? (f.columns as Array<{ key?: unknown; label?: unknown }>)
        : [];
      const rows = Array.isArray(f.rows) ? (f.rows as Array<Record<string, unknown>>) : [];
      if (cols.length === 0 || rows.length === 0) return dash();
      const head = cols
        .map((c) => `<th>${escapeHtml(String(c.label ?? ''))}</th>`)
        .join('');
      const bodyRows = rows
        .map((r) => {
          const cells = cols
            .map((c) => `<td>${escapeHtml(String(r[String(c.key ?? '')] ?? ''))}</td>`)
            .join('');
          return `<tr>${cells}</tr>`;
        })
        .join('');
      return `<table class="lp-table"><thead><tr>${head}</tr></thead><tbody>${bodyRows}</tbody></table>`;
    }
    case 'contact': {
      const entries = Array.isArray(f.entries)
        ? (f.entries as Array<Record<string, unknown>>)
        : [];
      if (entries.length === 0) return dash();
      return `<div class="lp-contacts">${entries.map(renderContact).join('')}</div>`;
    }
    case 'asset': {
      const id = typeof f.asset_id === 'string' ? f.asset_id : '';
      if (!id) return dash();
      const url = signedUrls[id];
      if (!url) return `<div class="lp-empty">(asset unavailable)</div>`;
      const alt = typeof f.label === 'string' ? f.label : 'asset';
      return `<div class="lp-asset"><img src="${escapeAttr(url)}" alt="${escapeAttr(alt)}" /></div>`;
    }
    case 'time': {
      const v = typeof f.value === 'string' ? f.value : '';
      if (!v) return dash();
      return `<div class="lp-mono">${escapeHtml(v)}</div>`;
    }
    case 'currency': {
      const n = typeof f.amount === 'number' ? f.amount : NaN;
      if (!Number.isFinite(n)) return dash();
      const code = typeof f.currency === 'string' ? f.currency : 'USD';
      let rendered: string;
      try {
        rendered = new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(n);
      } catch {
        rendered = `${code} ${n}`;
      }
      return `<div>${escapeHtml(rendered)}</div>`;
    }
    case 'number': {
      const v = typeof f.value === 'number' ? f.value : NaN;
      if (!Number.isFinite(v)) return dash();
      const unit = typeof f.unit === 'string' ? f.unit : '';
      return `<div>${escapeHtml(String(v))}${unit ? ' ' + escapeHtml(unit) : ''}</div>`;
    }
    case 'checkbox_list': {
      const items = Array.isArray(f.items)
        ? (f.items as Array<{ key?: unknown; label?: unknown; checked?: unknown }>)
        : [];
      if (items.length === 0) return dash();
      const lis = items
        .map((item) => {
          const checked = item.checked === true;
          const box = `<span class="lp-checkbox ${checked ? 'lp-checkbox-on' : ''}"></span>`;
          return `<li>${box}<span>${escapeHtml(String(item.label ?? ''))}</span></li>`;
        })
        .join('');
      return `<ul class="lp-checklist">${lis}</ul>`;
    }
    case 'url': {
      const href = typeof f.href === 'string' ? f.href.trim() : '';
      if (!href) return dash();
      const display = typeof f.display_text === 'string' ? f.display_text.trim() : '';
      return `<a class="lp-link" href="${escapeAttr(href)}">${escapeHtml(display || href)}</a>`;
    }
    default:
      return `<div class="lp-empty">(unsupported field)</div>`;
  }
}

function renderContact(entry: Record<string, unknown>): string {
  const show = new Set(
    Array.isArray(entry.show_fields) ? (entry.show_fields as string[]) : [],
  );
  const get = (k: string): string => {
    const v = entry[k];
    return typeof v === 'string' ? v.trim() : '';
  };
  const lines: string[] = [];
  if (show.has('name') && get('name')) lines.push(`<div class="lp-contact-name">${escapeHtml(get('name'))}</div>`);
  if (show.has('role') && get('role')) lines.push(`<div class="lp-contact-meta">${escapeHtml(get('role'))}</div>`);
  if (show.has('company') && get('company')) lines.push(`<div class="lp-contact-meta">${escapeHtml(get('company'))}</div>`);
  if (show.has('email') && get('email')) lines.push(`<div class="lp-contact-link">${escapeHtml(get('email'))}</div>`);
  if (show.has('phone') && get('phone')) lines.push(`<div class="lp-contact-meta">${escapeHtml(get('phone'))}</div>`);
  if (show.has('notes') && get('notes')) lines.push(`<div class="lp-contact-notes">${escapeHtml(get('notes'))}</div>`);
  return `<div class="lp-contact">${lines.join('')}</div>`;
}

function dash(): string {
  return `<div class="lp-empty">-</div>`;
}

/* ----------------------------------------------------------
   Advance summary table
   ---------------------------------------------------------- */
function renderAdvanceSummary(rows: Array<{ subject?: unknown; body?: unknown }>): string {
  const trs = rows
    .map((row) => {
      const subject = typeof row.subject === 'string' ? row.subject.trim() : '';
      const body = typeof row.body === 'string' ? row.body.trim() : '';
      if (!subject && !body) return '';
      return `<tr><td class="lp-summary-subject">${escapeHtml(subject || '—')}</td><td class="lp-summary-body">${escapeHtml(body || '—')}</td></tr>`;
    })
    .filter(Boolean);
  return `<table class="lp-summary"><tbody>${trs.join('')}</tbody></table>`;
}

/* ----------------------------------------------------------
   Tiptap doc walker. Recognises the subset our editor emits:
     doc, heading (level 2|3), paragraph, bulletList/bullet_list,
     listItem/list_item, text, variableNode.
   Unknown node types render their children inline so content
   isn't lost.
   ---------------------------------------------------------- */
interface TiptapNodeLike {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNodeLike[];
  text?: string;
}

function renderTiptap(node: unknown): string {
  if (node === null || typeof node !== 'object') return '';
  const n = node as TiptapNodeLike;
  const children = Array.isArray(n.content) ? n.content.map(renderTiptap).join('') : '';
  switch (n.type) {
    case 'doc':
      return children;
    case 'heading': {
      const level = Number(n.attrs?.level) === 3 ? 3 : 2;
      return `<h${level}>${children}</h${level}>`;
    }
    case 'paragraph':
      return `<p>${children}</p>`;
    case 'bulletList':
    case 'bullet_list':
      return `<ul>${children}</ul>`;
    case 'listItem':
    case 'list_item':
      return `<li>${children}</li>`;
    case 'text':
      return escapeHtml(n.text ?? '');
    case 'variableNode': {
      /* Unresolved variable node — public route normally
         pre-substitutes these into text. If one slips through
         we render the bracketed label so the gap is visible. */
      const label =
        typeof n.attrs?.label === 'string'
          ? n.attrs.label
          : typeof n.attrs?.token === 'string'
            ? n.attrs.token
            : 'variable';
      return `<span class="lp-var">{${escapeHtml(label)}}</span>`;
    }
    default:
      return children;
  }
}

/* ----------------------------------------------------------
   Escape helpers — used everywhere we interpolate user data.
   ---------------------------------------------------------- */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

/* ----------------------------------------------------------
   Document CSS — design-token shim + the styles the renderers
   above hook into. No Tailwind, no external CSS — Puppeteer
   gets a fully self-contained string.
   ---------------------------------------------------------- */
const BASE_CSS = `
:root {
  --lp-orange: #FF4500;
  --lp-text: #0a0a0a;
  --lp-text-secondary: #525252;
  --lp-text-tertiary: #737373;
  --lp-border: #e5e5e5;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 13px;
  line-height: 1.45;
  color: var(--lp-text);
  background: #ffffff;
}
img { max-width: 100%; }
a { color: var(--lp-orange); text-decoration: none; }

.lp-pdf-cover {
  max-width: 48rem;
  margin: 0 auto;
  padding: 4rem 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  min-height: 90vh;
}
.lp-cover-logo {
  height: 140px;
  width: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 2rem;
}
.lp-cover-logo img { max-height: 100%; max-width: 100%; object-fit: contain; }
.lp-cover-artist { margin: 0 0 0.5rem; font-size: 2.25rem; font-weight: 700; letter-spacing: -0.01em; }
.lp-cover-title { margin: 0; font-size: 1.5rem; font-weight: 500; color: #404040; }
.lp-cover-subtitle { margin: 0.5rem 0 0; font-size: 1rem; color: var(--lp-text-tertiary); font-style: italic; }
.lp-cover-spacer { flex: 1; min-height: 2rem; }
.lp-cover-date {
  margin: 1rem 0 0;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lp-text-tertiary);
}
.lp-cover-disclaimer {
  margin: 1rem 0 0;
  padding-top: 0.75rem;
  border-top: 1px solid var(--lp-border);
  font-size: 0.7rem;
  line-height: 1.5;
  color: var(--lp-text-secondary);
  font-style: italic;
  max-width: 36rem;
}

.lp-pdf-toc { max-width: 48rem; margin: 0 auto; padding: 3rem 2rem; }
.lp-toc-heading { margin: 0 0 1.5rem; font-size: 1.5rem; font-weight: 600; text-align: center; }
.lp-toc-list { list-style: none; margin: 0; padding: 0; }
.lp-toc-list li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--lp-border);
  font-size: 0.9rem;
}
.lp-toc-list a { color: var(--lp-text); }
.lp-toc-page { font-size: 0.75rem; color: var(--lp-text-tertiary); font-variant-numeric: tabular-nums; }

.lp-pdf-body { max-width: 48rem; margin: 0 auto; padding: 2rem 2rem 4rem; }
.lp-pdf-section { margin-top: 1.5rem; border: 1px solid var(--lp-border); border-radius: 0.25rem; }
.lp-pdf-section:first-child { margin-top: 0; }
.lp-section-heading {
  margin: 0;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--lp-border);
  font-size: 0.875rem;
  font-weight: 500;
}
.lp-section-body { padding: 1rem; }
.lp-section-body > * + * { margin-top: 0.75rem; }
.lp-section-stub { font-size: 0.8rem; color: var(--lp-text-tertiary); font-style: italic; }

.lp-field { }
.lp-field-label {
  font-size: 0.625rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--lp-text-tertiary);
  margin-bottom: 0.25rem;
}
.lp-field-value { font-size: 0.875rem; }
.lp-text { white-space: pre-wrap; }
.lp-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.lp-empty { font-size: 0.75rem; color: #a3a3a3; }
.lp-link { word-break: break-all; }

.lp-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.lp-table th {
  text-align: left;
  padding: 0.25rem 0.5rem;
  border-bottom: 1px solid var(--lp-border);
  font-size: 0.625rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--lp-text-tertiary);
  font-weight: 500;
}
.lp-table td { padding: 0.25rem 0.5rem; border-bottom: 1px solid #f5f5f5; vertical-align: top; }
.lp-table tr:last-child td { border-bottom: 0; }

.lp-contacts > * + * { margin-top: 0.5rem; }
.lp-contact-name { font-weight: 500; }
.lp-contact-meta { font-size: 0.75rem; color: var(--lp-text-tertiary); }
.lp-contact-link { font-size: 0.75rem; color: var(--lp-orange); }
.lp-contact-notes { font-size: 0.75rem; color: var(--lp-text-tertiary); white-space: pre-wrap; }

.lp-checklist { list-style: none; margin: 0; padding: 0; font-size: 0.875rem; }
.lp-checklist li { display: flex; align-items: center; gap: 0.5rem; margin: 0.125rem 0; }
.lp-checkbox {
  display: inline-block;
  width: 0.75rem; height: 0.75rem;
  border: 1px solid #d4d4d4;
  border-radius: 0.125rem;
  background: #ffffff;
}
.lp-checkbox.lp-checkbox-on { border-color: var(--lp-orange); background: var(--lp-orange); }

.lp-asset img { max-height: 18rem; border: 1px solid var(--lp-border); border-radius: 0.25rem; }

.lp-prose h2 { font-size: 1.15rem; font-weight: 600; margin: 1rem 0 0.4rem; }
.lp-prose h3 { font-size: 1rem; font-weight: 600; margin: 0.8rem 0 0.3rem; }
.lp-prose p { margin: 0.4rem 0; }
.lp-prose ul { margin: 0.4rem 0; padding-left: 1.2rem; }
.lp-prose li { margin: 0.1rem 0; }
.lp-var {
  padding: 0 0.15em;
  border-radius: 0.2em;
  background: color-mix(in srgb, var(--lp-orange) 8%, transparent);
}

.lp-summary { width: 100%; border-collapse: collapse; }
.lp-summary td { padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--lp-border); vertical-align: top; }
.lp-summary-subject {
  width: 28%;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lp-text-secondary);
  font-weight: 600;
}
.lp-summary-body { font-size: 0.9rem; }
`;

const PRINT_CSS = `
@page { size: A4; margin: 18mm 16mm 22mm 16mm; }

/* Force a fresh page at each major boundary. */
.lp-pdf-cover { break-after: page; }
.lp-pdf-toc { break-after: page; }
.lp-pdf-section { break-before: page; }
.lp-pdf-section:first-child { break-before: avoid; }

/* Avoid orphan headings hanging at page bottom. */
h2, h3 { break-after: avoid; }

/* Footer — fixed at the bottom of every printed page. */
.lp-pdf-footer {
  position: fixed;
  bottom: 6mm;
  left: 16mm;
  right: 16mm;
  font-size: 9px;
  color: var(--lp-text-tertiary);
  text-align: center;
  font-variant-numeric: tabular-nums;
}

/* Used by /r/[token]?print=1 to hide web-only chrome when the
   user prints from a browser. The API render doesn't include
   any such chrome so this is a no-op there. */
.print-hide { display: none !important; }
`;

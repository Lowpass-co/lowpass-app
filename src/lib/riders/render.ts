/* ============================================
   LOWPASS — Riders: what a rider reads as — pure

   ONE model (`docModel`) turns a snapshot's blocks into what is printed: the
   request lines with their counts worked out, the summary built, the dates
   applied for a show (or tagged, on the tour view), the attachments named.
   Two thin renderers read it — React on screen (RiderDocView) and HTML here
   for the PDF — with ONE stylesheet (`RIDER_DOC_CSS`, class prefix `rd-`),
   so the page a promoter reads and the PDF they download say the same thing.
   ============================================ */

import { dateTag, fmtDay, fmtQty, inForce, providerShort, requestQty } from './blocks';
import { embedFor, embedName, othersFor, svgDataUri } from './embeds';
import { esc, proseHtml } from './prose';
import { buildSummary, changeLine, type SummaryGroup } from './summary';
import type {
  Contact,
  EmbedInputList,
  EmbedStagePlot,
  LineState,
  ProseDoc,
  Provider,
  ResolvedAttachment,
  RiderChange,
  RiderEmbeds,
  RiderKind,
  SnapBlock,
  SnapDoc,
} from './types';

export interface LineStateView {
  state: LineState;
  note: string | null;
}

export type DocItem =
  | { t: 'heading'; id: string; text: string; level: 1 | 2; tag: string | null }
  | { t: 'prose'; id: string; doc: ProseDoc; tag: string | null }
  | {
      t: 'request';
      id: string;
      qty: string | null;
      item: string;
      provider: string | null;
      providerId: Provider | null;
      alternatives: string;
      note: string;
      optional: boolean;
      perPerson: string | null;
      tag: string | null;
      state: LineStateView | null;
      /** The exact item: a shop / product page, and a photo (storage path). */
      link: string | null;
      photo: string | null;
    }
  | { t: 'table'; id: string; columns: string[]; rows: string[][]; tag: string | null }
  | { t: 'contacts'; id: string; people: Contact[]; tag: string | null }
  | { t: 'summary'; id: string; title: string; party: string | null; groups: SummaryGroup[]; tag: string | null }
  | { t: 'files'; id: string; items: ResolvedAttachment[]; tag: string | null }
  /** The input list / stage plot this show (or the tour) gets; null = none on
   *  the tour yet. `others` (whole-tour view only): shows with their own. */
  | { t: 'inputs'; id: string; list: EmbedInputList | null; outputs: boolean; others: string[]; tag: string | null }
  | { t: 'plot'; id: string; plot: EmbedStagePlot | null; others: string[]; tag: string | null }
  | { t: 'break'; id: string };

export interface DocModel {
  kind: RiderKind;
  title: string;
  items: DocItem[];
}

export interface ModelContext {
  /** A show's date: only what applies that day, no tags. null = every date, tagged. */
  date: string | null;
  party: number | null;
  /** Both documents (the summary reads requests from either). */
  docs: readonly SnapDoc[];
  attachments: readonly ResolvedAttachment[];
  /** Per-show settled lines, by block id. */
  states?: Record<string, LineStateView>;
  /** The input lists / stage plots (live in the editor, frozen in a version). */
  embeds?: RiderEmbeds | null;
  /** The show being read — picks its own input list / plot. null = the tour. */
  routingId?: string | null;
}

function attachmentsFor(items: { kind: string; id?: string; label?: string }[], resolved: readonly ResolvedAttachment[]): ResolvedAttachment[] {
  return items.map((it) => {
    if (it.kind === 'file') return resolved.find((r) => r.kind === 'file' && r.id === it.id) ?? { kind: 'file', id: null, label: it.label ?? 'File' };
    return resolved.find((r) => r.kind === it.kind) ?? { kind: it.kind as 'channel_list' | 'stage_plot', id: null, label: it.kind === 'channel_list' ? 'Input list' : 'Stage plot' };
  });
}

export function docModel(doc: SnapDoc, ctx: ModelContext): DocModel {
  const items: DocItem[] = [];
  const tagOf = (b: SnapBlock) => (ctx.date ? null : dateTag(b.from, b.until));
  for (const b of doc.blocks) {
    if (!inForce(b, ctx.date)) continue;
    const tag = tagOf(b);
    switch (b.kind) {
      case 'heading':
        if (b.content.text.trim()) items.push({ t: 'heading', id: b.id, text: b.content.text.trim(), level: b.content.level, tag });
        break;
      case 'text':
        items.push({ t: 'prose', id: b.id, doc: b.content.doc, tag });
        break;
      case 'request': {
        const c = b.content;
        if (!c.item.trim()) break;
        const q = requestQty(c, ctx.party);
        items.push({
          t: 'request',
          id: b.id,
          qty: q === null ? null : fmtQty(q),
          item: c.item.trim(),
          provider: providerShort(c.provider),
          providerId: c.provider,
          alternatives: c.alternatives.trim(),
          note: c.note.trim(),
          optional: c.optional,
          perPerson: c.perPerson && c.qty !== null ? `${fmtQty(c.qty)} per person${ctx.party ? ` × ${ctx.party}` : ''}` : null,
          tag,
          state: ctx.states?.[b.id] ?? null,
          link: c.link || null,
          photo: c.photo,
        });
        break;
      }
      case 'table':
        if (b.content.rows.some((r) => r.some((c) => c.trim())) || b.content.columns.some((c) => c.trim())) {
          items.push({ t: 'table', id: b.id, columns: b.content.columns, rows: b.content.rows.filter((r) => r.some((c) => c.trim())), tag });
        }
        break;
      case 'contacts': {
        const people = b.content.people.filter((p) => p.name.trim() || p.email.trim() || p.phone.trim());
        if (people.length) items.push({ t: 'contacts', id: b.id, people, tag });
        break;
      }
      case 'summary':
        items.push({
          t: 'summary',
          id: b.id,
          title: b.content.title,
          party: ctx.party ? `Touring party of ${ctx.party}` : null,
          groups: buildSummary(ctx.docs, ctx.party, ctx.date),
          tag,
        });
        break;
      case 'files':
        if (b.content.items.length) items.push({ t: 'files', id: b.id, items: attachmentsFor(b.content.items, ctx.attachments), tag });
        break;
      case 'input_list':
        items.push({
          t: 'inputs',
          id: b.id,
          list: embedFor(ctx.embeds, 'inputList', ctx.routingId ?? null),
          outputs: b.content.outputs,
          others: ctx.routingId ? [] : othersFor(ctx.embeds, 'inputList'),
          tag,
        });
        break;
      case 'stage_plot':
        items.push({ t: 'plot', id: b.id, plot: embedFor(ctx.embeds, 'stagePlot', ctx.routingId ?? null), others: ctx.routingId ? [] : othersFor(ctx.embeds, 'stagePlot'), tag });
        break;
      case 'break':
        items.push({ t: 'break', id: b.id });
        break;
    }
  }
  return { kind: doc.kind, title: doc.title, items };
}

/** Consecutive request lines print as one list. */
export type DocRun = { t: 'requests'; items: Extract<DocItem, { t: 'request' }>[] } | { t: 'one'; item: Exclude<DocItem, { t: 'request' }> };
export function runsOf(items: readonly DocItem[]): DocRun[] {
  const out: DocRun[] = [];
  for (const it of items) {
    if (it.t === 'request') {
      const last = out[out.length - 1];
      if (last?.t === 'requests') last.items.push(it);
      else out.push({ t: 'requests', items: [it] });
    } else out.push({ t: 'one', item: it });
  }
  return out;
}

export const STATE_LABEL: Record<LineState, string> = { confirmed: 'Confirmed', substitute: 'Substitute', cut: 'Cut' };
export function stateText(s: LineStateView): string {
  return s.note && s.state !== 'cut' ? `${STATE_LABEL[s.state]}: ${s.note}` : STATE_LABEL[s.state];
}

/* ---------- the stylesheet (screen + PDF) ---------- */

export const RIDER_DOC_CSS = `
.rd-doc { color: var(--lp-text); font-size: var(--lp-text-base); line-height: 1.55; }
.rd-head { display: flex; flex-direction: column; gap: var(--lp-space-1); padding-bottom: var(--lp-space-4); margin-bottom: var(--lp-space-6); border-bottom: 2px solid var(--lp-orange); }
.rd-artist { font-size: var(--lp-text-xs); font-weight: var(--lp-weight-bold); letter-spacing: 0.08em; text-transform: uppercase; color: var(--lp-text-secondary); }
.rd-title { font-size: var(--lp-text-2xl); font-weight: var(--lp-weight-bold); line-height: 1.2; letter-spacing: -0.01em; margin: 0; }
.rd-meta { font-size: var(--lp-text-sm); color: var(--lp-text-tertiary); }
.rd-meta b { color: var(--lp-text-secondary); font-weight: var(--lp-weight-semibold); }
.rd-h1 { display: flex; align-items: baseline; gap: var(--lp-space-2); font-size: var(--lp-text-md); font-weight: var(--lp-weight-bold); letter-spacing: 0.06em; text-transform: uppercase; margin: var(--lp-space-8) 0 var(--lp-space-3); padding-bottom: var(--lp-space-1); border-bottom: 1px solid var(--lp-border); break-after: avoid; }
.rd-h2 { display: flex; align-items: baseline; gap: var(--lp-space-2); font-size: var(--lp-text-base); font-weight: var(--lp-weight-semibold); margin: var(--lp-space-5) 0 var(--lp-space-2); break-after: avoid; }
.rd-prose { margin: var(--lp-space-2) 0; }
.rd-prose p { margin: 0 0 var(--lp-space-2); }
.rd-prose ul, .rd-prose ol { margin: 0 0 var(--lp-space-2); padding-left: var(--lp-space-6); }
.rd-prose li > p { margin: 0; }
.rd-prose blockquote { margin: var(--lp-space-2) 0; padding-left: var(--lp-space-3); border-left: 3px solid var(--lp-border); color: var(--lp-text-secondary); }
.rd-prose h3, .rd-prose h4, .rd-prose h5 { font-size: var(--lp-text-base); margin: var(--lp-space-3) 0 var(--lp-space-1); }
.rd-prose a { color: var(--lp-orange); }
.rd-prose hr { border: 0; border-top: 1px solid var(--lp-border); margin: var(--lp-space-4) 0; }
.rd-tag { display: inline-flex; align-items: center; font-size: var(--lp-text-xs); font-weight: var(--lp-weight-semibold); letter-spacing: 0; text-transform: none; padding: 1px var(--lp-space-2); border-radius: var(--lp-radius-full); background: color-mix(in srgb, var(--lp-orange) 12%, transparent); color: var(--lp-orange); white-space: nowrap; }
.rd-reqs { list-style: none; margin: var(--lp-space-2) 0 var(--lp-space-3); padding: 0; border-top: 1px solid var(--lp-border); }
.rd-req { display: grid; grid-template-columns: 3.2em minmax(0, 1fr) auto; column-gap: var(--lp-space-3); align-items: baseline; padding: var(--lp-space-2) 0; border-bottom: 1px solid var(--lp-border); break-inside: avoid; }
.rd-qty { text-align: right; font-variant-numeric: tabular-nums; font-weight: var(--lp-weight-bold); color: var(--lp-text); }
.rd-qty-none { color: var(--lp-text-tertiary); font-weight: var(--lp-weight-regular); }
.rd-item { font-weight: var(--lp-weight-medium); }
.rd-sub { grid-column: 2 / 4; display: flex; flex-wrap: wrap; gap: 0 var(--lp-space-3); font-size: var(--lp-text-sm); color: var(--lp-text-secondary); }
.rd-sub i { color: var(--lp-text-tertiary); font-style: normal; }
.rd-side { display: flex; gap: var(--lp-space-1); justify-content: flex-end; flex-wrap: wrap; }
.rd-who { font-size: var(--lp-text-xs); font-weight: var(--lp-weight-semibold); padding: 1px var(--lp-space-2); border-radius: var(--lp-radius-sm); border: 1px solid var(--lp-border); color: var(--lp-text-secondary); white-space: nowrap; }
.rd-who[data-who="artist"] { border-style: dashed; color: var(--lp-text-tertiary); }
.rd-opt { font-size: var(--lp-text-xs); font-style: italic; color: var(--lp-text-tertiary); white-space: nowrap; }
.rd-state { font-size: var(--lp-text-xs); font-weight: var(--lp-weight-semibold); padding: 1px var(--lp-space-2); border-radius: var(--lp-radius-sm); white-space: nowrap; }
.rd-state[data-state="confirmed"] { background: color-mix(in srgb, var(--color-lp-success) 16%, transparent); color: color-mix(in srgb, var(--color-lp-success) 70%, var(--lp-text)); }
.rd-state[data-state="substitute"] { background: color-mix(in srgb, var(--color-lp-warning) 18%, transparent); color: color-mix(in srgb, var(--color-lp-warning) 60%, var(--lp-text)); }
.rd-state[data-state="cut"] { background: var(--lp-bg-secondary); color: var(--lp-text-tertiary); }
.rd-req[data-state="cut"] .rd-item, .rd-req[data-state="cut"] .rd-qty { text-decoration: line-through; color: var(--lp-text-tertiary); }
.rd-table, .rd-contacts { width: 100%; border-collapse: collapse; margin: var(--lp-space-2) 0 var(--lp-space-4); font-size: var(--lp-text-sm); }
.rd-table th, .rd-contacts th { text-align: left; font-size: var(--lp-text-xs); font-weight: var(--lp-weight-semibold); letter-spacing: 0.04em; text-transform: uppercase; color: var(--lp-text-tertiary); border-bottom: 1px solid var(--lp-border-strong, var(--lp-border)); padding: var(--lp-space-1) var(--lp-space-2); }
.rd-table td, .rd-contacts td { padding: var(--lp-space-2); border-bottom: 1px solid var(--lp-border); vertical-align: top; }
.rd-contacts td:first-child { font-weight: var(--lp-weight-semibold); }
.rd-summary { margin: var(--lp-space-4) 0; padding: var(--lp-space-4) var(--lp-space-5); background: var(--lp-bg-secondary); border-radius: var(--lp-radius-md); break-inside: avoid; }
.rd-summary-title { display: flex; align-items: baseline; justify-content: space-between; gap: var(--lp-space-3); font-size: var(--lp-text-xs); font-weight: var(--lp-weight-bold); letter-spacing: 0.08em; text-transform: uppercase; color: var(--lp-text-secondary); margin-bottom: var(--lp-space-3); }
.rd-summary-party { font-size: var(--lp-text-sm); letter-spacing: 0; text-transform: none; font-weight: var(--lp-weight-semibold); color: var(--lp-text); white-space: nowrap; flex-shrink: 0; }
.rd-summary-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(14em, 1fr)); gap: var(--lp-space-3) var(--lp-space-6); }
.rd-summary-grid h4 { margin: 0 0 var(--lp-space-1); font-size: var(--lp-text-xs); font-weight: var(--lp-weight-bold); color: var(--lp-text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; }
.rd-summary-grid ul { margin: 0; padding: 0; list-style: none; font-size: var(--lp-text-sm); }
.rd-summary-empty { font-size: var(--lp-text-sm); color: var(--lp-text-tertiary); }
.rd-files { list-style: none; margin: var(--lp-space-2) 0 var(--lp-space-4); padding: 0; display: flex; flex-direction: column; gap: var(--lp-space-1); }
.rd-file { display: flex; align-items: center; gap: var(--lp-space-2); font-size: var(--lp-text-sm); }
.rd-file a { color: var(--lp-orange); font-weight: var(--lp-weight-semibold); text-decoration: none; }
.rd-file-missing { color: var(--lp-text-tertiary); }
.rd-break { border: 0; border-top: 1px dashed var(--lp-border); margin: var(--lp-space-6) 0; break-after: page; }
.rd-itembtn { display: inline-flex; align-items: center; gap: var(--lp-space-2); padding: 0; border: 0; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; }
.rd-itembtn span { text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--lp-orange) 55%, transparent); text-underline-offset: 2px; }
.rd-itembtn:hover span { text-decoration-color: var(--lp-orange); }
.rd-thumb { width: 28px; height: 28px; flex-shrink: 0; object-fit: cover; border-radius: var(--lp-radius-sm); border: 1px solid var(--lp-border); vertical-align: middle; background: var(--lp-bg-secondary); }
.rd-item > .rd-thumb { margin-right: var(--lp-space-2); }
.rd-item a { color: inherit; text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--lp-orange) 55%, transparent); text-underline-offset: 2px; }
.rd-embed { margin: var(--lp-space-3) 0 var(--lp-space-5); }
.rd-embed-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--lp-space-3); flex-wrap: wrap; margin-bottom: var(--lp-space-2); break-after: avoid; }
.rd-embed-plot { break-inside: avoid; }
.rd-embed-title { font-size: var(--lp-text-xs); font-weight: var(--lp-weight-bold); letter-spacing: 0.08em; text-transform: uppercase; color: var(--lp-text-secondary); }
.rd-embed-meta { font-size: var(--lp-text-xs); color: var(--lp-text-tertiary); }
.rd-embed-sub { margin: var(--lp-space-3) 0 var(--lp-space-1); font-size: var(--lp-text-xs); font-weight: var(--lp-weight-semibold); color: var(--lp-text-secondary); }
.rd-embed-none { padding: var(--lp-space-3) var(--lp-space-4); border: 1px dashed var(--lp-border); border-radius: var(--lp-radius-md); font-size: var(--lp-text-sm); color: var(--lp-text-tertiary); }
.rd-embed-note { margin-top: var(--lp-space-2); font-size: var(--lp-text-xs); color: var(--lp-text-tertiary); }
.rd-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.rd-inputs { margin: 0; font-size: var(--lp-text-xs); }
.rd-inputs th, .rd-inputs td { padding: var(--lp-space-1) var(--lp-space-2); white-space: nowrap; }
.rd-inputs td:first-child, .rd-inputs th:first-child { text-align: right; font-variant-numeric: tabular-nums; font-weight: var(--lp-weight-bold); width: 2.6em; }
.rd-inputs tbody tr:nth-child(even) td { background: color-mix(in srgb, var(--lp-text) 3%, transparent); }
.rd-plot { margin: 0; padding: var(--lp-space-3); border: 1px solid var(--lp-border); border-radius: var(--lp-radius-md); background: var(--lp-map-paper); break-inside: avoid; }
.rd-plot img { display: block; width: 100%; height: auto; max-height: 70vh; object-fit: contain; }
.rd-changes { margin: var(--lp-space-6) 0 0; padding: var(--lp-space-4) var(--lp-space-5); border: 1px solid var(--lp-border); border-radius: var(--lp-radius-md); font-size: var(--lp-text-sm); break-inside: avoid; }
.rd-changes h3 { margin: 0 0 var(--lp-space-2); font-size: var(--lp-text-xs); letter-spacing: 0.08em; text-transform: uppercase; color: var(--lp-text-secondary); }
.rd-changes ul { margin: 0; padding-left: var(--lp-space-5); }
@media (max-width: 560px) {
  .rd-req { grid-template-columns: 2.6em minmax(0, 1fr); }
  .rd-side { grid-column: 2 / 3; justify-content: flex-start; }
  .rd-sub { grid-column: 2 / 3; }
  .rd-title { font-size: var(--lp-text-xl); }
}
`;

/* ---------- HTML (the PDF) ---------- */

/** Light paper tokens for the standalone PDF (a Chromium page doesn't load
 *  globals.css) — the same approach as lib/export/shell.ts. */
const PDF_TOKENS = `
:root {
  --lp-orange: #FF4500; --lp-text: #14110f; --lp-text-secondary: #46413c; --lp-text-tertiary: #8a837b;
  --lp-border: #e4ded6; --lp-border-strong: #cfc7bc; --lp-bg: #ffffff; --lp-bg-secondary: #f6f3ef;
  --color-lp-success: #16a34a; --color-lp-warning: #d97706; --lp-map-paper: #FFFFFF;
  --lp-text-xs: 8.5pt; --lp-text-sm: 9pt; --lp-text-base: 10pt; --lp-text-md: 10.5pt; --lp-text-lg: 12pt; --lp-text-xl: 15pt; --lp-text-2xl: 19pt;
  --lp-space-1: 2pt; --lp-space-2: 4pt; --lp-space-3: 6pt; --lp-space-4: 9pt; --lp-space-5: 12pt; --lp-space-6: 15pt; --lp-space-8: 20pt;
  --lp-radius-sm: 3px; --lp-radius-md: 5px; --lp-radius-full: 999px;
  --lp-weight-regular: 400; --lp-weight-medium: 500; --lp-weight-semibold: 600; --lp-weight-bold: 700;
}
html, body { margin: 0; background: var(--lp-bg); font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Helvetica, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.rd-pdf-doc + .rd-pdf-doc { break-before: page; }
a { color: inherit; }
`;

export interface RiderHeader {
  artist: string | null;
  /** e.g. "Version 1.7 · 26 Nov 2026" */
  version: string;
  /** e.g. "For The Leadmill, Sheffield — 14 Dec 2026" */
  show: string | null;
}

function tagHtml(tag: string | null): string {
  return tag ? ` <span class="rd-tag">${esc(tag)}</span>` : '';
}

function fileLine(a: ResolvedAttachment, linkUrl: string | null): string {
  const name = esc(a.label);
  if (!a.id) return `<li class="rd-file"><span class="rd-file-missing">${name} — not attached yet</span></li>`;
  return `<li class="rd-file"><span>${name}</span>${linkUrl ? ` <span class="rd-file-missing">— on the live rider: ${esc(linkUrl)}</span>` : ''}</li>`;
}

function tableHtml(t: { columns: string[]; rows: string[][] }, cls: string): string {
  return `<div class="rd-scroll"><table class="rd-table ${cls}"><thead><tr>${t.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${t.rows
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div>`;
}

function embedHead(title: string, meta: string | null): string {
  return `<div class="rd-embed-head"><span class="rd-embed-title">${esc(title)}</span>${meta ? `<span class="rd-embed-meta">${esc(meta)}</span>` : ''}</div>`;
}

function inputsHtml(it: Extract<DocItem, { t: 'inputs' }>): string {
  const note = it.others.length ? `<div class="rd-embed-note">Different for: ${esc(it.others.join(' · '))}</div>` : '';
  if (!it.list) return `<section class="rd-embed">${embedHead('Input list', null)}<div class="rd-embed-none">The input list will follow.</div>${note}</section>`;
  const l = it.list;
  const outputs = it.outputs && l.outputs && l.outputs.rows.length ? `<div class="rd-embed-sub">Outputs (IEM / mixes)</div>${tableHtml(l.outputs, 'rd-inputs')}` : '';
  return `<section class="rd-embed">${embedHead('Input list', `${embedName(l)} · ${inputsCount(l)}`)}${tableHtml(l.inputs, 'rd-inputs')}${outputs}${note}</section>`;
}

function plotHtml(it: Extract<DocItem, { t: 'plot' }>): string {
  const note = it.others.length ? `<div class="rd-embed-note">Different for: ${esc(it.others.join(' · '))}</div>` : '';
  if (!it.plot) return `<section class="rd-embed">${embedHead('Stage plot', null)}<div class="rd-embed-none">The stage plot will follow.</div>${note}</section>`;
  return `<section class="rd-embed rd-embed-plot">${embedHead('Stage plot', embedName(it.plot))}<figure class="rd-plot"><img alt="Stage plot" src="${esc(svgDataUri(it.plot.svg))}"></figure>${note}</section>`;
}

/** "32 inputs · 6 outputs" */
export function inputsCount(l: EmbedInputList): string {
  const i = l.inputs.rows.length;
  const o = l.outputs?.rows.length ?? 0;
  return `${i} ${i === 1 ? 'input' : 'inputs'}${o ? ` · ${o} ${o === 1 ? 'output' : 'outputs'}` : ''}`;
}

export function docBodyHtml(model: DocModel, header: RiderHeader, linkUrl: string | null): string {
  const parts: string[] = [];
  parts.push(`<header class="rd-head">${header.artist ? `<div class="rd-artist">${esc(header.artist)}</div>` : ''}<h1 class="rd-title">${esc(model.title)}</h1><div class="rd-meta"><b>${esc(header.version)}</b>${header.show ? ` · ${esc(header.show)}` : ''}</div></header>`);
  for (const run of runsOf(model.items)) {
    if (run.t === 'requests') {
      parts.push(
        `<ul class="rd-reqs">${run.items
          .map((r) => {
            const side = [
              r.state ? `<span class="rd-state" data-state="${r.state.state}">${esc(stateText(r.state))}</span>` : '',
              r.provider ? `<span class="rd-who" data-who="${r.providerId}">${esc(r.provider)}</span>` : '',
              r.optional ? '<span class="rd-opt">If possible</span>' : '',
              r.tag ? `<span class="rd-tag">${esc(r.tag)}</span>` : '',
            ].join('');
            const sub = [
              r.alternatives ? `<span><i>Or</i> ${esc(r.alternatives)}</span>` : '',
              r.perPerson ? `<span>${esc(r.perPerson)}</span>` : '',
              r.note ? `<span>${esc(r.note)}</span>` : '',
            ].join('');
            const item = r.link ? `<a href="${esc(r.link)}">${esc(r.item)}</a>` : esc(r.item);
            return `<li class="rd-req"${r.state ? ` data-state="${r.state.state}"` : ''}><span class="rd-qty${r.qty ? '' : ' rd-qty-none'}">${r.qty ? esc(r.qty) : '—'}</span><span class="rd-item">${item}</span><span class="rd-side">${side}</span>${sub ? `<span class="rd-sub">${sub}</span>` : ''}</li>`;
          })
          .join('')}</ul>`,
      );
      continue;
    }
    const it = run.item;
    switch (it.t) {
      case 'heading':
        parts.push(`<h2 class="${it.level === 1 ? 'rd-h1' : 'rd-h2'}">${esc(it.text)}${tagHtml(it.tag)}</h2>`);
        break;
      case 'prose':
        parts.push(`<div class="rd-prose">${it.tag ? `<p>${tagHtml(it.tag)}</p>` : ''}${proseHtml(it.doc)}</div>`);
        break;
      case 'table':
        parts.push(
          `<table class="rd-table">${it.columns.some((c) => c.trim()) ? `<thead><tr>${it.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>` : ''}<tbody>${it.rows
            .map((r) => `<tr>${r.map((c) => `<td>${esc(c).replace(/\n/g, '<br>')}</td>`).join('')}</tr>`)
            .join('')}</tbody></table>`,
        );
        break;
      case 'contacts':
        parts.push(
          `<table class="rd-contacts"><thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Email</th></tr></thead><tbody>${it.people
            .map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.role)}</td><td>${esc(p.phone)}</td><td>${esc(p.email)}</td></tr>`)
            .join('')}</tbody></table>`,
        );
        break;
      case 'summary':
        parts.push(
          `<section class="rd-summary"><div class="rd-summary-title"><span>${esc(it.title)}</span>${it.party ? `<span class="rd-summary-party">${esc(it.party)}</span>` : ''}</div>${
            it.groups.length
              ? `<div class="rd-summary-grid">${it.groups.map((g) => `<div><h4>${esc(g.heading)}</h4><ul>${g.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>`).join('')}</div>`
              : '<div class="rd-summary-empty">Nothing marked for the summary yet.</div>'
          }</section>`,
        );
        break;
      case 'files':
        parts.push(`<ul class="rd-files">${it.items.map((a) => fileLine(a, linkUrl)).join('')}</ul>`);
        break;
      case 'inputs':
        parts.push(inputsHtml(it));
        break;
      case 'plot':
        parts.push(plotHtml(it));
        break;
      case 'break':
        parts.push('<hr class="rd-break">');
        break;
    }
  }
  return `<article class="rd-doc rd-pdf-doc">${parts.join('')}</article>`;
}

/** The whole PDF document: each rider on its own pages, then what changed. */
export function riderPdfHtml(input: { header: RiderHeader; models: DocModel[]; changes: RiderChange[]; linkUrl: string | null; title: string }): string {
  const changes = input.changes.length
    ? `<section class="rd-changes"><h3>Changes in this version</h3><ul>${input.changes.map((c) => `<li>${esc(changeLine(c))}</li>`).join('')}</ul></section>`
    : '';
  const body = input.models.map((m) => docBodyHtml(m, input.header, input.linkUrl)).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(input.title)}</title><style>${PDF_TOKENS}${RIDER_DOC_CSS}</style></head><body>${body}${changes}</body></html>`;
}

export function versionLine(label: string, publishedAt: string | null): string {
  return publishedAt ? `Version ${label} · ${fmtDay(publishedAt.slice(0, 10), true)}` : `Draft (not published)`;
}

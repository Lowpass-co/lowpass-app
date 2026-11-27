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
  return { kind: doc.kind, title: doc.title, items: dropEmptySections(items) };
}

/** A heading with nothing under it (its contacts not filled in, or — on a
 *  show's copy — every line dated for other shows) says nothing: it isn't
 *  printed, listed in the contents, or shown to the promoter. A section runs
 *  to the next heading of its level or above; page breaks don't count. */
export function dropEmptySections(items: DocItem[]): DocItem[] {
  const keep = items.map(() => true);
  for (let i = 0; i < items.length; i++) {
    const h = items[i];
    if (h.t !== 'heading') continue;
    let filled = false;
    for (let j = i + 1; j < items.length; j++) {
      const it = items[j];
      if (it.t === 'heading' && it.level <= h.level) break;
      if (it.t !== 'heading' && it.t !== 'break') {
        filled = true;
        break;
      }
    }
    if (!filled) keep[i] = false;
  }
  return items.filter((_, i) => keep[i]);
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
.rd-brand { display: flex; align-items: center; gap: var(--lp-space-3); flex-wrap: wrap; }
.rd-logo { display: block; max-height: calc(var(--lp-space-6) * 2.5); max-width: 60%; object-fit: contain; object-position: left center; margin-bottom: var(--lp-space-2); }
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

/** The printed rider's dress (body.rp only — the page keeps RIDER_DOC_CSS). */
export const RIDER_PRINT_CSS = `
body.rp { font-family: 'Inter', -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif; color: var(--lp-text); font-feature-settings: 'cv11', 'ss01'; }
.rp .rd-doc { font-size: 9.6pt; line-height: 1.5; }
.rp a { color: inherit; }

/* cover */
.rp-cover { display: flex; flex-direction: column; align-items: center; text-align: center; padding-top: 4mm; break-after: page; }
.rp-frame + .rp-cover { break-before: page; }
.rp-brand { display: flex; align-items: center; justify-content: center; min-height: 30mm; margin-bottom: 9mm; }
.rp-logo { display: block; max-width: 118mm; max-height: 64mm; object-fit: contain; }
.rp-wordmark { font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 28pt; letter-spacing: 0.16em; text-transform: uppercase; line-height: 1.15; }
.rp-title { margin: 0; font-family: 'Montserrat', sans-serif; font-weight: 500; font-size: 23pt; line-height: 1.15; letter-spacing: -0.01em; }
.rp-tour { margin-top: 2.5mm; font-family: 'Montserrat', sans-serif; font-weight: 400; font-size: 14pt; color: var(--lp-text-secondary); }
.rp-show { margin-top: 4mm; font-size: 10.5pt; font-weight: 600; }
.rp-version { margin-top: 5mm; font-style: italic; font-size: 10.5pt; color: var(--lp-orange); }
.rp-intro { margin-top: 11mm; max-width: 142mm; font-size: 9.6pt; color: var(--lp-text-secondary); }
.rp-intro .rd-prose p { margin: 0 0 2mm; }
.rp-intro .rd-prose ul, .rp-intro .rd-prose ol { text-align: left; display: inline-block; }
.rp-contents { margin-top: 12mm; width: 100%; max-width: 118mm; }
.rp-contents.rp-two { max-width: 164mm; }
.rp-contents-title { font-family: 'Montserrat', sans-serif; font-weight: 500; font-size: 12pt; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 3.5mm; }
.rp-contents ol { list-style: none; margin: 0; padding: 0; text-align: left; }
.rp-contents.rp-two ol { columns: 2; column-gap: 12mm; }
.rp-contents li { padding: 0.9mm 0; font-size: 10.5pt; break-inside: avoid; }
.rp-contents a { display: flex; align-items: baseline; gap: 2mm; text-decoration: none; }
.rp-ct { min-width: 0; }
.rp-dots { flex: 1; min-width: 6mm; border-bottom: 0.7pt dotted var(--lp-border-strong); transform: translateY(-1mm); }
.rp-pg-wait { visibility: hidden; }
.rp-pg { flex: none; min-width: 7mm; text-align: right; font-variant-numeric: tabular-nums; color: var(--lp-orange); font-size: 9.6pt; }
.rp-live { margin-top: 12mm; font-size: 8.5pt; color: var(--lp-text-tertiary); }
.rp-live a { color: var(--lp-text-secondary); }

/* every page after the cover: the logo at its head (a repeating thead) */
.rp-frame { width: 100%; border-collapse: collapse; }
.rp-frame > thead > tr > th, .rp-frame > tbody > tr > td { padding: 0; font-weight: inherit; text-align: left; }
.rp-runhead { display: flex; justify-content: center; align-items: center; height: 15mm; margin-bottom: 5mm; }
.rp-runlogo { display: block; max-height: 15mm; max-width: 58mm; object-fit: contain; }
.rp-runname { font-family: 'Montserrat', sans-serif; font-weight: 600; font-size: 9pt; letter-spacing: 0.2em; text-transform: uppercase; color: var(--lp-text-secondary); }

/* headings: centred capitals */
.rp .rd-h1 { display: block; text-align: center; font-family: 'Montserrat', sans-serif; font-weight: 500; font-size: 14.5pt; letter-spacing: 0.06em; text-transform: uppercase; margin: 9mm 0 3mm; padding: 0; border: 0; }
.rp .rd-doc > .rd-h1:first-child { margin-top: 0; }
.rp .rd-h1 .rd-tag, .rp .rd-h2 .rd-tag { vertical-align: middle; margin-left: 2mm; text-transform: none; letter-spacing: 0; font-family: 'Inter', sans-serif; }
.rp .rd-h2 { display: block; font-family: 'Montserrat', sans-serif; font-weight: 600; font-size: 10.5pt; margin: 5mm 0 1.5mm; }
.rp .rd-prose { margin: 1.5mm 0; }
.rp .rd-prose a { color: var(--lp-orange); }

/* requests: a checklist */
.rp .rd-reqs { border-top: 0; margin: 1.5mm 0 3mm; }
.rp .rd-req { grid-template-columns: 5mm 2.9em minmax(0, 1fr) auto; column-gap: 1.6mm; padding: 1.15mm 0; border-bottom: 0; }
.rp .rd-req::before { content: ''; width: 3mm; height: 3mm; margin-top: 0.75mm; border: 0.8pt solid var(--lp-text-secondary); border-radius: 0.6mm; align-self: start; }
.rp .rd-qty { text-align: left; font-weight: 600; }
.rp .rd-qty::before { content: '('; }
.rp .rd-qty::after { content: ')'; }
.rp .rd-qty-none { display: none; }
.rp .rd-qty-none + .rd-item { grid-column: 2 / 4; }
.rp .rd-item { font-weight: 500; }
.rp .rd-item a { text-decoration-color: color-mix(in srgb, var(--lp-orange) 55%, transparent); }
.rp .rd-sub { grid-column: 3 / 5; font-size: 8.6pt; }
.rp .rd-qty-none ~ .rd-sub { grid-column: 2 / 5; }
.rp .rd-who { border: 0; padding: 0; font-size: 6.8pt; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--lp-text-tertiary); }
.rp .rd-who[data-who="artist"] { color: var(--lp-text-secondary); }
.rp .rd-opt { font-size: 7.6pt; }

/* summary, tables, contacts: hairlines, no fills */
.rp .rd-summary { background: none; border: 0.75pt solid var(--lp-border-strong); border-radius: 1.5mm; padding: 4.5mm 5.5mm; margin: 3mm 0 4mm; }
.rp .rd-summary-title { justify-content: center; gap: 4mm; font-family: 'Montserrat', sans-serif; font-weight: 500; font-size: 11pt; letter-spacing: 0.08em; color: var(--lp-text); margin-bottom: 3.5mm; }
.rp .rd-summary-party { font-family: 'Inter', sans-serif; font-size: 9pt; font-weight: 500; color: var(--lp-text-secondary); }
.rp .rd-summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 3mm 6mm; }
.rp .rd-summary-grid h4 { color: var(--lp-orange); font-size: 7pt; letter-spacing: 0.1em; }
.rp .rd-summary-grid ul { font-size: 8.8pt; line-height: 1.4; }
.rp .rd-table, .rp .rd-contacts { font-size: 9pt; margin: 2mm 0 4mm; }
.rp .rd-table th, .rp .rd-contacts th { color: var(--lp-text-secondary); font-size: 7pt; letter-spacing: 0.08em; border-bottom: 0.75pt solid var(--lp-text-secondary); padding: 1mm 2mm; }
.rp .rd-table td, .rp .rd-contacts td { border-bottom: 0.5pt solid var(--lp-border); padding: 1.4mm 2mm; }
.rp .rd-contacts td:first-child { font-weight: 600; }
.rp .rd-inputs { font-size: 8pt; }
.rp .rd-inputs td, .rp .rd-inputs th { padding: 0.8mm 2mm; }
.rp .rd-inputs tbody tr:nth-child(even) td { background: color-mix(in srgb, var(--lp-text) 3%, transparent); }
.rp .rd-embed-title { font-family: 'Montserrat', sans-serif; font-weight: 600; letter-spacing: 0.1em; color: var(--lp-text); }
.rp .rd-plot { border-radius: 1.5mm; }
.rp .rd-plot img { max-height: 200mm; }
.rp .rd-files { font-size: 9pt; }
.rp .rd-break { border: 0; margin: 0; }

/* what changed */
.rp-changes { margin-top: 10mm; break-inside: avoid; font-size: 9pt; }
.rp-changes ul { margin: 0 auto; max-width: 150mm; padding-left: 5mm; }
.rp-changes li { margin: 0.8mm 0; }
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
a { color: inherit; }
`;

export interface RiderHeader {
  artist: string | null;
  /** The artist's logo, as a same-origin URL (a /logo route — never the
   *  stored URL: an outside host would see the page's token in Referer).
   *  Null → the artist's name heads the document instead. */
  logo?: string | null;
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

/** One document's items as HTML — the same model the page renders. */
function itemsHtml(items: DocItem[], linkUrl: string | null): string {
  const parts: string[] = [];
  for (const run of runsOf(items)) {
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
        parts.push(`<h2 id="h-${esc(it.id)}" class="${it.level === 1 ? 'rd-h1' : 'rd-h2'}">${esc(it.text)}${tagHtml(it.tag)}</h2>`);
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
  return parts.join('');
}

/* ---------- the printed rider (PDF) ----------

   Modelled on Adam's own riders: each document opens on a cover — the
   artist's logo, the title, the tour, the version stamp in the accent, the
   opening statement (prose before the first heading — his "disclaimer") and
   a contents list that links to each section — and every page after carries
   the logo at its head (a repeating <thead>, so the cover stays clean).
   Section headings are centred capitals; request lines read as a checklist
   ("☐ (24) Cans of …"). The footer (page x of y · the stamp) is the PDF
   footer template (server/riders/pdf.ts). Same items as the page — only the
   dress differs, in RIDER_PRINT_CSS, scoped to body.rp. */

export interface RiderPrintInput {
  title: string;
  header: RiderHeader;
  models: DocModel[];
  changes: RiderChange[];
  linkUrl: string | null;
  /** "Satellite Tour USA '26" — under the title on each cover. */
  tourName?: string | null;
  /** The artist's logo as a data URI: the cover, and the head of every page. */
  logo?: string | null;
  /** @font-face rules (Inter + Montserrat) — lib/export/fonts.ts. */
  fontCss?: string;
  /** The page each section starts on, by anchor (`h-<blockId>`) — read back
   *  from a first render (lib/export/render.ts `pageNumbers`). Absent → the
   *  contents prints without numbers, in the same space. */
  pageOf?: Record<string, number> | null;
}

/** A contents page number. Always the same width (an invisible "00" when not
 *  known yet) so pass 1 and pass 2 paginate identically. */
function pageCell(n: number | undefined): string {
  return typeof n === 'number' && n > 0 ? String(n) : '<span class="rp-pg-wait">00</span>';
}

function brandHtml(input: RiderPrintInput, where: 'cover' | 'page'): string {
  const name = input.header.artist;
  if (input.logo) return `<img class="${where === 'cover' ? 'rp-logo' : 'rp-runlogo'}" src="${esc(input.logo)}" alt="${esc(name ?? 'Logo')}">`;
  return name ? `<div class="${where === 'cover' ? 'rp-wordmark' : 'rp-runname'}">${esc(name)}</div>` : '';
}

function printDocHtml(model: DocModel, input: RiderPrintInput, tail: string): string {
  // Prose before the first heading is the document's opening statement: it
  // sits on the cover, under the title.
  let lead = 0;
  while (lead < model.items.length && model.items[lead].t === 'prose') lead++;
  const intro = model.items.slice(0, lead);
  const rest = model.items.slice(lead);
  const sections = rest.filter((it): it is Extract<DocItem, { t: 'heading' }> => it.t === 'heading' && it.level === 1);
  const contents =
    sections.length >= 2
      ? `<nav class="rp-contents${sections.length > 9 ? ' rp-two' : ''}"><div class="rp-contents-title">Contents</div><ol>${sections
          .map((h) => `<li><a href="#h-${esc(h.id)}"><span class="rp-ct">${esc(h.text)}</span><span class="rp-dots"></span><span class="rp-pg">${pageCell(input.pageOf?.[`h-${h.id}`])}</span></a></li>`)
          .join('')}</ol></nav>`
      : '';
  const live = input.linkUrl ? `<div class="rp-live">The live version of this rider: <a href="${esc(input.linkUrl)}">${esc(input.linkUrl.replace(/^https?:\/\//, ''))}</a></div>` : '';
  const cover = `<section class="rp-cover"><div class="rp-brand">${brandHtml(input, 'cover')}</div><h1 class="rp-title">${esc(model.title)}</h1>${
    input.tourName ? `<div class="rp-tour">${esc(input.tourName)}</div>` : ''
  }${input.header.show ? `<div class="rp-show">${esc(input.header.show)}</div>` : ''}<div class="rp-version">${esc(input.header.version)}</div>${
    intro.length ? `<div class="rp-intro rd-doc">${itemsHtml(intro, input.linkUrl)}</div>` : ''
  }${contents}${live}</section>`;
  const run = brandHtml(input, 'page');
  return `${cover}<table class="rp-frame"><thead><tr><th>${run ? `<div class="rp-runhead">${run}</div>` : ''}</th></tr></thead><tbody><tr><td><article class="rd-doc">${itemsHtml(rest, input.linkUrl)}</article>${tail}</td></tr></tbody></table>`;
}

/** The whole PDF: each document from its own cover, then what changed. */
export function riderPdfHtml(input: RiderPrintInput): string {
  const changes = input.changes.length
    ? `<section class="rp-changes"><h2 class="rd-h1">Changes in this version</h2><ul>${input.changes.map((c) => `<li>${esc(changeLine(c))}</li>`).join('')}</ul></section>`
    : '';
  const docs = input.models.map((m, i) => printDocHtml(m, input, i === input.models.length - 1 ? changes : ''));
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(input.title)}</title><style>${input.fontCss ?? ''}${PDF_TOKENS}${RIDER_DOC_CSS}${RIDER_PRINT_CSS}</style></head><body class="rp">${docs.length ? docs.join('') : changes}</body></html>`;
}

/** Lowpass's own mark on a rider: small, never the artist's place (Adam:
 *  "keep that small and subtle"). The PDF footer and the promoter page. */
export const LOWPASS_CREDIT = 'Generated with Lowpass';

/** The PDF footer (Chromium's footer template — inline styles only, no page
 *  CSS or variables reach it, so the colours are the PDF_TOKENS values):
 *  "Page 2 of 6" left, the version stamp right in the accent, as on Adam's
 *  riders; the Lowpass credit small and grey between them. */
export function riderFooterTemplate(stamp: string): string {
  return `<div style="width:100%;padding:0 18mm;display:flex;justify-content:space-between;align-items:center;font-family:Inter,Helvetica,Arial,sans-serif;font-size:7.5px;color:#6b645d;"><span style="flex:1;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></span><span style="flex:none;font-size:6.5px;letter-spacing:0.04em;color:#8a837b;">${LOWPASS_CREDIT}</span><span style="flex:1;text-align:right;color:#FF4500;font-style:italic;">${esc(stamp)}</span></div>`;
}

export function versionLine(label: string, publishedAt: string | null): string {
  return publishedAt ? `Version ${label} · ${fmtDay(publishedAt.slice(0, 10), true)}` : `Draft (not published)`;
}

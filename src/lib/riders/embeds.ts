/* ============================================
   LOWPASS — Riders: the input list + stage plot inside the rider — pure

   The channel list and the stage plot are their own tools; the tech rider
   SHOWS them, through two blocks (input_list, stage_plot). Which document a
   rider shows follows the tools' own rule — a show's attached document, else
   the tour's (lib/rider-packs/attachments.ts) — and the server freezes the
   lot into every published version (`RiderEmbeds`), so a version keeps the
   input list it was published with.

   Here: the gate for a stored copy (`parseEmbeds`), keeping only what the
   documents use (`embedsInUse`), picking the copy for a show (`embedFor`),
   and what changed between two versions (`diffEmbeds`).
   ============================================ */

import type {
  EmbedInputList,
  EmbedShowPick,
  EmbedStagePlot,
  EmbedTable,
  RiderChange,
  RiderEmbeds,
  SnapDoc,
} from './types';

export type EmbedKind = 'inputList' | 'stagePlot';

export function emptyEmbeds(): RiderEmbeds {
  return { inputLists: {}, stagePlots: {}, tour: { inputList: null, stagePlot: null }, shows: {} };
}

/* ---------- the gate ---------- */

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
const idOk = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64;
const MAX_SVG = 3_000_000;

function parseTable(raw: unknown): EmbedTable | null {
  const r = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null;
  if (!r || !Array.isArray(r.columns)) return null;
  const columns = r.columns.slice(0, 24).map((c) => str(c, 60));
  if (!columns.length) return null;
  const rows = (Array.isArray(r.rows) ? r.rows : []).slice(0, 400).map((row) => columns.map((_, i) => str(Array.isArray(row) ? row[i] : '', 300)));
  return { columns, rows };
}

function parseInputList(raw: unknown): EmbedInputList | null {
  const r = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null;
  if (!r || !idOk(r.docId)) return null;
  const inputs = parseTable(r.inputs);
  if (!inputs) return null;
  return {
    docId: r.docId,
    title: str(r.title, 200) || 'Input list',
    version: typeof r.version === 'string' && r.version.trim() ? r.version.slice(0, 120) : null,
    inputs,
    outputs: parseTable(r.outputs),
  };
}

function parseStagePlot(raw: unknown): EmbedStagePlot | null {
  const r = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null;
  if (!r || !idOk(r.docId) || typeof r.svg !== 'string') return null;
  const svg = r.svg.trim();
  if (!svg.startsWith('<svg') || svg.length > MAX_SVG) return null;
  return {
    docId: r.docId,
    title: str(r.title, 200) || 'Stage plot',
    version: typeof r.version === 'string' && r.version.trim() ? r.version.slice(0, 120) : null,
    svg,
  };
}

/** Object entries in key order — a stored copy comes back from JSONB with its
 *  keys reordered, so nothing may depend on insertion order. */
const sortedEntries = <T>(o: Record<string, T>): [string, T][] => Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

/** A stored copy back through the gate; anything off-shape is dropped. Maps
 *  come out in key order and every entry in one field order, so two copies
 *  of the same thing compare (and stringify) equal wherever they came from. */
export function parseEmbeds(raw: unknown): RiderEmbeds {
  const out = emptyEmbeds();
  const r = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null;
  if (!r) return out;
  const lists = (r.inputLists && typeof r.inputLists === 'object' ? r.inputLists : {}) as Record<string, unknown>;
  const plots = (r.stagePlots && typeof r.stagePlots === 'object' ? r.stagePlots : {}) as Record<string, unknown>;
  for (const [, v] of sortedEntries(lists).slice(0, 20)) {
    const d = parseInputList(v);
    if (d) out.inputLists[d.docId] = d;
  }
  for (const [, v] of sortedEntries(plots).slice(0, 20)) {
    const d = parseStagePlot(v);
    if (d) out.stagePlots[d.docId] = d;
  }
  const tour = (r.tour && typeof r.tour === 'object' ? r.tour : {}) as Record<string, unknown>;
  out.tour.inputList = idOk(tour.inputList) && out.inputLists[tour.inputList] ? tour.inputList : null;
  out.tour.stagePlot = idOk(tour.stagePlot) && out.stagePlots[tour.stagePlot] ? tour.stagePlot : null;
  const shows = (r.shows && typeof r.shows === 'object' ? r.shows : {}) as Record<string, unknown>;
  for (const [routingId, v] of sortedEntries(shows).slice(0, 500)) {
    const x = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    const pick: EmbedShowPick = { label: str(x.label, 120) || 'A show' };
    if (idOk(x.inputList) && out.inputLists[x.inputList]) pick.inputList = x.inputList;
    if (idOk(x.stagePlot) && out.stagePlots[x.stagePlot]) pick.stagePlot = x.stagePlot;
    if ((pick.inputList || pick.stagePlot) && idOk(routingId)) out.shows[routingId] = pick;
  }
  return out;
}

/* ---------- what the documents use ---------- */

export function usesEmbed(docs: readonly SnapDoc[], kind: EmbedKind): boolean {
  const block = kind === 'inputList' ? 'input_list' : 'stage_plot';
  return docs.some((d) => d.blocks.some((b) => b.kind === block));
}

/** Only the copies the documents actually show (a rider with no Stage plot
 *  block carries no plot, and a plot change isn't a rider change). */
export function embedsInUse(docs: readonly SnapDoc[], e: RiderEmbeds | null | undefined): RiderEmbeds {
  return pickEmbeds(e, { inputList: usesEmbed(docs, 'inputList'), stagePlot: usesEmbed(docs, 'stagePlot') });
}

/** `embedsInUse` by flags. Every kept copy goes back through the gate, so a
 *  fresh copy (the server's) and a stored one (a version's) are the same
 *  shape — same caps, same field order, maps in key order. */
export function pickEmbeds(e: RiderEmbeds | null | undefined, use: { inputList: boolean; stagePlot: boolean }): RiderEmbeds {
  if (!e || (!use.inputList && !use.stagePlot)) return emptyEmbeds();
  const lists: Record<string, unknown> = {};
  const plots: Record<string, unknown> = {};
  const keep = (kind: EmbedKind, id: string | null | undefined) => {
    if (!id) return;
    if (kind === 'inputList' && e.inputLists[id]) lists[id] = e.inputLists[id];
    if (kind === 'stagePlot' && e.stagePlots[id]) plots[id] = e.stagePlots[id];
  };
  const shows: Record<string, EmbedShowPick> = {};
  if (use.inputList) keep('inputList', e.tour.inputList);
  if (use.stagePlot) keep('stagePlot', e.tour.stagePlot);
  for (const [routingId, p] of Object.entries(e.shows)) {
    const pick: EmbedShowPick = { label: p.label };
    if (use.inputList && p.inputList) {
      pick.inputList = p.inputList;
      keep('inputList', p.inputList);
    }
    if (use.stagePlot && p.stagePlot) {
      pick.stagePlot = p.stagePlot;
      keep('stagePlot', p.stagePlot);
    }
    if (pick.inputList || pick.stagePlot) shows[routingId] = pick;
  }
  return parseEmbeds({
    inputLists: lists,
    stagePlots: plots,
    tour: { inputList: use.inputList ? e.tour.inputList : null, stagePlot: use.stagePlot ? e.tour.stagePlot : null },
    shows,
  });
}

/* ---------- the same? ---------- */

function sameTable(a: EmbedTable | null, b: EmbedTable | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.columns.length !== b.columns.length || a.rows.length !== b.rows.length) return false;
  if (a.columns.some((c, i) => c !== b.columns[i])) return false;
  return a.rows.every((r, i) => r.length === b.rows[i].length && r.every((x, j) => x === b.rows[i][j]));
}

export function sameInputList(a: EmbedInputList | null, b: EmbedInputList | null): boolean {
  if (a === b) return true;
  return !!a && !!b && a.docId === b.docId && a.title === b.title && a.version === b.version && sameTable(a.inputs, b.inputs) && sameTable(a.outputs, b.outputs);
}

export function samePlot(a: EmbedStagePlot | null, b: EmbedStagePlot | null): boolean {
  if (a === b) return true;
  return !!a && !!b && a.docId === b.docId && a.title === b.title && a.version === b.version && a.svg === b.svg;
}

/** Two copies show the same things — key order never matters, and nothing
 *  big is stringified (a plot can be megabytes of SVG). */
export function sameEmbeds(a: RiderEmbeds | null | undefined, b: RiderEmbeds | null | undefined): boolean {
  const x = a ?? emptyEmbeds();
  const y = b ?? emptyEmbeds();
  if (x.tour.inputList !== y.tour.inputList || x.tour.stagePlot !== y.tour.stagePlot) return false;
  const sameKeys = (p: object, q: object) => {
    const kp = Object.keys(p).sort();
    const kq = Object.keys(q).sort();
    return kp.length === kq.length && kp.every((k, i) => k === kq[i]);
  };
  if (!sameKeys(x.inputLists, y.inputLists) || !sameKeys(x.stagePlots, y.stagePlots) || !sameKeys(x.shows, y.shows)) return false;
  for (const id of Object.keys(x.inputLists)) if (!sameInputList(x.inputLists[id], y.inputLists[id])) return false;
  for (const id of Object.keys(x.stagePlots)) if (!samePlot(x.stagePlots[id], y.stagePlots[id])) return false;
  for (const [id, p] of Object.entries(x.shows)) {
    const q = y.shows[id];
    if (p.label !== q.label || (p.inputList ?? null) !== (q.inputList ?? null) || (p.stagePlot ?? null) !== (q.stagePlot ?? null)) return false;
  }
  return true;
}

/* ---------- reading one ---------- */

export function embedFor(e: RiderEmbeds | null | undefined, kind: 'inputList', routingId: string | null): EmbedInputList | null;
export function embedFor(e: RiderEmbeds | null | undefined, kind: 'stagePlot', routingId: string | null): EmbedStagePlot | null;
export function embedFor(e: RiderEmbeds | null | undefined, kind: EmbedKind, routingId: string | null): EmbedInputList | EmbedStagePlot | null {
  if (!e) return null;
  const id = (routingId ? e.shows[routingId]?.[kind] : undefined) ?? e.tour[kind];
  if (!id) return null;
  return kind === 'inputList' ? e.inputLists[id] ?? null : e.stagePlots[id] ?? null;
}

export function embedName(d: { title: string; version: string | null }): string {
  return d.version ? `${d.title} (${d.version})` : d.title;
}

/** The whole-tour view: shows that get a different document — "14 Dec ·
 *  Barrowland: Festival list". */
export function othersFor(e: RiderEmbeds | null | undefined, kind: EmbedKind): string[] {
  if (!e) return [];
  const out: string[] = [];
  for (const p of Object.values(e.shows)) {
    const id = p[kind];
    if (!id || id === e.tour[kind]) continue;
    const d = kind === 'inputList' ? e.inputLists[id] : e.stagePlots[id];
    if (d) out.push(`${p.label}: ${embedName(d)}`);
  }
  return out;
}

/** An SVG as an <img> source. ONLY ever used as an image: an image can't run
 *  script, and custom stage-plot icons are uploaded SVG. */
export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/* ---------- what changed ---------- */

const MAX_CHANNEL_LINES = 12;

const chLabel = (row: string[]): string => {
  const n = (row[0] ?? '').trim();
  const name = (row[1] ?? '').trim();
  return `${n ? `Ch ${n}` : 'A channel'}${name && name !== '—' ? ` ${name}` : ''}`;
};

/** Input rows matched by channel number (the first column — the server
 *  always prints it first). */
function diffInputs(a: EmbedTable, b: EmbedTable): RiderChange[] {
  const base = { doc: 'tech' as const, section: 'Input list', blockId: null, embed: 'inputList' as const };
  const before = new Map(a.rows.map((r) => [r[0] ?? '', r]));
  const after = new Map(b.rows.map((r) => [r[0] ?? '', r]));
  const out: RiderChange[] = [];
  for (const [key, row] of after) {
    const old = before.get(key);
    if (!old) {
      out.push({ ...base, type: 'added', what: chLabel(row) });
      continue;
    }
    const cols = b.columns.map((label, i) => ({ label, i })).filter(({ i, label }) => i > 0 && (old[a.columns.indexOf(label)] ?? '') !== (row[i] ?? ''));
    if (!cols.length) continue;
    if (cols.length === 1 && cols[0].i === 1) {
      out.push({ ...base, type: 'changed', what: `Ch ${key}`, before: old[a.columns.indexOf(b.columns[1])] ?? '', after: row[1] ?? '', named: true });
    } else {
      out.push({
        ...base,
        type: 'changed',
        what: chLabel(row),
        before: cols.map(({ label }) => old[a.columns.indexOf(label)] ?? '').join(' · '),
        after: cols.map(({ i }) => row[i] ?? '').join(' · '),
        named: true,
      });
    }
  }
  for (const [key, row] of before) if (!after.has(key)) out.push({ ...base, type: 'removed', what: chLabel(row) });
  if (out.length > MAX_CHANNEL_LINES) {
    const more = out.length - (MAX_CHANNEL_LINES - 1);
    return [...out.slice(0, MAX_CHANNEL_LINES - 1), { ...base, type: 'changed', what: `${more} more channel changes — see the input list` }];
  }
  return out;
}

/** Changes in the embedded documents, for the kinds whose block is in BOTH
 *  versions (a block that only now appears / disappears is its own "Added /
 *  Removed" in the block diff). */
export function diffEmbeds(
  prev: RiderEmbeds | null | undefined,
  next: RiderEmbeds | null | undefined,
  inBoth: { inputList: boolean; stagePlot: boolean },
): RiderChange[] {
  if (!prev || !next) return [];
  const out: RiderChange[] = [];
  // Tour-level changes say which kind (a show with its own document skips
  // them); a show's own document's changes say which show.
  type Scope = { embed: EmbedKind } | { show: string };
  const named = (what: string, before: string, after: string, scope: Scope): RiderChange => ({ doc: 'tech', section: null, type: 'changed', what, before, after, named: true, blockId: null, ...scope });
  const plain = (type: RiderChange['type'], section: string | null, what: string, scope: Scope): RiderChange => ({ doc: 'tech', section, type, what, blockId: null, ...scope });

  if (inBoth.inputList) {
    const a = embedFor(prev, 'inputList', null);
    const b = embedFor(next, 'inputList', null);
    const tour = { embed: 'inputList' as const };
    if (a && b) {
      if (a.docId !== b.docId) out.push(named('Input list', embedName(a), embedName(b), tour));
      out.push(...diffInputs(a.inputs, b.inputs));
      if (!sameTable(a.outputs, b.outputs)) out.push(plain('changed', 'Input list', 'Outputs (IEM / mixes)', tour));
    } else if (b) out.push(plain('added', 'Input list', embedName(b), tour));
    else if (a) out.push(plain('removed', 'Input list', embedName(a), tour));
  }
  if (inBoth.stagePlot) {
    const a = embedFor(prev, 'stagePlot', null);
    const b = embedFor(next, 'stagePlot', null);
    const tour = { embed: 'stagePlot' as const };
    if (a && b) {
      if (a.docId !== b.docId) out.push(named('Stage plot', embedName(a), embedName(b), tour));
      else if (a.svg !== b.svg) out.push(plain('changed', null, 'Stage plot', tour));
    } else if (b) out.push(plain('added', 'Stage plot', embedName(b), tour));
    else if (a) out.push(plain('removed', 'Stage plot', embedName(a), tour));
  }

  // Shows with their own document: which one they get, and whether it changed.
  const showIds = new Set([...Object.keys(prev.shows), ...Object.keys(next.shows)]);
  for (const routingId of showIds) {
    const label = next.shows[routingId]?.label ?? prev.shows[routingId]?.label ?? 'A show';
    for (const kind of ['inputList', 'stagePlot'] as const) {
      if (!inBoth[kind]) continue;
      if (!prev.shows[routingId]?.[kind] && !next.shows[routingId]?.[kind]) continue;
      const what = `${kind === 'inputList' ? 'Input list' : 'Stage plot'} for ${label}`;
      const pair: [EmbedInputList | EmbedStagePlot | null, EmbedInputList | EmbedStagePlot | null] =
        kind === 'inputList' ? [embedFor(prev, 'inputList', routingId), embedFor(next, 'inputList', routingId)] : [embedFor(prev, 'stagePlot', routingId), embedFor(next, 'stagePlot', routingId)];
      const [was, now] = pair;
      if (!was || !now) continue;
      if (was.docId !== now.docId) out.push(named(what, embedName(was), embedName(now), { show: routingId }));
      else if (kind === 'inputList' ? !sameInputList(was as EmbedInputList, now as EmbedInputList) : !samePlot(was as EmbedStagePlot, now as EmbedStagePlot)) out.push(plain('changed', null, what, { show: routingId }));
    }
  }
  return out;
}

/** The copies a show reads, as comparable text (for "which shows changed"). */
export function embedKey(e: RiderEmbeds | null | undefined, routingId: string | null): string {
  if (!e) return '';
  return `${fingerprint(embedFor(e, 'inputList', routingId))}~${fingerprint(embedFor(e, 'stagePlot', routingId))}`;
}

/** A short stand-in for a copy (two 32-bit string hashes + its length),
 *  cached per object: every show sharing the tour's plot shares one object,
 *  so a 60-show publish hashes each document once, not 60 times. */
const PRINTS = new WeakMap<object, string>();
function fingerprint(d: EmbedInputList | EmbedStagePlot | null): string {
  if (!d) return '-';
  const cached = PRINTS.get(d);
  if (cached) return cached;
  const body = 'svg' in d ? d.svg : JSON.stringify([d.inputs, d.outputs]);
  let h1 = 0x811c9dc5;
  let h2 = 5381;
  for (let i = 0; i < body.length; i++) {
    const c = body.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = (Math.imul(h2, 33) + c) | 0;
  }
  const out = `${d.docId}|${d.version ?? ''}|${d.title}|${body.length}|${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`;
  PRINTS.set(d, out);
  return out;
}

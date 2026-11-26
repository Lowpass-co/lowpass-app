/* ============================================
   LOWPASS — Riders: blocks — pure

   `parseContent` is THE gate for block content: the write routes run every
   block through it, the editor reads through it, the snapshot is built from
   it. Strings are trimmed to size, numbers clamped, unknown keys dropped, so
   nothing a client sends can carry more than the renderers know.
   ============================================ */

import { cleanLink, isPhotoPath } from './photos';
import { cleanDoc, emptyDoc, proseText } from './prose';
import {
  BLOCK_KINDS,
  PROVIDERS,
  type Attachment,
  type BlockContentMap,
  type BlockKind,
  type Contact,
  type Provider,
  type RequestContent,
  type RiderBlock,
  type SnapBlock,
} from './types';

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+$/g, '').slice(0, max) : '');
const line = (v: unknown, max: number): string => str(v, max).replace(/[\r\n]+/g, ' ');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
export const isBlockKind = (v: unknown): v is BlockKind => typeof v === 'string' && (BLOCK_KINDS as readonly string[]).includes(v);
export const isIsoDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export function parseQty(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(99_999, Math.round(n * 100) / 100);
}

export function parseContent<K extends BlockKind>(kind: K, raw: unknown): BlockContentMap[K] {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  switch (kind) {
    case 'heading':
      return { text: line(r.text, 200), level: r.level === 2 ? 2 : 1 } as BlockContentMap[K];
    case 'text':
      return { doc: cleanDoc(r.doc) } as BlockContentMap[K];
    case 'request': {
      const provider = PROVIDERS.some((p) => p.id === r.provider) ? (r.provider as Provider) : null;
      const c: RequestContent = {
        qty: parseQty(r.qty),
        item: line(r.item, 300),
        provider,
        alternatives: line(r.alternatives, 300),
        note: str(r.note, 600),
        optional: r.optional === true,
        perPerson: r.perPerson === true,
        summary: r.summary === true,
        link: cleanLink(r.link),
        photo: isPhotoPath(r.photo) ? r.photo : null,
      };
      return c as BlockContentMap[K];
    }
    case 'table': {
      const columns = (Array.isArray(r.columns) ? r.columns : []).slice(0, 8).map((c) => line(c, 60));
      const width = Math.max(1, columns.length || 2);
      const cols = columns.length ? columns : Array.from({ length: width }, () => '');
      const rows = (Array.isArray(r.rows) ? r.rows : [])
        .slice(0, 200)
        .map((row) => Array.from({ length: width }, (_, i) => str(Array.isArray(row) ? row[i] : '', 400)));
      return { columns: cols, rows } as BlockContentMap[K];
    }
    case 'contacts': {
      const people: Contact[] = (Array.isArray(r.people) ? r.people : []).slice(0, 30).map((p) => {
        const x = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
        return {
          name: line(x.name, 120),
          role: line(x.role, 120),
          phone: line(x.phone, 60),
          email: line(x.email, 200),
          personId: isUuid(x.personId) ? x.personId : null,
        };
      });
      return { people } as BlockContentMap[K];
    }
    case 'summary':
      return { title: line(r.title, 120) || 'Advance summary' } as BlockContentMap[K];
    case 'files': {
      const items: Attachment[] = [];
      for (const it of Array.isArray(r.items) ? r.items.slice(0, 20) : []) {
        const x = (it && typeof it === 'object' ? it : {}) as Record<string, unknown>;
        if (x.kind === 'channel_list' || x.kind === 'stage_plot') {
          if (!items.some((i) => i.kind === x.kind)) items.push({ kind: x.kind });
        } else if (x.kind === 'file' && isUuid(x.id) && !items.some((i) => i.kind === 'file' && i.id === x.id)) {
          items.push({ kind: 'file', id: x.id, label: line(x.label, 200) || 'File' });
        }
      }
      return { items } as BlockContentMap[K];
    }
    case 'input_list':
      return { outputs: r.outputs !== false } as BlockContentMap[K];
    case 'stage_plot':
    case 'break':
    default:
      return {} as BlockContentMap[K];
  }
}

export function emptyContent<K extends BlockKind>(kind: K): BlockContentMap[K] {
  if (kind === 'text') return { doc: emptyDoc() } as BlockContentMap[K];
  if (kind === 'table') return { columns: ['', ''], rows: [['', ''], ['', '']] } as BlockContentMap[K];
  // The input list and stage plot are their own blocks now (shown in the
  // document); Attachments is for other files.
  if (kind === 'files') return { items: [] } as unknown as BlockContentMap[K];
  return parseContent(kind, {});
}

/** The dates a block applies to, checked: until ≥ from, both real dates. */
export function parseDates(from: unknown, until: unknown): { from: string | null; until: string | null } {
  const f = isIsoDate(from) ? from : null;
  const u = isIsoDate(until) ? until : null;
  if (f && u && u < f) return { from: u, until: f };
  return { from: f, until: u };
}

/* ---------- reading a request ---------- */

/** The count printed for a request (per person × the party when asked). */
export function requestQty(c: RequestContent, party: number | null): number | null {
  if (c.qty === null) return null;
  if (c.perPerson && party) return Math.round(c.qty * party * 100) / 100;
  return c.qty;
}

export function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

/** "(10) Black hand towels" — the line as promoters read it. */
export function requestLine(c: RequestContent, party: number | null): string {
  const q = requestQty(c, party);
  const item = c.item.trim() || 'Untitled request';
  return q !== null ? `(${fmtQty(q)}) ${item}` : item;
}

export function providerShort(p: Provider | null): string | null {
  return PROVIDERS.find((x) => x.id === p)?.short ?? null;
}

/* ---------- labels (diffs, threads, outline) ---------- */

type LabelBlock = Pick<SnapBlock, 'kind' | 'content'> | Pick<RiderBlock, 'kind' | 'content'>;

export function blockLabel(b: LabelBlock, party: number | null = null): string {
  switch (b.kind) {
    case 'heading':
      return (b.content as BlockContentMap['heading']).text.trim() || 'Untitled section';
    case 'text': {
      const t = proseText((b.content as BlockContentMap['text']).doc).replace(/\s+/g, ' ').trim();
      return t ? (t.length > 90 ? `${t.slice(0, 88).trimEnd()}…` : t) : 'Empty paragraph';
    }
    case 'request':
      return requestLine(b.content as RequestContent, party);
    case 'table': {
      const c = b.content as BlockContentMap['table'];
      const head = c.columns.filter(Boolean).join(' · ');
      return head ? `Table: ${head}` : `Table (${c.rows.length} ${c.rows.length === 1 ? 'row' : 'rows'})`;
    }
    case 'contacts':
      return 'Key contacts';
    case 'summary':
      return (b.content as BlockContentMap['summary']).title;
    case 'files':
      return 'Attachments';
    case 'input_list':
      return 'Input list';
    case 'stage_plot':
      return 'Stage plot';
    case 'break':
      return 'Page break';
    default:
      return 'Block';
  }
}

/* ---------- dates ---------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "14 Dec" (+ year when asked). Pure — no locale, no time zone. */
export function fmtDay(iso: string, withYear = false): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ''}`;
}

/** Does the block apply on this show date? No date = the tour view (all). */
export function inForce(b: { from: string | null; until: string | null }, date: string | null): boolean {
  if (!date) return true;
  if (b.from && date < b.from) return false;
  if (b.until && date > b.until) return false;
  return true;
}

/** "From 14 Dec" · "Until 13 Dec" · "14 Dec only" · "14–20 Dec". */
export function dateTag(from: string | null, until: string | null): string | null {
  if (!from && !until) return null;
  if (from && until) {
    if (from === until) return `${fmtDay(from)} only`;
    const [fy, fm] = from.split('-');
    const [uy, um] = until.split('-');
    if (fy === uy && fm === um) return `${Number(from.slice(8))}–${fmtDay(until)}`;
    return `${fmtDay(from)} – ${fmtDay(until)}`;
  }
  return from ? `From ${fmtDay(from)}` : `Until ${fmtDay(until!)}`;
}

/** The day before an ISO date (a change "from 14 Dec" ends the old line on 13 Dec). */
export function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** A rider_blocks row (REST or Realtime) → a block, through the gate. */
export function blockFromRow(r: Record<string, unknown>): RiderBlock | null {
  if (!isBlockKind(r.kind) || typeof r.id !== 'string') return null;
  const d = parseDates(r.applies_from, r.applies_until);
  return {
    id: r.id,
    riderId: String(r.rider_id),
    kind: r.kind,
    position: String(r.position),
    content: parseContent(r.kind, r.content),
    from: d.from,
    until: d.until,
    version: Number(r.version) || 1,
    updatedBy: (r.updated_by as string | null) ?? null,
    updatedAt: (r.updated_at as string | null) ?? null,
  } as RiderBlock;
}

/** "(8) Guinness cans", "8 x Guinness", "8× Guinness", "Guinness" → a count +
 *  an item. Used to turn pasted lists into request lines. */
export function parseRequestText(line: string): { qty: number | null; item: string } | null {
  const t = line.replace(/^\s*[-•*]\s*/, '').trim();
  if (!t) return null;
  const m = /^\((\d+(?:\.\d+)?)\)\s*(.+)$/.exec(t) ?? /^(\d+(?:\.\d+)?)\s*(?:[x×]\s*)?(?=\D)(.+)$/i.exec(t);
  if (m && m[2].trim()) return { qty: parseQty(m[1]), item: m[2].trim().slice(0, 300) };
  return { qty: null, item: t.slice(0, 300) };
}

/* ============================================
   LOWPASS — AI schedule import: the rules (Oct 2026)

   Adam: "drop a tour book, a routing grid, etc into the app … approve the AI
   decisions and make any changes to the import." v1 imports DAYS & VENUES
   (routing: date, day type, venue, city, country, address, notes).

   The AI only PROPOSES. Everything here is pure (no I/O) and unit-tested:
     • normaliseExtraction — the model's JSON → clean, validated days. Dates
       must be real YYYY-MM-DD; day types map onto the app's vocabulary; two
       entries for one date merge into one day ("show,travel").
     • diffDays — each proposed day against the tour's existing day:
       NEW / CHANGES (field by field, old value kept for "keep existing") /
       SAME. Blank imported values never blank an existing value.
     • toApplyDays — the approved rows → the minimal per-date patch the apply
       route writes. Notes are APPENDED to existing notes, never replaced.
     • rangeToCover — the tour start/end that the approved days need.

   Nothing in the import path ever deletes a day.
   ============================================ */

export const IMPORT_FIELDS = ['day_type', 'venue_name', 'city', 'country', 'address', 'notes'] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export type ImportConfidence = 'high' | 'medium' | 'low';

export interface ImportedDay {
  date: string;
  day_type: string;
  venue_name: string;
  city: string;
  country: string;
  address: string;
  notes: string;
  confidence: ImportConfidence;
  /** Short quote / page ref the model read it from (shown on low confidence). */
  source: string;
}

export interface ImportMeta {
  tourName: string | null;
  artistName: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface ExistingDay {
  date: string;
  day_type?: string | null;
  venue_name?: string | null;
  city?: string | null;
  country?: string | null;
  address?: string | null;
  notes?: string | null;
}

/* ---- day types ---- */

const KNOWN = ['show', 'festival', 'rehearsal', 'press', 'radio', 'tv', 'travel', 'off'] as const;
/** When two types land on one date, the more significant leads (the strip
 *  colours by the first). */
const PRIORITY: Record<string, number> = { show: 0, festival: 1, rehearsal: 2, press: 3, radio: 4, tv: 5, travel: 6, off: 7 };

const SYNONYMS: Array<[RegExp, string]> = [
  [/^(show|gig|concert|performance|headline|support|show ?day|live)$/, 'show'],
  [/^(festival|fest|festival ?show)$/, 'festival'],
  [/^(rehearsals?|prod(uction)? ?(rehearsal|day)?|production|tech ?(day|rehearsal)|programming|load ?in day)$/, 'rehearsal'],
  [/^(press|promo|interviews?|media|press ?day)$/, 'press'],
  [/^(radio|radio ?session)$/, 'radio'],
  [/^(tv|television|tv ?(taping|performance|appearance))$/, 'tv'],
  [/^(travel|travel ?day|drive|drive ?day|fly|flight|fly ?day|bus|overnight|transit|ferry)$/, 'travel'],
  [/^(off|day ?off|dark|rest|rest ?day|free|free ?day|hotel ?day)$/, 'off'],
];

/** One raw label → the app's day type ('' when it can't tell). */
export function normaliseDayType(raw: string | null | undefined): string {
  const parts = String(raw ?? '')
    .toLowerCase()
    .split(/[,/+&]| and /)
    .map((s) => s.replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const out = new Set<string>();
  for (const p of parts) {
    if ((KNOWN as readonly string[]).includes(p)) {
      out.add(p);
      continue;
    }
    const hit = SYNONYMS.find(([re]) => re.test(p));
    if (hit) out.add(hit[1]);
  }
  return [...out].sort((a, b) => (PRIORITY[a] ?? 9) - (PRIORITY[b] ?? 9)).join(',');
}

/* ---- dates ---- */

export function isRealDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const t = Date.parse(`${iso}T12:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === iso;
}

const clip = (v: unknown, max = 300) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const clipNotes = (v: unknown) => String(v ?? '').trim().slice(0, 2000);

/* ---- the model's output → clean days ---- */

export interface NormalisedExtraction {
  meta: ImportMeta;
  days: ImportedDay[];
  /** Human-readable problems: "Skipped 'Sept 31' — not a real date". */
  warnings: string[];
}

function asConfidence(v: unknown): ImportConfidence {
  return v === 'high' || v === 'low' ? v : 'medium';
}

/** Merge two proposals for one date: types combine, the first non-empty
 *  value wins per field, notes join, the lower confidence sticks. */
function mergeDay(a: ImportedDay, b: ImportedDay): ImportedDay {
  const rank: Record<ImportConfidence, number> = { low: 0, medium: 1, high: 2 };
  const notes = [a.notes, b.notes].filter(Boolean);
  return {
    date: a.date,
    day_type: normaliseDayType([a.day_type, b.day_type].filter(Boolean).join(',')),
    venue_name: a.venue_name || b.venue_name,
    city: a.city || b.city,
    country: a.country || b.country,
    address: a.address || b.address,
    notes: [...new Set(notes)].join('\n'),
    confidence: rank[a.confidence] <= rank[b.confidence] ? a.confidence : b.confidence,
    source: [a.source, b.source].filter(Boolean).join(' · ').slice(0, 300),
  };
}

export function normaliseExtraction(raw: unknown): NormalisedExtraction {
  const r = (raw ?? {}) as Record<string, unknown>;
  const warnings: string[] = Array.isArray(r.warnings) ? (r.warnings as unknown[]).map((w) => clip(w, 240)).filter(Boolean) : [];
  const metaRaw = (r.tour ?? r.meta ?? {}) as Record<string, unknown>;
  const dateOrNull = (v: unknown) => {
    const s = clip(v, 10);
    return isRealDate(s) ? s : null;
  };
  const meta: ImportMeta = {
    tourName: clip(metaRaw.name ?? metaRaw.tour_name, 120) || null,
    artistName: clip(metaRaw.artist ?? metaRaw.artist_name, 120) || null,
    startDate: dateOrNull(metaRaw.start_date),
    endDate: dateOrNull(metaRaw.end_date),
  };

  const byDate = new Map<string, ImportedDay>();
  const list = Array.isArray(r.days) ? (r.days as Array<Record<string, unknown>>) : [];
  for (const d of list) {
    const date = clip(d?.date, 10);
    if (!isRealDate(date)) {
      warnings.push(`Skipped an entry with no usable date${d?.date ? ` (“${clip(d.date, 30)}”)` : ''}.`);
      continue;
    }
    const day: ImportedDay = {
      date,
      day_type: normaliseDayType(clip(d.day_type, 60)),
      venue_name: clip(d.venue_name ?? d.venue, 160),
      city: clip(d.city, 120),
      country: clip(d.country, 80),
      address: clip(d.address, 300),
      notes: clipNotes(d.notes),
      confidence: asConfidence(d.confidence),
      source: clip(d.source, 240),
    };
    const prev = byDate.get(date);
    byDate.set(date, prev ? mergeDay(prev, day) : day);
  }
  const days = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (days.length && (!meta.startDate || !meta.endDate)) {
    meta.startDate = meta.startDate ?? days[0].date;
    meta.endDate = meta.endDate ?? days[days.length - 1].date;
  }
  return { meta, days, warnings };
}

/* ---- against the tour's existing days ---- */

export type RowStatus = 'new' | 'changes' | 'same';

export interface FieldChange {
  field: ImportField;
  from: string;
  to: string;
}

export interface ReviewRow {
  day: ImportedDay;
  status: RowStatus;
  /** Only for 'changes': the fields whose value would change. */
  changes: FieldChange[];
  existing: ExistingDay | null;
}

const norm = (v: string | null | undefined) => (v ?? '').replace(/\s+/g, ' ').trim();
const sameText = (a: string, b: string) => norm(a).toLowerCase() === norm(b).toLowerCase();
/** Types compare as sets ("show,travel" == "travel,show"). */
const sameType = (a: string, b: string) =>
  normaliseDayType(a).split(',').filter(Boolean).sort().join(',') === normaliseDayType(b).split(',').filter(Boolean).sort().join(',');

export function diffDays(imported: ImportedDay[], existing: ExistingDay[]): ReviewRow[] {
  const byDate = new Map(existing.map((e) => [e.date.slice(0, 10), e]));
  return imported.map((day) => {
    const ex = byDate.get(day.date) ?? null;
    const hasContent = (e: ExistingDay) =>
      IMPORT_FIELDS.some((f) => norm(e[f] as string | null | undefined) !== '');
    if (!ex || !hasContent(ex)) return { day, status: 'new' as const, changes: [], existing: ex };
    const changes: FieldChange[] = [];
    for (const f of IMPORT_FIELDS) {
      const to = norm(day[f]);
      if (!to) continue; // a blank import never blanks an existing value
      const from = norm(ex[f] as string | null | undefined);
      if (f === 'notes') {
        if (!from.toLowerCase().includes(to.toLowerCase())) changes.push({ field: f, from, to });
        continue;
      }
      const equal = f === 'day_type' ? sameType(from, to) : sameText(from, to);
      if (!equal) changes.push({ field: f, from, to });
    }
    return { day, status: changes.length ? ('changes' as const) : ('same' as const), changes, existing: ex };
  });
}

/* ---- approved rows → what the apply route writes ---- */

export interface ApplyDay {
  date: string;
  fields: Partial<Record<ImportField, string>>;
}

/**
 * @param rows        the review rows the user ticked
 * @param kept        per date, fields the user chose to KEEP as they are
 * The patch carries only fields that change something. Notes append.
 */
export function toApplyDays(rows: ReviewRow[], kept: Record<string, ImportField[]> = {}): ApplyDay[] {
  const out: ApplyDay[] = [];
  for (const row of rows) {
    if (row.status === 'same') continue;
    const keep = new Set(kept[row.day.date] ?? []);
    const fields: Partial<Record<ImportField, string>> = {};
    for (const f of IMPORT_FIELDS) {
      if (keep.has(f)) continue;
      const to = norm(row.day[f]);
      if (!to) continue;
      if (row.status === 'changes' && !row.changes.some((c) => c.field === f)) continue;
      if (f === 'notes') {
        const from = norm(row.existing?.notes ?? '');
        fields.notes = from ? `${row.existing?.notes?.trim()}\n${row.day.notes.trim()}` : row.day.notes.trim();
      } else if (f === 'day_type') {
        fields.day_type = normaliseDayType(to);
      } else {
        fields[f] = to;
      }
    }
    if (Object.keys(fields).length) out.push({ date: row.day.date, fields });
  }
  return out;
}

/** The tour window the approved days need (null side = no change needed). */
export function rangeToCover(
  dates: string[],
  tourStart: string | null,
  tourEnd: string | null,
): { start: string | null; end: string | null } {
  if (!dates.length) return { start: null, end: null };
  const sorted = [...dates].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return {
    start: !tourStart || first < tourStart.slice(0, 10) ? first : null,
    end: !tourEnd || last > tourEnd.slice(0, 10) ? last : null,
  };
}

/* ---- long documents ---- */

/** Split text into chunks of at most `max` chars on line boundaries, so a
 *  long tour book can be read by several calls in parallel. */
export function chunkText(text: string, max = 60_000): string[] {
  if (text.length <= max) return [text];
  const lines = text.split('\n');
  const chunks: string[] = [];
  let cur = '';
  for (const line of lines) {
    if (cur.length + line.length + 1 > max && cur) {
      chunks.push(cur);
      cur = '';
    }
    cur += (cur ? '\n' : '') + (line.length > max ? line.slice(0, max) : line);
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/** Merge several chunk extractions into one (days merge by date). */
export function mergeExtractions(parts: NormalisedExtraction[]): NormalisedExtraction {
  const meta: ImportMeta = { tourName: null, artistName: null, startDate: null, endDate: null };
  const warnings: string[] = [];
  const byDate = new Map<string, ImportedDay>();
  for (const p of parts) {
    meta.tourName = meta.tourName ?? p.meta.tourName;
    meta.artistName = meta.artistName ?? p.meta.artistName;
    if (p.meta.startDate && (!meta.startDate || p.meta.startDate < meta.startDate)) meta.startDate = p.meta.startDate;
    if (p.meta.endDate && (!meta.endDate || p.meta.endDate > meta.endDate)) meta.endDate = p.meta.endDate;
    warnings.push(...p.warnings);
    for (const d of p.days) {
      const prev = byDate.get(d.date);
      byDate.set(d.date, prev ? mergeDay(prev, d) : d);
    }
  }
  return { meta, days: [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)), warnings: [...new Set(warnings)] };
}

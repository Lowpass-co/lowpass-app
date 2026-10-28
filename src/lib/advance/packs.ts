/* ============================================
   Info packs — the pure rules (Oct 2026)

   A venue info pack (tech pack, hospitality sheet, site plan…) is read by the
   model, which suggests an answer for each of the day's questions together
   with the QUOTE it read and the PAGE. Nothing here talks to the network:

     normaliseForMatch / findQuote — where a quote really is (the model's page
       number is a hint; the text decides). The browser uses the same
       normalisation over the PDF's text layer to draw the highlight.
     coerceValue — the model's text → the question's type (yes/no, numbers,
       24h times); anything that won't fit is dropped, not guessed.
     cleanExtraction — validates the model's output against the real questions.
     mergeSuggestions — several files → one suggestion per question.
     matchShow — "which show is this pack for?" from the venue/date it names.
   ============================================ */

import type { AdvField, AdvSection } from './board';
import { isEmptyAnswer } from './intake';

export type Confidence = 'high' | 'medium' | 'low';

export interface PackPage {
  num: number;
  text: string;
}

export interface Suggestion {
  section_id: string;
  field_id: string;
  value: string | number | boolean;
  quote: string;
  page: number | null;
  /** The quote was found in the file's text on that page. */
  verified: boolean;
  confidence: Confidence;
  file: number;
}

export interface Extra {
  label: string;
  value: string;
  quote: string;
  page: number | null;
  verified: boolean;
  section_id: string | null;
  file: number;
}

/** Lower-case, unify quotes/dashes, collapse whitespace — the same on both sides. */
export function normaliseForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The page a quote is on: the hinted page if it's there, else the first page that has it. */
export function findQuote(pages: PackPage[], quote: string, hint: number | null): number | null {
  const q = normaliseForMatch(quote);
  if (q.length < 3) return null;
  const has = (p: PackPage) => normaliseForMatch(p.text).includes(q);
  const hinted = hint != null ? pages.find((p) => p.num === hint) : undefined;
  if (hinted && has(hinted)) return hinted.num;
  return pages.find(has)?.num ?? null;
}

const YES = /^(yes|y|true|available|provided|included|on site|onsite|ok)\b/i;
const NO = /^(no|n|false|none|not available|not provided|n\/a|na)\b/i;

/** Model text → the question's type. Returns undefined when it doesn't fit. */
export function coerceValue(field: Pick<AdvField, 'type' | 'options'>, raw: unknown): string | number | boolean | undefined {
  if (raw === null || raw === undefined) return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;
  switch (field.type) {
    case 'boolean':
    case 'checkbox':
      if (typeof raw === 'boolean') return raw;
      if (YES.test(s)) return true;
      if (NO.test(s)) return false;
      return undefined;
    case 'number':
    case 'currency': {
      const m = s.replace(/,(?=\d{3}\b)/g, '').match(/-?\d+(\.\d+)?/);
      return m ? Number(m[0]) : undefined;
    }
    case 'time': {
      const m = s.match(/(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm)?/i);
      if (!m || (!m[2] && !m[3])) return undefined; // a bare number isn't a time
      let h = Number(m[1]);
      const min = m[2] ? Number(m[2]) : 0;
      const ap = (m[3] ?? '').toLowerCase();
      if (ap === 'pm' && h < 12) h += 12;
      if (ap === 'am' && h === 12) h = 0;
      if (h > 23 || min > 59) return undefined;
      return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }
    case 'select': {
      const opt = (field.options ?? []).find((o) => normaliseForMatch(o) === normaliseForMatch(s));
      return opt ?? s.slice(0, 500);
    }
    default:
      return s.slice(0, 2000);
  }
}

const CONF: Confidence[] = ['high', 'medium', 'low'];

/** The model's raw answer list → suggestions for real questions only. */
export function cleanExtraction(
  raw: unknown,
  sections: AdvSection[],
  pages: PackPage[] | null,
  file: number,
): { suggestions: Suggestion[]; extras: Extra[] } {
  const r = (raw ?? {}) as { answers?: unknown; extras?: unknown };
  const byKey = new Map<string, AdvField>();
  const sectionIds = new Set<string>();
  for (const s of sections) {
    sectionIds.add(s.template_id);
    for (const f of s.fields ?? []) byKey.set(`${s.template_id}:${f.id}`, f);
  }
  const suggestions: Suggestion[] = [];
  for (const a of Array.isArray(r.answers) ? r.answers : []) {
    const x = a as Record<string, unknown>;
    const key = `${String(x.section_id)}:${String(x.field_id)}`;
    const field = byKey.get(key);
    if (!field || field.type === 'contact' || field.type === 'file' || field.type === 'labor_call') continue;
    const value = coerceValue(field, x.value);
    if (value === undefined) continue;
    const quote = typeof x.quote === 'string' ? x.quote.slice(0, 400) : '';
    const hint = typeof x.page === 'number' && Number.isInteger(x.page) ? x.page : null;
    const found = pages && quote ? findQuote(pages, quote, hint) : null;
    suggestions.push({
      section_id: String(x.section_id),
      field_id: String(x.field_id),
      value,
      quote,
      page: found ?? hint,
      verified: found != null,
      confidence: CONF.includes(x.confidence as Confidence) ? (x.confidence as Confidence) : 'medium',
      file,
    });
  }
  const extras: Extra[] = [];
  for (const e of Array.isArray(r.extras) ? r.extras : []) {
    const x = e as Record<string, unknown>;
    const label = typeof x.label === 'string' ? x.label.trim().slice(0, 120) : '';
    const value = typeof x.value === 'string' ? x.value.trim().slice(0, 1000) : '';
    if (!label || !value) continue;
    const quote = typeof x.quote === 'string' ? x.quote.slice(0, 400) : '';
    const hint = typeof x.page === 'number' && Number.isInteger(x.page) ? x.page : null;
    const found = pages && quote ? findQuote(pages, quote, hint) : null;
    const sid = typeof x.section_id === 'string' && sectionIds.has(x.section_id) ? x.section_id : null;
    extras.push({ label, value, quote, page: found ?? hint, verified: found != null, section_id: sid, file });
  }
  return { suggestions, extras: extras.slice(0, 30) };
}

const RANK: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };

/** One suggestion per question: verified beats unverified, then confidence, then file order. */
export function mergeSuggestions(lists: Suggestion[][]): Suggestion[] {
  const best = new Map<string, Suggestion>();
  for (const s of lists.flat()) {
    const k = `${s.section_id}:${s.field_id}`;
    const cur = best.get(k);
    const better =
      !cur ||
      (s.verified && !cur.verified) ||
      (s.verified === cur.verified && RANK[s.confidence] < RANK[cur.confidence]);
    if (better) best.set(k, s);
  }
  return [...best.values()];
}

/** De-duplicate extras by label, dropping ones that duplicate a question. */
export function mergeExtras(lists: Extra[][], sections: AdvSection[]): Extra[] {
  const questions = new Set(sections.flatMap((s) => (s.fields ?? []).map((f) => normaliseForMatch(f.label))));
  const seen = new Set<string>();
  const out: Extra[] = [];
  for (const e of lists.flat()) {
    const k = normaliseForMatch(e.label);
    if (questions.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out.slice(0, 30);
}

/** Questions the packs didn't answer and the day doesn't have yet. */
export function unansweredAfter(
  sections: AdvSection[],
  data: Record<string, Record<string, unknown>>,
  suggestions: Suggestion[],
): { section_id: string; field_id: string; label: string; section: string; tmOnly: boolean }[] {
  const got = new Set(suggestions.map((s) => `${s.section_id}:${s.field_id}`));
  const out: { section_id: string; field_id: string; label: string; section: string; tmOnly: boolean }[] = [];
  for (const s of sections) {
    for (const f of s.fields ?? []) {
      if (f.type === 'contact' || f.type === 'file' || f.type === 'labor_call') continue;
      if (got.has(`${s.template_id}:${f.id}`)) continue;
      if (!isEmptyAnswer(data?.[s.template_id]?.[f.id])) continue;
      out.push({ section_id: s.template_id, field_id: f.id, label: f.label, section: s.label, tmOnly: s.tm_only === true });
    }
  }
  return out;
}

/* ---------- which show is this pack for ---------- */

export interface ShowRef {
  routingId: string;
  date: string;
  venue: string | null;
  city: string | null;
}

function words(s: string | null | undefined): Set<string> {
  return new Set(normaliseForMatch(s ?? '').split(/[^a-z0-9À-ɏ]+/).filter((w) => w.length > 2));
}

export function matchShow(guess: { venue?: string | null; city?: string | null; date?: string | null }, shows: ShowRef[]): string | null {
  if (!shows.length) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(guess.date ?? '') ? guess.date : null;
  const gv = words(guess.venue);
  const gc = words(guess.city);
  let best: { id: string; score: number } | null = null;
  for (const s of shows) {
    let score = 0;
    if (date && s.date === date) score += 5;
    const sv = words(s.venue);
    const overlap = [...gv].filter((w) => sv.has(w)).length;
    if (overlap) score += 2 + overlap;
    if ([...gc].some((w) => words(s.city).has(w))) score += 1;
    if (score > (best?.score ?? 0)) best = { id: s.routingId, score };
  }
  return best && best.score >= 3 ? best.id : null;
}

/* ============================================
   Advance board — the pure rules (Oct 2026 rebuild)

   Everything the board and the show page SAY about progress comes from here,
   so the board cell, the show header and the section tabs can never disagree
   (the old page showed "6/6 completed · COMPLETE · NOT STARTED" on one card).

   A section's state, in priority order:
     review   — the venue (or an info pack) answered and you haven't accepted
     done     — every counted question has an answer
     asked    — a live venue request covers it and it isn't finished
     partial  — some answers
     none     — nothing yet
     off      — the section isn't on this day (board only)

   Hotel, Flights and Deal Info are NOT advance sections any more: they're
   shown read-only from Hotels & rooming, Travel and Income (one place to edit
   each fact). Their old answers stay in the stored JSON untouched.
   ============================================ */

import { isEmptyAnswer } from './intake';

export interface AdvField {
  id: string;
  label: string;
  type: string;
  options?: string[];
  helpText?: string;
  placeholder?: string;
  required?: boolean;
  /** Added for this day only (not in the template). */
  day_only?: boolean;
}

export interface AdvSection {
  template_id: string;
  label: string;
  fields: AdvField[];
  order?: number;
  tm_only?: boolean;
}

export type AdvData = Record<string, Record<string, unknown>>;

export type CellState = 'done' | 'review' | 'asked' | 'partial' | 'none' | 'off';

/** Sections whose facts live on another page now. Matched by label. */
const LINKED_LABELS = new Set(['hotel', 'flights', 'deal info']);
/** Venue contacts render as a card, not a section of questions. */
const CONTACT_LABELS = new Set(['key contacts']);
/** Field types that aren't a question you answer in a box. */
const UNCOUNTED_TYPES = new Set(['contact', 'labor_call', 'file']);

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

export function isLinkedSection(s: Pick<AdvSection, 'label'>): boolean {
  return LINKED_LABELS.has(norm(s.label));
}
export function isContactSection(s: Pick<AdvSection, 'label'>): boolean {
  return CONTACT_LABELS.has(norm(s.label));
}
/** The sections the new Advance shows as questions, in order. */
export function questionSections(sections: AdvSection[] | null | undefined): AdvSection[] {
  return [...(sections ?? [])]
    .filter((s) => !isLinkedSection(s) && !isContactSection(s))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function countedFields(s: AdvSection): AdvField[] {
  return (s.fields ?? []).filter((f) => f && f.id && !UNCOUNTED_TYPES.has(f.type));
}

export interface SectionProgress {
  template_id: string;
  label: string;
  total: number;
  answered: number;
  toReview: number;
  state: Exclude<CellState, 'off'>;
  tmOnly: boolean;
}

export function sectionProgress(
  s: AdvSection,
  data: AdvData | null | undefined,
  pendingBySection: Record<string, number>,
  requestLive: boolean,
): SectionProgress {
  const fields = countedFields(s);
  const values = data?.[s.template_id] ?? {};
  const answered = fields.filter((f) => !isEmptyAnswer(values[f.id])).length;
  const toReview = pendingBySection[s.template_id] ?? 0;
  const tmOnly = s.tm_only === true;
  let state: SectionProgress['state'];
  if (toReview > 0) state = 'review';
  else if (fields.length > 0 && answered === fields.length) state = 'done';
  else if (requestLive && !tmOnly) state = 'asked';
  else if (answered > 0) state = 'partial';
  else state = 'none';
  return { template_id: s.template_id, label: s.label, total: fields.length, answered, toReview, state, tmOnly };
}

/* ---------- the venue request ---------- */

export interface IntakeLinkLite {
  status: string; // pending | submitted | revoked
  created_at: string;
  sent_at?: string | null;
  last_viewed_at?: string | null;
  submitted_at?: string | null;
  revoked_at?: string | null;
  expires_at?: string | null;
}

export type RequestKind = 'not_sent' | 'made' | 'sent' | 'opened' | 'answered' | 'done';

export interface RequestState {
  kind: RequestKind;
  /** The moment the label is about (sent / opened / answered). */
  at: string | null;
  toReview: number;
  /** Sent a week ago or more and still nothing back. */
  chase: boolean;
  /** A link the venue can still use. */
  live: boolean;
}

const DAY = 86_400_000;

export function requestState(
  links: IntakeLinkLite[],
  toReview: number,
  complete: boolean,
  now = Date.now(),
): RequestState {
  const usable = links
    .filter((l) => l.status !== 'revoked' && !l.revoked_at)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const l = usable[0];
  const expired = !!l?.expires_at && new Date(l.expires_at).getTime() < now;
  const live = !!l && !expired && l.status !== 'submitted';
  if (complete && toReview === 0) return { kind: 'done', at: l?.submitted_at ?? null, toReview: 0, chase: false, live: false };
  if (!l) return { kind: 'not_sent', at: null, toReview, chase: false, live: false };
  if (toReview > 0 || l.status === 'submitted' || l.submitted_at)
    return { kind: 'answered', at: l.submitted_at ?? null, toReview, chase: false, live };
  if (l.last_viewed_at) return { kind: 'opened', at: l.last_viewed_at, toReview, chase: false, live };
  if (l.sent_at) {
    return { kind: 'sent', at: l.sent_at, toReview, chase: now - new Date(l.sent_at).getTime() >= 7 * DAY, live };
  }
  return { kind: 'made', at: l.created_at, toReview, chase: false, live };
}

export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return '';
  const d = Math.floor((now - new Date(iso).getTime()) / DAY);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${d} days ago`;
}

export function requestLabel(r: RequestState, now = Date.now()): string {
  switch (r.kind) {
    case 'done': return 'Done';
    case 'not_sent': return 'Not sent';
    case 'made': return 'Link made, not sent';
    case 'sent': return r.chase ? `No answer · sent ${ago(r.at, now)}` : `Sent ${ago(r.at, now)}`;
    case 'opened': return `Opened ${ago(r.at, now)}`;
    case 'answered': return r.toReview > 0 ? `Answered · ${r.toReview} to review` : 'Answered';
  }
}

/* ---------- a show, summed up ---------- */

export interface ShowSummary {
  sections: SectionProgress[];
  total: number;
  answered: number;
  toReview: number;
  complete: boolean;
}

export function summariseShow(
  sections: AdvSection[] | null | undefined,
  data: AdvData | null | undefined,
  pendingBySection: Record<string, number>,
  requestLive: boolean,
): ShowSummary {
  const ps = questionSections(sections).map((s) => sectionProgress(s, data, pendingBySection, requestLive));
  const total = ps.reduce((n, p) => n + p.total, 0);
  const answered = ps.reduce((n, p) => n + p.answered, 0);
  const toReview = ps.reduce((n, p) => n + p.toReview, 0);
  return { sections: ps, total, answered, toReview, complete: total > 0 && answered === total && toReview === 0 };
}

/** Board columns: every question section any show has, by usual position. */
export function boardColumns(shows: { sections: AdvSection[] }[]): { key: string; label: string }[] {
  const acc = new Map<string, { label: string; pos: number; n: number }>();
  for (const show of shows) {
    questionSections(show.sections).forEach((s, i) => {
      const key = norm(s.label);
      const e = acc.get(key) ?? { label: s.label, pos: 0, n: 0 };
      e.pos += i;
      e.n += 1;
      acc.set(key, e);
    });
  }
  return [...acc.entries()]
    .sort((a, b) => a[1].pos / a[1].n - b[1].pos / b[1].n || b[1].n - a[1].n)
    .map(([key, e]) => ({ key, label: e.label }));
}

export function columnKey(label: string): string {
  return norm(label);
}

/* ---------- search ---------- */

export interface SearchHit {
  label: string;
  value: string;
}

/** Answers on one show that match a query (case-insensitive, all words). */
export function searchShow(
  q: string,
  sections: AdvSection[],
  data: AdvData | null | undefined,
  extra: string[] = [],
): { match: boolean; hits: SearchHit[] } {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return { match: true, hits: [] };
  const hits: SearchHit[] = [];
  const hay: string[] = [...extra.map(norm)];
  for (const s of questionSections(sections)) {
    for (const f of s.fields ?? []) {
      const v = data?.[s.template_id]?.[f.id];
      if (isEmptyAnswer(v)) continue;
      const text = typeof v === 'string' ? v : typeof v === 'boolean' ? (v ? 'yes' : 'no') : JSON.stringify(v);
      const line = `${f.label} ${text}`;
      hay.push(norm(line));
      if (words.every((w) => norm(line).includes(w) || norm(s.label).includes(w))) hits.push({ label: f.label, value: text });
    }
  }
  const all = hay.join(' \n ');
  return { match: words.every((w) => all.includes(w)), hits: hits.slice(0, 3) };
}

/* ---------- customising a day ---------- */

/** How a day differs from its template: sections off, sections added, questions added. */
export function dayChanges(day: AdvSection[], template: AdvSection[] | null): { off: string[]; added: string[]; addedQuestions: number } {
  if (!template) return { off: [], added: [], addedQuestions: 0 };
  const dayIds = new Set(day.map((s) => s.template_id));
  const tplIds = new Set(template.map((s) => s.template_id));
  const off = template.filter((s) => !dayIds.has(s.template_id) && !isLinkedSection(s) && !isContactSection(s)).map((s) => s.label);
  const added = day.filter((s) => !tplIds.has(s.template_id) && !isLinkedSection(s) && !isContactSection(s)).map((s) => s.label);
  let addedQuestions = 0;
  for (const s of day) {
    const t = template.find((x) => x.template_id === s.template_id);
    if (!t) continue;
    const ids = new Set((t.fields ?? []).map((f) => f.id));
    addedQuestions += (s.fields ?? []).filter((f) => !ids.has(f.id)).length;
  }
  return { off, added, addedQuestions };
}

export function changeCount(c: ReturnType<typeof dayChanges>): number {
  return c.off.length + c.added.length + c.addedQuestions;
}

/** Day types that never get an advance unless a template is mapped to them. */
export const ADVANCE_DAY_TYPES_DEFAULT = ['show', 'festival'];

export function primaryDayType(dayType: string | null | undefined): string {
  return norm((dayType ?? '').split(',')[0]) || 'show';
}

export function dayTypes(dayType: string | null | undefined): string[] {
  return (dayType ?? '').split(',').map(norm).filter(Boolean);
}

/** A field id that's unique within its section. */
export function newFieldId(label: string, existing: string[]): string {
  const base = norm(label).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'question';
  let id = `day_${base}`;
  let i = 2;
  while (existing.includes(id)) id = `day_${base}_${i++}`;
  return id;
}

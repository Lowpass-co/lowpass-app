/* ============================================
   LOWPASS — Crew rules (Nov 2026, Adam: "visually pleasing, better flow,
   less restrictive")

   Pure. The Add crew panel, the Crew list and the add route all read these:
     - inferRoleTag   "FOH Engineer" → foh. The role tag feeds rider
                      variables ({contact.foh.*}); nobody should have to
                      pick it from a jargon dropdown. Shown as a chip the
                      user can change.
     - departmentOf   the Crew list's groups, from the role tag.
     - accessWrites   what giving a login preset on ONE tour writes, given
                      the member's existing tour_access rows. Never lowers.
   ============================================ */

import { AREAS, PRESET_ACCESS, type Area, type Level, type Preset, type TourAccessRow } from '@/lib/permissions/areas';
import type { RoleTag } from './role-tags';

/* ---------- Role tag from the role text ---------- */

/** Order matters: the first rule that matches wins ("Assistant Tour
 *  Manager" is TM2 before it is TM; "Keys Tech" is backline before band). */
const RULES: ReadonlyArray<[RoleTag, RegExp]> = [
  ['tm2', /\b(assistant|asst|associate|2nd|second)\b.*\b(tour manager|tm)\b|\btm ?2\b|\btm assistant\b|\batm\b/],
  ['tm', /\btour manager\b|\btm\b|\btour director\b|\broad manager\b/],
  ['pm', /\bproduction manager\b|\bprod(uction)? mgr\b|\bpm\b/],
  ['mons', /\bmonitors?\b|\bmons?\b/],
  ['foh', /\bfoh\b|\bfront of house\b|\bsound engineer\b|\baudio engineer\b|\bmix engineer\b/],
  ['ld', /\blighting\b|\bld\b|\blx\b|\blights?\b/],
  ['backline', /\bbackline\b|\b(guitar|drum|keys?|bass|instrument) tech\b/],
  ['management', /\bmanagement\b|\bmgmt\b|\bartist manager\b|^manager$/],
  ['band', /\bmusician\b|\bdrummer\b|\bdrums\b|\bguitar(ist)?\b|\bbass(ist)?\b|\bkeys\b|\bkeyboards?\b|\bvocal(ist|s)?\b|\bsinger\b|\bmusical director\b|\bmd\b|\bband\b|\bbvs?\b/],
];

export function inferRoleTag(role: string | null | undefined): RoleTag {
  const r = (role ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!r) return 'other';
  for (const [tag, re] of RULES) if (re.test(r)) return tag;
  return 'other';
}

/* ---------- Departments (the Crew list's groups) ---------- */

export const DEPARTMENTS = ['tour', 'band', 'management', 'audio', 'lighting', 'backline', 'other'] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const DEPARTMENT_LABELS: Record<Department, string> = {
  tour: 'Tour team',
  band: 'Band',
  management: 'Management',
  audio: 'Audio',
  lighting: 'Lighting',
  backline: 'Backline',
  other: 'Other',
};

const DEPT_BY_TAG: Record<RoleTag, Department> = {
  tm: 'tour',
  tm2: 'tour',
  pm: 'tour',
  band: 'band',
  management: 'management',
  foh: 'audio',
  mons: 'audio',
  ld: 'lighting',
  backline: 'backline',
  other: 'other',
};

export function departmentOf(tag: string | null | undefined): Department {
  return DEPT_BY_TAG[(tag ?? 'other') as RoleTag] ?? 'other';
}

/** Rows grouped by department, in DEPARTMENTS order, empty groups dropped. */
export function groupByDepartment<T>(rows: readonly T[], tagOf: (row: T) => string | null | undefined): Array<{ dept: Department; rows: T[] }> {
  const by = new Map<Department, T[]>();
  for (const r of rows) {
    const d = departmentOf(tagOf(r));
    const list = by.get(d) ?? [];
    list.push(r);
    by.set(d, list);
  }
  return DEPARTMENTS.filter((d) => by.has(d)).map((d) => ({ dept: d, rows: by.get(d)! }));
}

/* ---------- Dates ---------- */

/** True when the person is on for the tour's whole window (or no dates are set). */
export function isWholeTour(
  starts: string | null,
  ends: string | null,
  tourStart: string | null,
  tourEnd: string | null,
): boolean {
  if (!starts && !ends) return true;
  return (starts ?? tourStart) === tourStart && (ends ?? tourEnd) === tourEnd;
}

/* ---------- App access on one tour ---------- */

const RANK: Record<Level, number> = { view: 1, edit: 2 };

export type AccessWrites = {
  insert: Array<{ tour_id: string | null; area: Area; level: Level }>;
  /** Existing rows (by id) raised view → edit. */
  raise: string[];
};

/**
 * What writing `wanted` rows onto a member's existing tour_access rows takes:
 * inserts for areas they don't have, raises for view → edit. Never lowers; an
 * "all tours" row that already covers an area means nothing for that tour.
 */
export function mergeAccessRows(
  existing: ReadonlyArray<TourAccessRow & { id: string }>,
  wanted: ReadonlyArray<{ tour_id: string | null; area: string; level: string }>,
): AccessWrites {
  const out: AccessWrites = { insert: [], raise: [] };
  const seen = new Set<string>();
  for (const w of wanted) {
    const area = w.area as Area;
    const level = w.level as Level;
    if (!(AREAS as readonly string[]).includes(area) || !(level in RANK)) continue;
    const key = `${w.tour_id ?? '*'}:${area}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const all = existing.find((r) => r.tour_id === null && r.area === area);
    if (all && RANK[all.level as Level] >= RANK[level]) continue;
    const own = existing.find((r) => r.tour_id === w.tour_id && r.area === area);
    if (!own) out.insert.push({ tour_id: w.tour_id, area, level });
    else if (RANK[own.level as Level] < RANK[level] && !out.raise.includes(own.id)) out.raise.push(own.id);
  }
  return out;
}

/** Granting `preset` on `tourId` — mergeAccessRows with the preset's rows. */
export function accessWrites(
  existing: ReadonlyArray<TourAccessRow & { id: string }>,
  tourId: string,
  preset: Preset,
): AccessWrites {
  return mergeAccessRows(existing, presetRows(tourId, preset));
}

/** A preset as invite rows for one tour (the invite's initial_access). */
export function presetRows(tourId: string, preset: Preset): Array<{ tour_id: string; area: Area; level: Level }> {
  const want = PRESET_ACCESS[preset];
  return AREAS.filter((a) => want[a]).map((a) => ({ tour_id: tourId, area: a, level: want[a]! }));
}

/** One-line description of a preset for the picker. */
export const PRESET_HINTS: Record<Preset, string> = {
  crew: 'Sees schedule, advance, production, parking, files',
  production: 'Edits advance, production, parking, files',
  accounts: 'Edits budget, receipts, payroll, income',
  tour_manager: 'Edits everything on this tour',
};

/* ---------- Add crew: who to offer ---------- */

export type Candidate = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  usualRole: string | null;
  hasLogin: boolean;
  /** Their most recent tour in this workspace (by start date). */
  lastTour: { name: string; start: string | null } | null;
  /** Has toured with this tour's artist before. */
  withArtist: boolean;
  /** Already on this tour — shown greyed, not offered (OPS-11, Adam). */
  onTour: boolean;
};

type TourFact = { id: string; name: string | null; artist_id: string | null; start_date: string | null };

/**
 * Everyone in People, people from this artist's past tours first (most
 * recent first), then everyone else A–Z. Those already on this tour are
 * kept (flagged `onTour`, shown greyed) — Adam preferred seeing them to
 * wondering where they went.
 */
export function rankCandidates(args: {
  people: ReadonlyArray<{ id: string; name: string; email: string | null; phone: string | null; role: string | null; user_id: string | null }>;
  assignments: ReadonlyArray<{ person_id: string; tour_id: string }>;
  tours: ReadonlyArray<TourFact>;
  tourId: string;
  artistId: string | null;
}): Candidate[] {
  const tourById = new Map(args.tours.map((t) => [t.id, t]));
  const onThisTour = new Set(args.assignments.filter((a) => a.tour_id === args.tourId).map((a) => a.person_id));
  const toursByPerson = new Map<string, TourFact[]>();
  for (const a of args.assignments) {
    if (a.tour_id === args.tourId) continue;
    const t = tourById.get(a.tour_id);
    if (!t) continue;
    const list = toursByPerson.get(a.person_id) ?? [];
    list.push(t);
    toursByPerson.set(a.person_id, list);
  }
  const out: Candidate[] = [];
  for (const p of args.people) {
    const tours = toursByPerson.get(p.id) ?? [];
    const last = [...tours].sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? ''))[0] ?? null;
    out.push({
      id: p.id,
      name: p.name.trim() || 'Unnamed',
      email: p.email,
      phone: p.phone,
      usualRole: p.role?.trim() || null,
      hasLogin: !!p.user_id,
      lastTour: last ? { name: last.name?.trim() || 'Untitled tour', start: last.start_date } : null,
      withArtist: !!args.artistId && tours.some((t) => t.artist_id === args.artistId),
      onTour: onThisTour.has(p.id),
    });
  }
  return out.sort((a, b) => {
    if (a.withArtist !== b.withArtist) return a.withArtist ? -1 : 1;
    if (a.withArtist) {
      const d = (b.lastTour?.start ?? '').localeCompare(a.lastTour?.start ?? '');
      if (d) return d;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

/** Search: every word must appear in the name, email or usual role. */
export function matchesCandidate(c: Candidate, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${c.name} ${c.email ?? ''} ${c.usualRole ?? ''}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

/* ---------- A crew member's login on one tour ---------- */

export type LoginState = {
  state: 'none' | 'invited' | 'member' | 'full';
  /** The preset this tour's access matches, 'custom', or null for none / unknown. */
  preset: Preset | 'custom' | null;
  memberId?: string;
  inviteId?: string;
  /** Admins only (invites are admin-readable). */
  inviteUrl?: string;
};

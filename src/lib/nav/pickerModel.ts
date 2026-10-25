/* ============================================
   LOWPASS — artist & tour picker: the pure rules (Oct 2026 redesign)

   Everything the top-bar picker decides that isn't drawing: each artist's
   one-line status, how an artist's tours group (on the road / upcoming /
   dates TBC / past), each tour's detail line, the search filter, and — the
   one that used to go wrong — WHERE picking a tour takes you.

   Phases come from tourPhase (lib/derive/tourStatus), the same date rule as
   the artist page's tour rows and the workspace cards, so the picker can
   never call a tour "on the road" that the page calls "upcoming".

   Pure: no React, no I/O, no `window` — unit-tested directly.
   ============================================ */

import { tourPhase, type TourPhase } from '@/lib/derive/tourStatus';

export interface PickerArtist {
  id: string;
  name: string;
  /** branding.logo_url → spotify image → null (initials). Resolved by caller. */
  imageUrl: string | null;
}

export interface PickerTour {
  id: string;
  name: string;
  artistId: string | null;
  startDate: string | null;
  endDate: string | null;
}

export type PickerGroupKey = 'road' | 'upcoming' | 'tbc' | 'past';

export interface PickerTourView extends PickerTour {
  phase: TourPhase;
  /** "1 – 31 Oct 2026 · day 25 of 31" / "2 – 14 Feb 2027 · starts in 20 days" … */
  detail: string;
}

export interface PickerGroup {
  key: PickerGroupKey;
  label: string;
  tours: PickerTourView[];
}

const ymd = (iso: string | null | undefined) => (iso ?? '').slice(0, 10);

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${ymd(b)}T12:00:00Z`) - Date.parse(`${ymd(a)}T12:00:00Z`)) / 86_400_000);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(iso: string): { d: number; m: string; y: number } | null {
  const t = Date.parse(`${ymd(iso)}T12:00:00Z`);
  if (Number.isNaN(t)) return null;
  const dt = new Date(t);
  return { d: dt.getUTCDate(), m: MONTHS[dt.getUTCMonth()], y: dt.getUTCFullYear() };
}

/** "1 – 31 Oct 2026" · "28 Sep – 3 Oct 2026" · "30 Dec 2026 – 4 Jan 2027" · "9 Apr 2027". */
export function formatRange(start: string | null, end: string | null): string {
  const s = start ? parts(start) : null;
  const e = end ? parts(end) : null;
  if (!s && !e) return 'Dates TBC';
  if (!s || !e) {
    const one = (s ?? e)!;
    return `${one.d} ${one.m} ${one.y}`;
  }
  if (ymd(start) === ymd(end)) return `${s.d} ${s.m} ${s.y}`;
  if (s.y !== e.y) return `${s.d} ${s.m} ${s.y} – ${e.d} ${e.m} ${e.y}`;
  if (s.m !== e.m) return `${s.d} ${s.m} – ${e.d} ${e.m} ${e.y}`;
  return `${s.d} – ${e.d} ${e.m} ${e.y}`;
}

function phaseOf(t: PickerTour, today: string): TourPhase {
  return tourPhase({ start_date: t.startDate, end_date: t.endDate }, today);
}

export function tourDetail(t: PickerTour, today: string): string {
  const phase = phaseOf(t, today);
  const range = formatRange(t.startDate, t.endDate);
  if (phase === 'on_tour') {
    const n = daysBetween(t.startDate!, today) + 1;
    const total = daysBetween(t.startDate!, t.endDate!) + 1;
    return `${range} · day ${n} of ${total}`;
  }
  if (phase === 'upcoming') {
    const away = daysBetween(today, t.startDate!);
    if (away === 1) return `${range} · starts tomorrow`;
    if (away <= 60) return `${range} · starts in ${away} days`;
    return range;
  }
  return range;
}

const GROUP_LABEL: Record<PickerGroupKey, string> = {
  road: 'On the road',
  upcoming: 'Upcoming',
  tbc: 'Dates TBC',
  past: 'Past',
};

/** An artist's tours, grouped and ordered: on the road and upcoming soonest
 *  first, past most-recent first. Empty groups are dropped. */
export function groupTours(tours: PickerTour[], today: string): PickerGroup[] {
  const by: Record<PickerGroupKey, PickerTourView[]> = { road: [], upcoming: [], tbc: [], past: [] };
  for (const t of tours) {
    const phase = phaseOf(t, today);
    const view: PickerTourView = { ...t, phase, detail: tourDetail(t, today) };
    const key: PickerGroupKey =
      phase === 'on_tour' ? 'road' : phase === 'upcoming' ? 'upcoming' : phase === 'planning' ? 'tbc' : 'past';
    by[key].push(view);
  }
  const asc = (a: PickerTour, b: PickerTour) => (ymd(a.startDate) < ymd(b.startDate) ? -1 : ymd(a.startDate) > ymd(b.startDate) ? 1 : a.name.localeCompare(b.name));
  by.road.sort(asc);
  by.upcoming.sort(asc);
  by.tbc.sort((a, b) => a.name.localeCompare(b.name));
  by.past.sort((a, b) => (ymd(a.endDate ?? a.startDate) > ymd(b.endDate ?? b.startDate) ? -1 : 1));
  return (['road', 'upcoming', 'tbc', 'past'] as PickerGroupKey[])
    .filter((k) => by[k].length > 0)
    .map((k) => ({ key: k, label: GROUP_LABEL[k], tours: by[k] }));
}

export interface ArtistStatus {
  text: string;
  /** True while a tour is running — the line is drawn in the "live" colour. */
  live: boolean;
}

/** One line under the artist's name: where they are now. */
export function artistStatus(tours: PickerTour[], today: string): ArtistStatus {
  if (tours.length === 0) return { text: 'No tours yet', live: false };
  const groups = groupTours(tours, today);
  const road = groups.find((g) => g.key === 'road')?.tours[0];
  if (road) {
    const n = daysBetween(road.startDate!, today) + 1;
    const total = daysBetween(road.startDate!, road.endDate!) + 1;
    return { text: `On the road · day ${n} of ${total}`, live: true };
  }
  const next = groups.find((g) => g.key === 'upcoming')?.tours[0];
  if (next) {
    const p = parts(next.startDate!);
    return { text: p ? `Next tour starts ${p.d} ${p.m}` : 'Tour coming up', live: false };
  }
  if (groups.some((g) => g.key === 'tbc')) return { text: 'Tour dates TBC', live: false };
  const last = groups.find((g) => g.key === 'past')?.tours[0];
  const p = last ? parts(last.endDate ?? last.startDate ?? '') : null;
  return { text: p ? `Last tour ended ${p.d} ${p.m} ${p.y}` : 'No current tours', live: false };
}

/** Case/accents-insensitive "contains". */
export function matches(haystack: string, query: string): boolean {
  const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return norm(haystack).includes(norm(query.trim()));
}

/** Artists to list for a query: an artist shows when its name or any of its
 *  tours' names match. Order is kept. */
export function filterArtists(
  artists: PickerArtist[],
  toursByArtist: Map<string, PickerTour[]>,
  query: string,
): PickerArtist[] {
  if (!query.trim()) return artists;
  return artists.filter(
    (a) => matches(a.name, query) || (toursByArtist.get(a.id) ?? []).some((t) => matches(t.name, query)),
  );
}

/** Tours to show for an artist under a query: all of them when the artist's
 *  own name matches (or no query), else only the matching tours. */
export function filterTours(artist: PickerArtist, tours: PickerTour[], query: string): PickerTour[] {
  if (!query.trim() || matches(artist.name, query)) return tours;
  return tours.filter((t) => matches(t.name, query));
}

/* ---- where picking a tour takes you ---- */

const TOUR_PATH = /^\/(operations|budget|advance)\/([^/?#]+)((?:\/[^/?#]+)*)\/?$/;
const LANDING_PATH = /^\/(operations|budget|advance)\/?$/;
/** Operations sub-pages that only make sense for one tour's specific record. */
const OPS_DROP = new Set(['day']);

/**
 * Where to go when a tour is picked.
 *  • On a tour page → the SAME page of the new tour: Budget stays Budget
 *    (keeping its ?tab=), Operations › Crew stays Crew, Budget › Settlement
 *    stays Settlement. A page that names one tour's record (an advance's
 *    show, an Operations day) drops to that product's landing.
 *  • On a product landing with no tour (/budget) → that product.
 *  • Anywhere else (artist page, workspace) → `fallbackHref`, which the caller
 *    resolves as the tour's last-used product (tourHref, Operations fallback).
 */
export function pickerTourHref(pathname: string, search: string, tourId: string, fallbackHref: string): string {
  const landing = LANDING_PATH.exec(pathname);
  if (landing) return `/${landing[1]}/${tourId}`;
  const m = TOUR_PATH.exec(pathname);
  if (!m) return fallbackHref;
  const product = m[1];
  const rest = (m[3] ?? '').split('/').filter(Boolean);
  if (product === 'advance') return `/advance/${tourId}`;
  if (product === 'operations') {
    const first = rest[0];
    return first && !OPS_DROP.has(first) ? `/operations/${tourId}/${first}` : `/operations/${tourId}`;
  }
  // budget — keep the sub-page (settlement) and the tab, nothing tour-specific.
  const sub = rest[0] ? `/${rest[0]}` : '';
  const tab = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('tab');
  return `/budget/${tourId}${sub}${tab ? `?tab=${encodeURIComponent(tab)}` : ''}`;
}

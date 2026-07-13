/* ============================================================
   LOWPASS — tour status derivation (alignment Stage A · A3)

   ONE home for "given a tour + its routing days, what is its status, next show,
   and how does it count?" Before this, at least three surfaces derived these
   independently and disagreed: workspace cards said "NOTHING BOOKED" beside a
   Needs-you queue that said "rehearsals in 57 days"; the header said "9 IN
   PLANNING" while counting ended tours; the routing header said "none upcoming"
   with 11 future shows. Every consumer (workspace cards + header stats, artist
   page, routing header, needs-you) now derives through here.

   Pure + self-contained (no runtime imports) so it runs under
   `node --experimental-strip-types`. Status vocabulary follows
   DESIGN_DIRECTION §8: verb + time anchor, no mood words.
   ============================================================ */

export interface DeriveTour {
  start_date: string | null;
  end_date: string | null;
  /** DB status text ('planning' | 'active' | 'completed' | …). Optional — the
   *  date-derived state below is authoritative; status only tie-breaks. */
  status?: string | null;
  /** True when the tour is financially settled (settlement closed). */
  settled?: boolean | null;
}

export interface DeriveRoutingDay {
  /** YYYY-MM-DD. */
  date: string;
  /** routing.day_type — free TEXT, CSV-capable ("show,festival"). */
  day_type: string | null;
}

export interface NextShow {
  date: string;
  daysAway: number;
}

// ── day-type helpers (inlined — day_type is CSV, first type wins) ────────────
function firstType(dayType: string | null | undefined): string {
  return (dayType ?? '').split(',')[0]?.trim().toLowerCase() ?? '';
}
function isShowDay(dayType: string | null | undefined): boolean {
  const t = firstType(dayType);
  return t === 'show' || t === 'festival';
}
function ymd(d: string | null | undefined): string {
  return (d ?? '').slice(0, 10);
}
/** Whole days from `from` to `to` (both YYYY-MM-DD), UTC-noon anchored to dodge
 *  DST/timezone off-by-one. Negative when `to` is in the past. */
function daysBetween(from: string, to: string): number {
  const a = new Date(`${ymd(from)}T12:00:00Z`).getTime();
  const b = new Date(`${ymd(to)}T12:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return Math.round((b - a) / 86_400_000);
}

/** The nearest FUTURE show/festival day (date ≥ today). Rehearsals / off / travel
 *  are never "shows". Returns null when nothing upcoming. */
export function nextShow(days: DeriveRoutingDay[], today: string): NextShow | null {
  const t = ymd(today);
  const upcoming = days
    .filter((d) => isShowDay(d.day_type) && ymd(d.date) >= t)
    .sort((a, b) => (ymd(a.date) < ymd(b.date) ? -1 : 1));
  const first = upcoming[0];
  return first ? { date: ymd(first.date), daysAway: daysBetween(t, first.date) } : null;
}

/** The nearest FUTURE routing day of any meaningful type (used to name the next
 *  milestone in the status line, e.g. rehearsals before the first show). */
function nextEvent(days: DeriveRoutingDay[], today: string): DeriveRoutingDay | null {
  const t = ymd(today);
  const upcoming = days
    .filter((d) => ymd(d.date) >= t && firstType(d.day_type) !== '' && firstType(d.day_type) !== 'off')
    .sort((a, b) => (ymd(a.date) < ymd(b.date) ? -1 : 1));
  return upcoming[0] ?? null;
}

export type TourPhase = 'on_tour' | 'upcoming' | 'planning' | 'ended';

/** Date-derived phase. `on_tour` = today within [start,end]; `ended` = end < today;
 *  `upcoming` = start in the future with dates set; `planning` = dates not locked. */
export function tourPhase(tour: DeriveTour, today: string): TourPhase {
  const t = ymd(today);
  const start = ymd(tour.start_date);
  const end = ymd(tour.end_date);
  if (!start || !end) return 'planning';
  if (end < t) return 'ended';
  if (start <= t && t <= end) return 'on_tour';
  return 'upcoming';
}

function formatDay(date: string): string {
  const d = new Date(`${ymd(date)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** The status line per DESIGN_DIRECTION §8: verb + time anchor, no mood words. */
export function tourStatusLine(
  tour: DeriveTour,
  days: DeriveRoutingDay[],
  today: string,
): string {
  const phase = tourPhase(tour, today);
  const t = ymd(today);

  if (phase === 'ended') {
    const end = ymd(tour.end_date);
    const ended = `Ended ${formatDay(end)}`;
    return tour.settled ? ended : `${ended} · not settled`;
  }

  if (phase === 'on_tour') {
    const start = ymd(tour.start_date);
    const end = ymd(tour.end_date);
    const total = daysBetween(start, end) + 1;
    const dayN = daysBetween(start, t) + 1;
    return `Tour running · day ${dayN} of ${total}`;
  }

  if (phase === 'planning') {
    return 'Planning · dates not locked';
  }

  // upcoming — name the next milestone using the §8 vocabulary ONLY. Rehearsals
  // are the single named pre-show phase ("Rehearsals in N days"); any other
  // pre-show event (travel / press / radio / …) is NOT a §8 phrase, so it falls
  // through to the first show rather than leaking "Travel in N days".
  const ns = nextShow(days, t);
  const ne = nextEvent(days, t);
  const rehearsalBeforeShow =
    ne && firstType(ne.day_type) === 'rehearsal' && (!ns || ymd(ne.date) < ns.date);
  if (rehearsalBeforeShow) {
    return `Rehearsals in ${daysBetween(t, ne.date)} days`;
  }
  if (ns) return `First show in ${ns.daysAway} days`;
  return 'Off the road';
}

// ── counts across a set of tours ─────────────────────────────────────────────

/** In planning = FUTURE tours only (never counts ended tours — that was the "9
 *  in planning" bug). A tour counts when it hasn't ended and isn't running now:
 *  it's upcoming, or its dates aren't locked yet. */
export function countInPlanning(tours: DeriveTour[], today: string): number {
  return tours.filter((tr) => {
    const p = tourPhase(tr, today);
    return p === 'upcoming' || p === 'planning';
  }).length;
}

/** Tours running right now (today within [start, end]). */
export function countOnTourNow(tours: DeriveTour[], today: string): number {
  return tours.filter((tr) => tourPhase(tr, today) === 'on_tour').length;
}

/** Ended tours that aren't settled yet (the real follow-up backlog). */
export function countEndedUnsettled(tours: DeriveTour[], today: string): number {
  return tours.filter((tr) => tourPhase(tr, today) === 'ended' && !tr.settled).length;
}

/** The standardized workspace-card footer left side (§8): the next show, or the
 *  honest empty phrase. `{ label, city }` so the caller can style the city. */
export function nextShowFooter(
  days: DeriveRoutingDay[],
  today: string,
  cityByDate?: (date: string) => string | null,
): { hasShow: boolean; date: string | null; city: string | null } {
  const ns = nextShow(days, today);
  if (!ns) return { hasShow: false, date: null, city: null };
  return { hasShow: true, date: ns.date, city: cityByDate ? cityByDate(ns.date) : null };
}

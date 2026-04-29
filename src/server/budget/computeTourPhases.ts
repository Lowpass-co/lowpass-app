/* ============================================
   LOWPASS — Compute tour phases (Phase A budget redesign)

   Linear phase derivation from routing day_types: each leg = its own
   tour (per Adam's product call), so phases run Pre-Prod → Rehearsals
   → Show Days → Wrap with no multi-leg detection.

   Algorithm:
     1. Fetch routing rows for tourId, ordered by date asc.
     2. Pre-Prod synthetic phase from tour.start_date up to the day
        before the first rehearsal (or first show/festival, if no
        rehearsals).
     3. Rehearsals span from the first rehearsal day_type through
        the last rehearsal before any show/festival. Omitted entirely
        if the tour has no rehearsal day_types.
     4. Show Days span from the first show/festival through the last
        show/festival, INCLUSIVE of any travel/off/press/radio/tv days
        mixed within (Adam's "show period" rule — once on tour, the
        in-between days are part of show days).
     5. Wrap synthetic phase from the day after the last show/festival
        through tour.end_date (or +14 days if tour.end_date matches the
        last show date so wrap doesn't collapse to zero).

   Edge cases:
     - No rehearsals → 3 phases (Pre-Prod / Show Days / Wrap).
     - No shows at all (planning-only tour) → Show Days span fills
       tour.start_date..tour.end_date as a placeholder; isPlaceholder
       is true so the strip can render a "no shows scheduled" hint.
     - Same-day-as-tour-start show → Pre-Prod is a zero-day phase;
       caller may render it muted with "—" date label.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

export type TourPhaseKey = 'pre-prod' | 'rehearsals' | 'show-days' | 'wrap';

export interface TourPhase {
  key: TourPhaseKey;
  label: string;
  /** ISO YYYY-MM-DD inclusive. */
  startDate: string;
  /** ISO YYYY-MM-DD inclusive. */
  endDate: string;
  isCurrent: boolean;
  isPast: boolean;
  /** True for Show Days when the tour has no scheduled shows yet —
   *  the span is a placeholder over the whole tour window. */
  isPlaceholder?: boolean;
}

const REHEARSAL_TYPES = new Set<string>(['rehearsal']);
const SHOW_TYPES = new Set<string>(['show', 'festival']);

/** Add `days` to an ISO YYYY-MM-DD string, return ISO YYYY-MM-DD. */
function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function classifyDayType(dayTypeCsv: string | null | undefined): {
  isRehearsal: boolean;
  isShow: boolean;
} {
  if (!dayTypeCsv) return { isRehearsal: false, isShow: false };
  const tokens = dayTypeCsv
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  return {
    isRehearsal: tokens.some((t) => REHEARSAL_TYPES.has(t)),
    isShow: tokens.some((t) => SHOW_TYPES.has(t)),
  };
}

export async function computeTourPhases(
  supabase: SupabaseClient,
  tourId: string,
): Promise<TourPhase[]> {
  const { data: tourRow } = await supabase
    .from('tours')
    .select('start_date, end_date')
    .eq('id', tourId)
    .maybeSingle();

  if (!tourRow) return [];

  const tourStart = (tourRow.start_date as string | null) ?? null;
  const tourEnd = (tourRow.end_date as string | null) ?? null;
  if (!tourStart || !tourEnd) return [];

  const { data: routingRows } = await supabase
    .from('routing')
    .select('date, day_type')
    .eq('tour_id', tourId)
    .order('date', { ascending: true });

  const today = isoToday();

  // Walk routing once to find phase boundaries.
  let firstRehearsal: string | null = null;
  let lastRehearsal: string | null = null;
  let firstShow: string | null = null;
  let lastShow: string | null = null;

  for (const row of routingRows ?? []) {
    const date = (row.date as string | null)?.slice(0, 10);
    if (!date) continue;
    const { isRehearsal, isShow } = classifyDayType(
      row.day_type as string | null,
    );
    if (isRehearsal) {
      if (firstRehearsal === null) firstRehearsal = date;
      // Rehearsal still counts as the "last rehearsal" only if no show has
      // started yet — once the tour hits its first show, subsequent rehearsals
      // belong to the show-days span.
      if (firstShow === null) lastRehearsal = date;
    }
    if (isShow) {
      if (firstShow === null) firstShow = date;
      lastShow = date;
    }
  }

  const phases: TourPhase[] = [];

  // ----- Pre-Prod -----
  // Spans tour.start_date up to the day before the first
  // rehearsal/show. Zero-day or negative spans are represented as
  // start === end (one day) with the caller free to render muted.
  const preProdEnd =
    firstRehearsal ?? firstShow ?? tourEnd; // fallback to tour end if neither
  const preProdEndExclusive = preProdEnd === tourStart
    ? tourStart
    : shiftDate(preProdEnd, -1);
  phases.push({
    key: 'pre-prod',
    label: 'Pre-Prod',
    startDate: tourStart,
    endDate:
      // If preProdEndExclusive < tourStart, collapse to a single day.
      preProdEndExclusive < tourStart ? tourStart : preProdEndExclusive,
    isCurrent: false,
    isPast: false,
  });

  // ----- Rehearsals -----
  if (firstRehearsal && lastRehearsal) {
    phases.push({
      key: 'rehearsals',
      label: 'Rehearsals',
      startDate: firstRehearsal,
      endDate: lastRehearsal,
      isCurrent: false,
      isPast: false,
    });
  }

  // ----- Show Days -----
  if (firstShow && lastShow) {
    phases.push({
      key: 'show-days',
      label: 'Show Days',
      startDate: firstShow,
      endDate: lastShow,
      isCurrent: false,
      isPast: false,
    });
  } else {
    // Planning-only tour: placeholder Show Days span over the
    // remaining tour window after rehearsals (or after Pre-Prod if
    // no rehearsals either).
    const showStart = lastRehearsal
      ? shiftDate(lastRehearsal, 1)
      : tourStart;
    phases.push({
      key: 'show-days',
      label: 'Show Days',
      startDate: showStart > tourEnd ? tourEnd : showStart,
      endDate: tourEnd,
      isCurrent: false,
      isPast: false,
      isPlaceholder: true,
    });
  }

  // ----- Wrap -----
  const lastPhaseEnd = lastShow ?? phases[phases.length - 1].endDate;
  const wrapStart = shiftDate(lastPhaseEnd, 1);
  // If the tour's end_date is the same as (or before) the last show,
  // give Wrap a 14-day default tail so it isn't a zero-day phase.
  const wrapEnd =
    tourEnd >= wrapStart ? tourEnd : shiftDate(lastPhaseEnd, 14);
  phases.push({
    key: 'wrap',
    label: 'Wrap',
    startDate: wrapStart,
    endDate: wrapEnd,
    isCurrent: false,
    isPast: false,
  });

  // Compute isCurrent / isPast against today.
  for (const phase of phases) {
    phase.isCurrent = phase.startDate <= today && today <= phase.endDate;
    phase.isPast = phase.endDate < today;
  }

  return phases;
}

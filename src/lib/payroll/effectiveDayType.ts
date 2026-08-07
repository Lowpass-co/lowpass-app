/* ============================================
   LOWPASS — Payroll effective day-type + brush mapping (pure SSOT)

   The day-type OVERRIDE drives pay. The pay engine reads a person-day's
   EFFECTIVE day type = type_override ?? tour_day_type, maps it to a payroll
   status and bills that status' rate. There is ONE pay path: the effective
   status lands in `payroll_entries.day_statuses[date]` (via the days-matrix
   brush) and flows through countDayStatuses → fees.ts.

   CANONICAL MODEL (migration 261, Adam's rulings 2026-08-07):
     show        — bills Show rate (+ Flat day) · per diem
     travel      — bills Travel rate (+ Flat day) · per diem
                   ('off_travel' is the legacy spelling — same bucket, never
                   rewritten; new paints write 'travel')
     rehearsal   — bills Rehearsal rate (+ Flat day) · per diem
     promo_radio — bills Press/Radio when set, else Show (the Dillon ruling
                   as the default; resolved in rateLines.resolvePersonLines)
     off         — ON TOUR, day off: bills the TRAVEL rate ("OFF should pay
                   travel rate") and counts as worked for Flat day · PD yes
     pd_only     — the ONE no-fee day on tour: per diem only
     no_tour     — not on the tour that day: nothing (the ONLY no-PD day)

   MONEY DELTAS vs the pre-261 model (they follow directly from Adam's spec —
   flagged, not hidden). Off days keep billing the travel rate, so day-to-day
   Off/Travel money does NOT move. What moves, tour-default only:
     - press/radio/tv routing days used to resolve to off_travel (travel
       rate); they now resolve to 'promo_radio' → show rate (or the person's
       Press/Radio rate when set).
     - 'rehearsal' routing days used to collapse to off_travel; they now
       resolve to 'rehearsal' and bill the Rehearsal rate.
   Painted (persisted) days are untouched — only the tour-default resolution
   of unpainted days changes.

   This module is the SINGLE source of truth for that mapping so the money
   harness (node, cannot import the 'use client' usePayrollGrid) and the
   client brush agree to the letter. Pure — no 'use client', no imports.
   ============================================ */

/** The payroll statuses fees.ts bills. 'no_tour' contributes nothing;
 *  'off_travel' is the legacy spelling of 'travel' (same bucket). */
export type PayStatus = 'show' | 'travel' | 'off_travel' | 'rehearsal' | 'promo_radio' | 'off' | 'pd_only' | 'no_tour';

/** A routing/tour day type → its payroll status (the tour-default half of
 *  the effective resolution). */
export function dayTypeToPayStatus(dayType: string | undefined | null): PayStatus {
  const t = (dayType ?? '').toLowerCase().trim();
  if (t === 'show' || t === 'festival') return 'show';
  if (t === 'travel') return 'travel';
  if (t === 'rehearsal') return 'rehearsal';
  if (['press', 'radio', 'tv', 'promo'].includes(t)) return 'promo_radio';
  if (t === 'off') return 'off';
  return 'no_tour';
}

/** The day-type brush palette (Adam's pin). `tour_default` clears the override
 *  (inherit the routing day type); the rest are explicit person-day overrides.
 *  `pd_only` is the per-diem-only day ("a PD type that only pays pd");
 *  `no_tour` marks a person as NOT on the tour that day — the only unpaid-PD
 *  state (Adam: "NO TOUR is the only day not paid a PD"). */
export type BrushType = 'tour_default' | 'show' | 'rehearsal' | 'travel' | 'off' | 'promo_radio' | 'pd_only' | 'no_tour';

export const BRUSH_TYPES: { value: BrushType; label: string }[] = [
  { value: 'tour_default', label: 'Tour default' },
  { value: 'show', label: 'Show' },
  { value: 'rehearsal', label: 'Rehearsal' },
  { value: 'travel', label: 'Travel' },
  { value: 'promo_radio', label: 'Promo / Radio' },
  { value: 'off', label: 'Off' },
  { value: 'pd_only', label: 'PD' },
  { value: 'no_tour', label: 'No tour' },
];

/** Resolve a brush selection to the pay status it paints for a given tour day.
 *  Every brush except `tour_default` is a literal status now — the canonical
 *  model gave each brush its own billable status. */
export function brushTypeToStatus(brush: BrushType, tourDayType: string | undefined | null): PayStatus {
  switch (brush) {
    case 'tour_default':
      return dayTypeToPayStatus(tourDayType);
    case 'show':
      return 'show';
    case 'rehearsal':
      return 'rehearsal';
    case 'travel':
      return 'travel';
    case 'off':
      return 'off';
    case 'promo_radio':
      return 'promo_radio';
    case 'pd_only':
      return 'pd_only';
    case 'no_tour':
      return 'no_tour';
    default:
      return 'no_tour';
  }
}

const PAY_STATUSES: ReadonlySet<string> = new Set([
  'show', 'travel', 'off_travel', 'rehearsal', 'promo_radio', 'off', 'pd_only', 'no_tour',
]);

/** THE effective-day-type resolution for pay: type_override ?? tour_day_type,
 *  as a payroll status. `override` is a persisted day_statuses value (already a
 *  pay status) when the person-day was painted; null/undefined inherits the
 *  tour day type. */
export function effectiveStatus(
  override: PayStatus | string | null | undefined,
  tourDayType: string | undefined | null,
): PayStatus {
  if (typeof override === 'string' && PAY_STATUSES.has(override)) {
    return override as PayStatus;
  }
  return dayTypeToPayStatus(tourDayType);
}

/** The full effective day-status map for one person across the tour: for each
 *  routing date, the persisted paint if present, else the tour-default. This is
 *  what EVERY money reader must count — counting only the persisted map
 *  undercounts tour-default days (the pre-261 "Rates totals ≠ matrix" bug). */
export function effectiveStatuses(
  routingDates: ReadonlyArray<{ date: string; day_type?: string | null }>,
  persisted: Record<string, string> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of routingDates) {
    const date = (r.date ?? '').slice(0, 10);
    if (!date) continue;
    out[date] = effectiveStatus(persisted?.[date], r.day_type);
  }
  return out;
}

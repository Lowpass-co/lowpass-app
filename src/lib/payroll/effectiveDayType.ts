/* ============================================
   LOWPASS — Payroll effective day-type + brush mapping (pure SSOT)

   G2-1, Ruling A: the day-type OVERRIDE drives pay. The pay engine reads a
   person-day's EFFECTIVE day type = type_override ?? tour_day_type, maps it to a
   payroll status (show / off_travel / rehearsal / no_tour) and bills that status'
   rate. There is ONE pay path: the effective status lands in
   `payroll_entries.day_statuses[date]` (via the days-matrix brush) and flows
   through countDayStatuses → fees.ts, exactly like every other painted day.

   This module is the SINGLE source of truth for that mapping so the money
   harness (node, cannot import the 'use client' usePayrollGrid) and the client
   brush agree to the letter. Pure — no 'use client', no imports.
   ============================================ */

/** The payroll statuses fees.ts bills. 'no_tour' contributes £0. */
export type PayStatus = 'show' | 'off_travel' | 'rehearsal' | 'no_tour';

/** A routing/tour day type → its payroll status. Mirrors the legacy
 *  dayTypeToStatus (usePayrollGrid / generate) so a tour-default day bills
 *  exactly as it does today. rehearsal collapses to off_travel here because
 *  that is the historical tour-day behaviour; the BRUSH exposes an explicit
 *  Rehearsal that bills the rehearsal rate (see brushTypeToStatus). */
export function dayTypeToPayStatus(dayType: string | undefined | null): PayStatus {
  const t = (dayType ?? '').toLowerCase().trim();
  if (t === 'show' || t === 'festival') return 'show';
  if (['off', 'travel', 'press', 'radio', 'tv', 'rehearsal'].includes(t)) return 'off_travel';
  return 'no_tour';
}

/** The day-type brush palette (Adam's pin). `tour_default` clears the override
 *  (inherit the routing day type); the rest are explicit person-day overrides. */
export type BrushType = 'tour_default' | 'show' | 'rehearsal' | 'travel' | 'off' | 'promo_radio';

export const BRUSH_TYPES: { value: BrushType; label: string }[] = [
  { value: 'tour_default', label: 'Tour default' },
  { value: 'show', label: 'Show' },
  { value: 'rehearsal', label: 'Rehearsal' },
  { value: 'travel', label: 'Travel' },
  { value: 'off', label: 'Off' },
  { value: 'promo_radio', label: 'Promo / Radio' },
];

/** Resolve a brush selection to the pay status it paints for a given tour day.
 *  Ruling A: a Promo/Radio appearance is a performance — it bills the SHOW rate
 *  (Dillon's radio-on-a-travel-day pays his show rate). `tour_default` resolves
 *  to the routing day's status (the "?? tour_day_type" half of effective type). */
export function brushTypeToStatus(brush: BrushType, tourDayType: string | undefined | null): PayStatus {
  switch (brush) {
    case 'tour_default':
      return dayTypeToPayStatus(tourDayType);
    case 'show':
      return 'show';
    case 'rehearsal':
      return 'rehearsal';
    case 'travel':
      return 'off_travel';
    case 'off':
      return 'no_tour';
    case 'promo_radio':
      return 'show';
    default:
      return 'no_tour';
  }
}

/** THE effective-day-type resolution for pay: type_override ?? tour_day_type,
 *  as a payroll status. `override` is a persisted day_statuses value (already a
 *  pay status) when the person-day was painted; null/undefined inherits the tour
 *  day type. The days-matrix persists the resolved status, so the pay readers
 *  keep reading day_statuses directly — this is the one place that documents the
 *  resolution the persisted value represents. */
export function effectiveStatus(
  override: PayStatus | string | null | undefined,
  tourDayType: string | undefined | null,
): PayStatus {
  if (override === 'show' || override === 'off_travel' || override === 'rehearsal' || override === 'no_tour') {
    return override;
  }
  return dayTypeToPayStatus(tourDayType);
}

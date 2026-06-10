/* ============================================
   LOWPASS — canonical day-type token map + colour resolver

   ONE home for "day_type string → brand colour token". Previously duplicated
   in AdvanceOverview.tsx (DAY_TYPE_TOKEN) and TourOverviewClient.tsx
   (DAY_TYPE_COLOUR) — both now import from here. Colours reference the
   var(--lp-day-*) aliases (→ --color-lp-day-*); see src/app/globals.css.

   `day_type` is free TEXT (no DB CHECK) and may be a CSV ("show,festival")
   or a user-defined custom type (tours.custom_day_types). Resolution always
   takes the FIRST type and falls back to the `off` token, so unknown / custom
   / multi values never crash or render blank.
   ============================================ */

import { firstDayType, getDayTypeLabel } from '@/lib/utils';

/** Canonical day-type → CSS colour token. Keyed by the 8 known types. */
export const DAY_TYPE_TOKEN: Record<string, string> = {
  show: 'var(--lp-day-show)',
  festival: 'var(--lp-day-festival)',
  travel: 'var(--lp-day-travel)',
  off: 'var(--lp-day-off)',
  rehearsal: 'var(--lp-day-rehearsal)',
  press: 'var(--lp-day-press)',
  radio: 'var(--lp-day-radio)',
  tv: 'var(--lp-day-tv)',
};

/** Resolve a (possibly CSV / custom / empty) day_type to a colour token. */
export function colourForDayType(dayTypeCsv: string | null | undefined): string {
  if (!dayTypeCsv) return DAY_TYPE_TOKEN.off;
  const first = (firstDayType(dayTypeCsv) || '').toLowerCase();
  return DAY_TYPE_TOKEN[first] ?? DAY_TYPE_TOKEN.off;
}

/** Human label for the FIRST type in a (possibly CSV) day_type. */
export function labelForDayType(dayTypeCsv: string | null | undefined): string {
  if (!dayTypeCsv) return '';
  return getDayTypeLabel((firstDayType(dayTypeCsv) || '').toLowerCase());
}

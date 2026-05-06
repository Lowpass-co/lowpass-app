/* ============================================
   LOWPASS — Sprint 8.1 §1 — formatTourKeyStat()

   Formats the per-product key stat string the switcher trigger
   shows as a third dot-segment on tour-scoped pages. Pages
   compute their stats anyway for the TourHeader; this helper
   keeps the formatting logic shared so the trigger and any
   future consumer pull from one source.

   Returns null when:
   - product is unknown
   - the relevant stat field is missing / out of range

   Format conventions match the now-deleted compressed bar:
     budget     → "{N}% SPENT"
     advance    → "{N}% COMPLETE"
     operations → "{N} CREW"
   ============================================ */

export type TourKeyStatProduct = 'budget' | 'advance' | 'operations';

export interface TourKeyStatInput {
  spentPercent?: number | null;
  advanceCompletePercent?: number | null;
  crewCount?: number | null;
}

export function formatTourKeyStat(
  product: TourKeyStatProduct,
  stats: TourKeyStatInput,
): string | null {
  if (product === 'budget' && stats.spentPercent != null) {
    return `${Math.round(stats.spentPercent)}% SPENT`;
  }
  if (
    product === 'advance' &&
    stats.advanceCompletePercent != null
  ) {
    return `${Math.round(stats.advanceCompletePercent)}% COMPLETE`;
  }
  if (
    product === 'operations' &&
    stats.crewCount != null &&
    stats.crewCount > 0
  ) {
    return `${stats.crewCount} CREW`;
  }
  return null;
}

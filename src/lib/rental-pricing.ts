/**
 * Equipment rental pricing helpers (Lowpass).
 */

/** Day rate = 1% of purchase / replacement value (rounded to cents). */
export function dayRateFromPurchase(purchase: number | null | undefined): number | null {
  if (purchase == null || !(purchase > 0)) return null;
  return Math.round(purchase * 0.01 * 100) / 100;
}

/**
 * Billable rental days (3-day week): each full 7-day calendar span counts as 3 rental days;
 * leftover days count 1:1. Inclusive of start and end dates.
 * Example: 30 calendar days (4×7 + 2) → 4×3 + 2 = 14 billable days.
 */
export function calcRentalBillableDays(start: string | null, end: string | null): number {
  if (!start || !end) return 1;
  const msPerDay = 86400000;
  const inclusiveCalendarDays =
    Math.round((new Date(end).getTime() - new Date(start).getTime()) / msPerDay) + 1;
  const calendarDays = Math.max(1, inclusiveCalendarDays);
  const fullWeeks = Math.floor(calendarDays / 7);
  const remainder = calendarDays % 7;
  const billable = fullWeeks * 3 + remainder;
  return Math.max(1, billable);
}

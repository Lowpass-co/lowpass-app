/**
 * Equipment rental pricing helpers (Lowpass).
 */

/** Day rate = 1% of purchase / replacement value (rounded to cents). */
export function dayRateFromPurchase(purchase: number | null | undefined): number | null {
  if (purchase == null || !(purchase > 0)) return null;
  return Math.round(purchase * 0.01 * 100) / 100;
}

export type DayRateManualFields = {
  day_rate_manual?: boolean | null;
  purchase_cost: number | null;
  day_rate: number | null;
};

/**
 * True when the user chose a custom day rate (not the automatic 1% of purchase).
 * Uses DB flag when set; otherwise infers from legacy rows (before day_rate_manual existed).
 */
export function isDayRateManual(item: DayRateManualFields): boolean {
  if (item.day_rate_manual === true) return true;
  if (item.day_rate_manual === false) return false;
  const p = item.purchase_cost;
  if (p == null || !(p > 0)) return item.day_rate != null && item.day_rate > 0;
  const auto = dayRateFromPurchase(p);
  if (auto == null) return true;
  if (item.day_rate == null) return false;
  return Math.abs(Number(item.day_rate) - auto) > 0.005;
}

/** Rate used for pricing / display: 1% of purchase when not manual, else stored day_rate. */
export function effectiveInventoryDayRate(item: DayRateManualFields): number | null {
  if (isDayRateManual(item)) return item.day_rate;
  const p = item.purchase_cost;
  if (p != null && p > 0) return dayRateFromPurchase(p);
  return item.day_rate;
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

/**
 * Equipment rental pricing helpers (Lowpass).
 */

/**
 * Percentage of purchase / replacement value charged per rental day.
 * Changed 1% → 3% on 2026-07-23 (Adam). Single source of truth — do not
 * inline the number anywhere else; isDayRateManual() below depends on
 * agreeing with this exactly.
 */
export const DAY_RATE_PCT_OF_VALUE = 0.03;

/** Day rate = DAY_RATE_PCT_OF_VALUE of purchase / replacement value (rounded to cents). */
export function dayRateFromPurchase(purchase: number | null | undefined): number | null {
  if (purchase == null || !(purchase > 0)) return null;
  return Math.round(purchase * DAY_RATE_PCT_OF_VALUE * 100) / 100;
}

export type DayRateManualFields = {
  day_rate_manual?: boolean | null;
  purchase_cost: number | null;
  day_rate: number | null;
};

/**
 * True when the user chose a custom day rate (not the automatic percentage of purchase).
 * Uses DB flag when set; otherwise infers from legacy rows (before day_rate_manual existed).
 *
 * ⚠️ RATE-CHANGE HAZARD (read before changing DAY_RATE_PCT_OF_VALUE again).
 * The inference branch compares the stored day_rate against the CURRENT auto value.
 * When the percentage changes, every legacy row (day_rate_manual IS NULL) whose
 * day_rate was auto-generated under the OLD percentage stops matching, so it is
 * inferred as MANUAL and keeps its old price forever. Rows with day_rate_manual
 * explicitly false are unaffected — the flag wins and they re-derive at the new rate.
 *
 * For the 1% → 3% change this cost nothing: Adam's audit found all 33 inventory
 * rows carry day_rate_manual = false and none were legacy-inferred, so no
 * backfill and no migration were needed. That makes this branch DEAD CODE for
 * real data today — kept as the safety net for a row arriving with a NULL flag
 * (a direct SQL insert, a future import path), not because anything relies on
 * it. Re-run the audit in CC_EQUIPMENT_QUOTE.md before the next rate change;
 * the cost is a property of the data, not of the code.
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

/** Rate used for pricing / display: DAY_RATE_PCT_OF_VALUE of purchase when not manual, else stored day_rate. */
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

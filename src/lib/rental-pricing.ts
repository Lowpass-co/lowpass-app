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

/** Days a week is charged as when nothing else says — the trade's "3-day
 *  week" (Adam, Nov 2026: "should be 3 day week, but customisable"). The
 *  workspace default (workspaces.rental_days_per_week) and a job's own
 *  days_per_week override it. */
export const DEFAULT_DAYS_PER_WEEK = 3;

/** The week lengths offered (7 = no week rate). */
export const WEEK_CHOICES = [2, 2.5, 3, 3.5, 4, 5, 7] as const;

/** A usable week length: 1–7 days (half days allowed), else the default. */
export function weekLength(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 7 ? Math.round(n * 2) / 2 : DEFAULT_DAYS_PER_WEEK;
}

/** The job's week: its own setting, else the workspace's, else 3. */
export function jobDaysPerWeek(job: { days_per_week?: number | string | null }, workspaceDefault?: number | string | null): number {
  if (job.days_per_week != null) return weekLength(job.days_per_week);
  return weekLength(workspaceDefault ?? DEFAULT_DAYS_PER_WEEK);
}

/** Billable days for a hire from `start` to `end` inclusive: every full 7
 *  calendar days costs one WEEK (`daysPerWeek` days), and the days left over
 *  cost one each — but never more than a week. Nov 2026 fix: leftovers were
 *  uncapped, so a 6-day hire cost 6 days while a 7-day hire cost 3. */
export function calcRentalBillableDays(start: string | null, end: string | null, daysPerWeek: number = DEFAULT_DAYS_PER_WEEK): number {
  const week = weekLength(daysPerWeek);
  if (!start || !end) return 1;
  const msPerDay = 86400000;
  const inclusiveCalendarDays =
    Math.round((new Date(end).getTime() - new Date(start).getTime()) / msPerDay) + 1;
  const calendarDays = Math.max(1, inclusiveCalendarDays);
  const fullWeeks = Math.floor(calendarDays / 7);
  const remainder = calendarDays % 7;
  const billable = fullWeeks * week + Math.min(remainder, week);
  return Math.max(1, billable);
}

/* ============================================
   LOWPASS — Payroll fee math (single source of truth)

   Used by every surface that computes a payroll total so they can never
   disagree (OPS-17a/b):
     - <PayrollSummary>            (display)
     - <PayrollWeekSheet>          (weekly display)
     - POST /api/budget/payroll    (persists total_fee / total_per_diem)
     - reconcileDerivedBudgetLines (budget Salary / Per-Diem section)

   ─────────────────────────────────────────────────────────────────────
   EXTENSIBLE RATE MODEL (b2, migration 228)
   ─────────────────────────────────────────────────────────────────────
   The totals are now a sum over a person's RATE LINES, each of which has:
     - bucket : 'fee'      → contributes to total_fee
               'per_diem'  → contributes to total_per_diem (kept separate)
     - basis  : 'per_day_status' → amount × (days whose status ∈ dayStatuses)
               'per_active_day'  → amount × active days (every engaged day)
               'flat_once'       → amount × 1 (the advance rule)

   The four legacy hardcoded rates map onto five default lines:
     show_rate      → fee   / per_day_status ['show']
     off_rate       → fee   / per_day_status ['off_travel']   (the travel rate)
     rehearsal_rate → fee   / per_day_status ['rehearsal']
     per_diem       → per_diem / per_active_day
     advance_fee    → fee   / flat_once

   THE MONEY INVARIANT: the legacy computeTotalFee / computeTotalPerDiem
   below now DELEGATE to the new engine via ratesToLines(). The arithmetic
   is byte-for-byte the same operations in the same order, so the redesign
   moves no money — proven by src/lib/payroll/reconcile.harness.ts against
   the fees.test.ts numbers.

   There is NO "use show_rate when off_rate is 0" fallback — travel days
   bill at the travel (off) rate exactly. So show_rate 300 with off_rate 0
   over 21 show + 10 travel days = £6,300 (NOT £9,300). Pure module (no
   'use client', no imports) so server + client both import it.
   ============================================ */

export interface RateLike {
  show_rate?: number | string | null;
  off_rate?: number | string | null;
  rehearsal_rate?: number | string | null;
  per_diem?: number | string | null;
}

export interface DayCounts {
  show: number;
  offTravel: number;
  rehearsal: number;
  /** show + offTravel + rehearsal (every day the person is engaged). */
  active: number;
  /** G2-1 — distinct Monday-start weeks among the active days, for `per_week`
   *  (Weekly) rates. Optional so existing DayCounts literals still typecheck;
   *  absent ⇒ 0 weeks (no per_week line can bill without it). */
  weeks?: number;
}

/** The three day statuses a `per_day_status` line can bill. */
export type DayStatus = 'show' | 'off_travel' | 'rehearsal';
export type RateBucket = 'fee' | 'per_diem';
/** G2-1 adds `per_week` (Weekly rate). `flat_once` doubles as the Flat-tour fee.
 *  Per-diem-only is just a per_diem bucket line with no fee lines — no new basis. */
export type RateBasis = 'per_day_status' | 'per_active_day' | 'flat_once' | 'per_week';

/** One priced line for a person on a tour (a personnel_rate_lines row +
 *  its rate_type's bucket/basis/day_statuses). */
export interface RateLine {
  bucket: RateBucket;
  basis: RateBasis;
  amount: number | string | null;
  /** Which statuses a `per_day_status` line bills. Ignored otherwise. */
  dayStatuses?: DayStatus[] | null;
}

export interface PayrollTotals {
  totalFee: number;
  totalPerDiem: number;
}

const num = (v: unknown): number => Number(v) || 0;

/** The Monday (ISO week start) of a 'YYYY-MM-DD' date, as a date string. Pure
 *  (UTC math, no imports) so fees.ts stays server+client safe. */
function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  const dow = d.getUTCDay(); // 0=Sun … 6=Sat
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().slice(0, 10);
}

/** Tally a payroll_entries.day_statuses map into per-type day counts + the
 *  distinct active weeks. ('no_tour' and anything unknown are ignored.) */
export function countDayStatuses(
  statuses: Record<string, string> | null | undefined,
): DayCounts {
  let show = 0;
  let offTravel = 0;
  let rehearsal = 0;
  const activeWeeks = new Set<string>();
  for (const [date, v] of Object.entries(statuses ?? {})) {
    let active = false;
    if (v === 'show') { show++; active = true; }
    else if (v === 'off_travel') { offTravel++; active = true; }
    else if (v === 'rehearsal') { rehearsal++; active = true; }
    if (active) activeWeeks.add(mondayOf(date));
  }
  return { show, offTravel, rehearsal, active: show + offTravel + rehearsal, weeks: activeWeeks.size };
}

/** Days a status covers, from the counts. */
function daysForStatus(status: DayStatus, counts: DayCounts): number {
  if (status === 'show') return counts.show;
  if (status === 'off_travel') return counts.offTravel;
  if (status === 'rehearsal') return counts.rehearsal;
  return 0;
}

/** The value of ONE rate line for a person's day counts. Pure. */
export function computeLineAmount(line: RateLine, counts: DayCounts): number {
  const amount = num(line.amount);
  switch (line.basis) {
    case 'per_day_status': {
      let days = 0;
      for (const s of line.dayStatuses ?? []) days += daysForStatus(s, counts);
      return amount * days;
    }
    case 'per_active_day':
      return amount * counts.active;
    case 'flat_once':
      return amount * 1;
    case 'per_week':
      return amount * (counts.weeks ?? 0);
    default:
      return 0;
  }
}

/** THE engine: sum a person's rate lines into fee + per-diem totals,
 *  keeping the two buckets separate (today's split, preserved). */
export function computeTotals(lines: RateLine[], counts: DayCounts): PayrollTotals {
  let totalFee = 0;
  let totalPerDiem = 0;
  for (const line of lines) {
    const value = computeLineAmount(line, counts);
    if (line.bucket === 'per_diem') totalPerDiem += value;
    else totalFee += value;
  }
  return { totalFee, totalPerDiem };
}

/**
 * Map the four legacy hardcoded rates (+ advance) onto the five default
 * rate lines, in the order that reproduces the legacy sum exactly. This is
 * the bridge that lets every existing caller keep the same numbers while
 * the engine becomes extensible.
 */
export function ratesToLines(
  rate: RateLike,
  advanceFee: number | string | null = 0,
): RateLine[] {
  return [
    { bucket: 'fee', basis: 'per_day_status', dayStatuses: ['show'], amount: rate.show_rate ?? 0 },
    { bucket: 'fee', basis: 'per_day_status', dayStatuses: ['off_travel'], amount: rate.off_rate ?? 0 },
    { bucket: 'fee', basis: 'per_day_status', dayStatuses: ['rehearsal'], amount: rate.rehearsal_rate ?? 0 },
    { bucket: 'per_diem', basis: 'per_active_day', amount: rate.per_diem ?? 0 },
    { bucket: 'fee', basis: 'flat_once', amount: advanceFee ?? 0 },
  ];
}

/** total_fee = Σ(day-type days × that day-type's rate) + advance_fee.
 *  Delegates to the engine — identical arithmetic, proven equivalent. */
export function computeTotalFee(
  rate: RateLike,
  counts: DayCounts,
  advanceFee: number | string | null = 0,
): number {
  return computeTotals(ratesToLines(rate, advanceFee), counts).totalFee;
}

/** total_per_diem = every engaged day × per_diem rate. Delegates. */
export function computeTotalPerDiem(rate: RateLike, counts: DayCounts): number {
  return computeTotals(ratesToLines(rate), counts).totalPerDiem;
}

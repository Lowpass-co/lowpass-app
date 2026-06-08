/* ============================================
   LOWPASS — Payroll fee math (single source of truth)

   Used by every surface that computes a payroll total so they can never
   disagree (OPS-17a/b):
     - <PayrollSummary>            (display)
     - <PayrollWeekSheet>          (weekly display)
     - POST /api/budget/payroll    (persists total_fee / total_per_diem)
     - reconcileDerivedBudgetLines (budget Salary / Per-Diem section)

   Fee splits BY DAY TYPE:
     total_fee = show_days      × show_rate
               + off/travel_days × off_rate        (the "travel rate")
               + rehearsal_days  × rehearsal_rate
               + advance_fee
     total_per_diem = (show + off/travel + rehearsal) × per_diem

   There is NO "use show_rate when off_rate is 0" fallback — travel days
   bill at the travel (off) rate exactly. So show_rate 300 with off_rate 0
   over 21 show + 10 travel days = £6,300 (NOT £9,300). This is pure (no
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
}

const num = (v: unknown): number => Number(v) || 0;

/** Tally a payroll_entries.day_statuses map into per-type day counts.
 *  ('no_tour' and anything unknown are ignored.) */
export function countDayStatuses(
  statuses: Record<string, string> | null | undefined,
): DayCounts {
  let show = 0;
  let offTravel = 0;
  let rehearsal = 0;
  for (const v of Object.values(statuses ?? {})) {
    if (v === 'show') show++;
    else if (v === 'off_travel') offTravel++;
    else if (v === 'rehearsal') rehearsal++;
  }
  return { show, offTravel, rehearsal, active: show + offTravel + rehearsal };
}

/** total_fee = Σ(day-type days × that day-type's rate) + advance_fee. */
export function computeTotalFee(
  rate: RateLike,
  counts: DayCounts,
  advanceFee: number | string | null = 0,
): number {
  return (
    counts.show * num(rate.show_rate) +
    counts.offTravel * num(rate.off_rate) +
    counts.rehearsal * num(rate.rehearsal_rate) +
    num(advanceFee)
  );
}

/** total_per_diem = every engaged day × per_diem rate. */
export function computeTotalPerDiem(rate: RateLike, counts: DayCounts): number {
  return counts.active * num(rate.per_diem);
}

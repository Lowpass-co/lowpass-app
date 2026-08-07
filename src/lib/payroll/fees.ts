/* ============================================
   LOWPASS — Payroll fee math (single source of truth)

   Used by every surface that computes a payroll total so they can never
   disagree (OPS-17a/b):
     - <PayrollDaysMatrix> / Rates grid  (display)
     - POST /api/budget/payroll          (persists total_fee / total_per_diem)
     - reconcileDerivedBudgetLines       (budget Salary / Per-Diem section)
     - payroll exports

   ─────────────────────────────────────────────────────────────────────
   CANONICAL RATE MODEL (Adam's flat-seven, migration 261 — 2026-08-07)
   ─────────────────────────────────────────────────────────────────────
   The totals are a sum over a person's RATE LINES, each of which has:
     - bucket : 'fee'      → contributes to total_fee
               'per_diem'  → contributes to total_per_diem (kept separate)
     - basis  : 'per_day_status'   → amount × (days whose status ∈ dayStatuses,
                                     de-duped by COUNT BUCKET — a type listing
                                     both 'off_travel' and 'travel' bills each
                                     travel day exactly once)
               'per_active_day'    → amount × WORKED days (show/travel/
                                     rehearsal/promo — the Flat day rate)
               'per_assigned_day'  → amount × ASSIGNED days (worked + off —
                                     everything except no_tour; per diem)
               'flat_once'         → amount × 1 (Flat tour, Advance)
               'per_week'          → amount × distinct active Mon-weeks
                                     (legacy Weekly — no longer loaded)

   DAY STATUSES (payroll_entries.day_statuses values):
     'show'        — bills Show (+ Flat day) · per diem
     'travel'      — bills Travel (+ Flat day) · per diem
     'off_travel'  — LEGACY value for travel; identical billing, never rewritten
     'rehearsal'   — bills Rehearsal (+ Flat day) · per diem
     'promo_radio' — bills Press/Radio when set, else Show (Dillon ruling;
                     resolved in rateLines.resolvePersonLines) (+ Flat day) · PD
     'off'         — on tour, day off: bills the TRAVEL rate (Adam: "OFF should
                     pay travel rate") and counts as a worked day for Flat day
                     · per diem
     'pd_only'     — the ONE no-fee day on tour: per diem only, no fee, not a
                     worked day (Adam: "a PD type that only pays pd")
     'no_tour'     — not on the tour that day: nothing (the ONLY no-PD day)

   Show-only people need no special case: with Show set and Travel/Flat day
   blank, travel/off days bill a £0 travel line — only shows pay, every
   assigned day still earns PD. Pinned in reconcile.harness.ts.

   STACKING (Adam's ruling): every filled rate bills independently — Flat day
   sums WITH Show/Travel/Rehearsal/Press when both are set. The grid warns on
   that combination; the engine never silently drops a line.

   THE MONEY INVARIANT: for legacy data (statuses only show/off_travel/
   rehearsal/no_tour, promo painted as 'show', no 'off' days) every number is
   unchanged: travel bills the same, per diem's assigned == active, and the
   legacy computeTotalFee / computeTotalPerDiem delegate to the same engine —
   proven by src/lib/payroll/reconcile.harness.ts + fees.test.ts.

   There is NO "use show_rate when the travel rate is 0" fallback — travel
   days bill at the travel rate exactly. Pure module (no 'use client', no
   imports) so server + client both import it.
   ============================================ */

export interface RateLike {
  show_rate?: number | string | null;
  off_rate?: number | string | null;
  rehearsal_rate?: number | string | null;
  per_diem?: number | string | null;
}

export interface DayCounts {
  show: number;
  /** Travel days — counts BOTH the legacy 'off_travel' value and 'travel'. */
  offTravel: number;
  rehearsal: number;
  /** Promo / radio days ('promo_radio'). Legacy promo paints are stored as
   *  'show' and count there — indistinguishable by design (Ruling A era). */
  promo?: number;
  /** Painted 'off' days — on tour, day off. Bills the Travel rate + Flat day
   *  (its own bucket only so the matrix can show O separately from T). */
  off?: number;
  /** Painted 'pd_only' days — per diem only, no fee, not worked. */
  pdOnly?: number;
  /** WORKED days: show + travel + rehearsal + promo + off. (Flat day bills
   *  these — an Off day pays like a travel day, per Adam's ruling.) */
  active: number;
  /** ASSIGNED days: active + pdOnly — everything except no_tour. (Per diem.) */
  assigned?: number;
  /** Distinct Monday-start weeks among the active days, for `per_week`
   *  (legacy Weekly). Absent ⇒ 0 weeks. */
  weeks?: number;
}

/** The day statuses a `per_day_status` line can bill. 'off_travel' and
 *  'travel' are the same bucket (legacy + canonical spelling); 'off' is its
 *  own bucket that the Travel type ALSO lists (off pays the travel rate). */
export type DayStatus = 'show' | 'off_travel' | 'travel' | 'rehearsal' | 'promo_radio' | 'off' | 'pd_only';
export type RateBucket = 'fee' | 'per_diem';
export type RateBasis = 'per_day_status' | 'per_active_day' | 'per_assigned_day' | 'flat_once' | 'per_week';

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

/** Tally a payroll_entries.day_statuses map into per-type day counts.
 *  ('no_tour' and anything unknown are ignored — no fee, no per diem.) */
export function countDayStatuses(
  statuses: Record<string, string> | null | undefined,
): DayCounts {
  let show = 0;
  let offTravel = 0;
  let rehearsal = 0;
  let promo = 0;
  let off = 0;
  let pdOnly = 0;
  const activeWeeks = new Set<string>();
  for (const [date, v] of Object.entries(statuses ?? {})) {
    let worked = false;
    if (v === 'show') { show++; worked = true; }
    else if (v === 'off_travel' || v === 'travel') { offTravel++; worked = true; }
    else if (v === 'rehearsal') { rehearsal++; worked = true; }
    else if (v === 'promo_radio') { promo++; worked = true; }
    else if (v === 'off') { off++; worked = true; } // off pays like travel — a worked day
    else if (v === 'pd_only') { pdOnly++; }
    if (worked) activeWeeks.add(mondayOf(date));
  }
  const active = show + offTravel + rehearsal + promo + off;
  return { show, offTravel, rehearsal, promo, off, pdOnly, active, assigned: active + pdOnly, weeks: activeWeeks.size };
}

/** A status → its COUNT BUCKET. Lines listing several spellings of the same
 *  bucket (e.g. ['off_travel','travel']) bill each day exactly once; disjoint
 *  buckets on one line (e.g. Travel's ['off_travel','travel','off']) sum. */
type CountBucket = 'show' | 'offTravel' | 'rehearsal' | 'promo' | 'off' | 'pdOnly';
function statusBucket(status: DayStatus): CountBucket | null {
  if (status === 'show') return 'show';
  if (status === 'off_travel' || status === 'travel') return 'offTravel';
  if (status === 'rehearsal') return 'rehearsal';
  if (status === 'promo_radio') return 'promo';
  if (status === 'off') return 'off';
  if (status === 'pd_only') return 'pdOnly';
  return null;
}

function bucketCount(bucket: CountBucket, counts: DayCounts): number {
  if (bucket === 'show') return counts.show;
  if (bucket === 'offTravel') return counts.offTravel;
  if (bucket === 'rehearsal') return counts.rehearsal;
  if (bucket === 'promo') return counts.promo ?? 0;
  if (bucket === 'off') return counts.off ?? 0;
  if (bucket === 'pdOnly') return counts.pdOnly ?? 0;
  return 0;
}

/** The value of ONE rate line for a person's day counts. Pure. */
export function computeLineAmount(line: RateLine, counts: DayCounts): number {
  const amount = num(line.amount);
  switch (line.basis) {
    case 'per_day_status': {
      const buckets = new Set<CountBucket>();
      for (const s of line.dayStatuses ?? []) {
        const b = statusBucket(s);
        if (b) buckets.add(b);
      }
      let days = 0;
      for (const b of buckets) days += bucketCount(b, counts);
      return amount * days;
    }
    case 'per_active_day':
      return amount * counts.active;
    case 'per_assigned_day':
      return amount * (counts.assigned ?? counts.active);
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
 * the engine stays extensible. (Per diem keeps per_active_day here — legacy
 * data has no 'off' days, so active == assigned and nothing moves.)
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

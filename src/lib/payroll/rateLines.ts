/* ============================================
   LOWPASS — Rate-lines model (extensible payroll rates, b2 UI phase)

   PURE bridge between the DB (migration 228: rate_types + personnel_rate_lines)
   and the fee engine (fees.ts computeTotals). A person's total is computed over
   their RateLines, each = one personnel_rate_lines row married to its rate_type's
   bucket / basis / day_statuses.

   The five DEFAULT_RATE_TYPES below mirror migration 228's seed (ids a1–a5) and
   reproduce ratesToLines() EXACTLY — that equivalence is the money gate proven in
   reconcile.harness.ts (rate-lines totals === legacy-column totals).

   No 'use client', no supabase — server + client + the node harness all import it.
   ============================================ */

import type { DayStatus, RateBucket, RateBasis, RateLine, RateLike } from './fees';

/** The rate_types row shape this model needs (bucket / basis / day_statuses). */
export interface RateTypeMeta {
  id: string;
  name: string;
  bucket: RateBucket;
  basis: RateBasis;
  dayStatuses: DayStatus[];
  orderIndex: number;
}

/** The five seeded defaults (migration 228, ids a1–a5). Kept in sync with the
 *  SQL seed; the harness asserts these reproduce ratesToLines exactly. */
export const DEFAULT_RATE_TYPE_IDS = {
  show: '00000000-0000-0000-0000-0000000000a1',
  offTravel: '00000000-0000-0000-0000-0000000000a2',
  rehearsal: '00000000-0000-0000-0000-0000000000a3',
  perDiem: '00000000-0000-0000-0000-0000000000a4',
  advance: '00000000-0000-0000-0000-0000000000a5',
  // Migration 229 — the day_rate fork resolution: a flat per-active-day fee.
  dayRate: '00000000-0000-0000-0000-0000000000a6',
  // Migration 242 — the two remaining graded rate types (G2-1 rate-type wiring):
  //   flatTour = one lump sum for the whole tour (flat_once);
  //   weekly   = a per-calendar-week fee (per_week — Mon-anchored week count).
  flatTour: '00000000-0000-0000-0000-0000000000a7',
  weekly: '00000000-0000-0000-0000-0000000000a8',
} as const;

export const DEFAULT_RATE_TYPES: RateTypeMeta[] = [
  { id: DEFAULT_RATE_TYPE_IDS.show, name: 'Show', bucket: 'fee', basis: 'per_day_status', dayStatuses: ['show'], orderIndex: 0 },
  { id: DEFAULT_RATE_TYPE_IDS.offTravel, name: 'Off / Travel', bucket: 'fee', basis: 'per_day_status', dayStatuses: ['off_travel'], orderIndex: 1 },
  { id: DEFAULT_RATE_TYPE_IDS.rehearsal, name: 'Rehearsal', bucket: 'fee', basis: 'per_day_status', dayStatuses: ['rehearsal'], orderIndex: 2 },
  { id: DEFAULT_RATE_TYPE_IDS.perDiem, name: 'Per diem', bucket: 'per_diem', basis: 'per_active_day', dayStatuses: [], orderIndex: 3 },
  { id: DEFAULT_RATE_TYPE_IDS.advance, name: 'Advance', bucket: 'fee', basis: 'flat_once', dayStatuses: [], orderIndex: 4 },
  // Day rate (migration 229): flat per engaged day — off_rate × active days. This
  // is how a `day_rate` person is priced under the rate-lines model (their split
  // Show/Off/Rehearsal lines are removed by 229's corrective backfill).
  { id: DEFAULT_RATE_TYPE_IDS.dayRate, name: 'Day rate', bucket: 'fee', basis: 'per_active_day', dayStatuses: [], orderIndex: 5 },
  // Flat tour (migration 242): one lump-sum fee for the engagement, paid once
  // regardless of how many days are worked. Days still count for per diem.
  { id: DEFAULT_RATE_TYPE_IDS.flatTour, name: 'Flat tour', bucket: 'fee', basis: 'flat_once', dayStatuses: [], orderIndex: 6 },
  // Weekly (migration 242): a per-calendar-week fee — amount × number of distinct
  // Mon-anchored weeks that contain an active day (see fees.ts countDayStatuses).
  { id: DEFAULT_RATE_TYPE_IDS.weekly, name: 'Weekly', bucket: 'fee', basis: 'per_week', dayStatuses: [], orderIndex: 7 },
];

/** The FEE universe — the mutually-exclusive fee slices across every rate_type.
 *  A person owns exactly one slice (see ownedFeeTypeIds); every OTHER slice must
 *  not exist for them or computeTotals double-counts. Per diem (a4) + advance
 *  (a5) are NOT here — they are universal (carried by every rate_type). */
export const FEE_UNIVERSE_IDS: string[] = [
  DEFAULT_RATE_TYPE_IDS.show,
  DEFAULT_RATE_TYPE_IDS.offTravel,
  DEFAULT_RATE_TYPE_IDS.rehearsal,
  DEFAULT_RATE_TYPE_IDS.dayRate,
  DEFAULT_RATE_TYPE_IDS.flatTour,
  DEFAULT_RATE_TYPE_IDS.weekly,
];

/** The fee rate-type ids a person of this `rate_type` OWNS. THE single source of
 *  truth for which fee fields a rate type carries — writeRates emits/keeps exactly
 *  these, and the Rates grid shows/edits exactly these (blanks + locks the rest,
 *  killing the "£0.00 in five irrelevant columns" noise). Flat tour / Weekly own
 *  their grid-entered line (a7/a8); per-diem-only owns no fee. */
export function ownedFeeTypeIds(rateType: string): string[] {
  switch (rateType) {
    case 'day_rate': return [DEFAULT_RATE_TYPE_IDS.dayRate];
    case 'flat_tour': return [DEFAULT_RATE_TYPE_IDS.flatTour];
    case 'weekly': return [DEFAULT_RATE_TYPE_IDS.weekly];
    case 'per_diem_only': return [];
    case 'split_rate':
    default: return [DEFAULT_RATE_TYPE_IDS.show, DEFAULT_RATE_TYPE_IDS.offTravel, DEFAULT_RATE_TYPE_IDS.rehearsal];
  }
}

/** Is rate type `typeId` relevant to a person on `rateType`? A fee-universe type
 *  is relevant only if the person owns it; per diem / advance / custom types are
 *  universal (always shown). Used by the Rates grid to hide/lock irrelevant cells. */
export function isTypeRelevant(rateType: string, typeId: string): boolean {
  if (!FEE_UNIVERSE_IDS.includes(typeId)) return true;
  return ownedFeeTypeIds(rateType).includes(typeId);
}

/** One personnel_rate_lines row: which type + the amount. */
export interface RateLineRow {
  rate_type_id: string;
  amount: number | string | null;
}

/** Marry a rate_type's meta to an amount → an engine RateLine. */
export function toRateLine(meta: RateTypeMeta, amount: number | string | null): RateLine {
  return {
    bucket: meta.bucket,
    basis: meta.basis,
    amount,
    dayStatuses: meta.dayStatuses,
  };
}

/** Build a person's RateLines from their personnel_rate_lines rows + the rate_type
 *  catalog. Rows whose type isn't in the catalog are skipped (defensive). The
 *  order follows the catalog's orderIndex so a fee sum is deterministic. */
export function buildRateLines(rows: RateLineRow[], types: RateTypeMeta[]): RateLine[] {
  const metaById = new Map(types.map((t) => [t.id, t]));
  const amountByType = new Map(rows.map((r) => [r.rate_type_id, r.amount]));
  return [...types]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .filter((t) => amountByType.has(t.id))
    .map((t) => toRateLine(metaById.get(t.id)!, amountByType.get(t.id) ?? 0));
}

/** Reference: build the five DEFAULT lines directly from the legacy column values,
 *  in the catalog order. Used by the reconciliation gate — proving this equals
 *  ratesToLines(rate, advance) means switching the read source moves no money. */
export function defaultLinesFromLegacy(rate: RateLike, advanceFee: number | string | null = 0): RateLine[] {
  const amountFor = (id: string): number | string | null => {
    switch (id) {
      case DEFAULT_RATE_TYPE_IDS.show: return rate.show_rate ?? 0;
      case DEFAULT_RATE_TYPE_IDS.offTravel: return rate.off_rate ?? 0;
      case DEFAULT_RATE_TYPE_IDS.rehearsal: return rate.rehearsal_rate ?? 0;
      case DEFAULT_RATE_TYPE_IDS.perDiem: return rate.per_diem ?? 0;
      case DEFAULT_RATE_TYPE_IDS.advance: return advanceFee ?? 0;
      default: return 0;
    }
  };
  const rows: RateLineRow[] = DEFAULT_RATE_TYPES.map((t) => ({ rate_type_id: t.id, amount: amountFor(t.id) }));
  return buildRateLines(rows, DEFAULT_RATE_TYPES);
}

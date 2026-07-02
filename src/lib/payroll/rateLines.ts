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
];

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

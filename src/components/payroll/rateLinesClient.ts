/* ============================================
   LOWPASS — client helpers for the rate-lines payroll grids (b2 UI phase)

   The Rates grid, Summary and Days matrix all need the same thing: a person's
   RateLines (personnel_rate_lines × rate_types) so computeTotals can sum them.
   These helpers turn the flat rows the page loads into per-person lookups and a
   buildRateLines call, keeping the three grids in agreement.
   ============================================ */

import { buildRateLines, type RateTypeMeta, type RateLineRow } from '@/lib/payroll/rateLines';
import { computeTotals, type DayCounts, type RateLine } from '@/lib/payroll/fees';

/** One personnel_rate_lines row as loaded/threaded through the client. */
export interface RateLineRecord {
  personnel_rate_id: string;
  rate_type_id: string;
  amount: number | string | null;
}

/** personnel_rate_id → (rate_type_id → amount). Fast per-cell reads + edits. */
export type LineAmountMap = Map<string, Map<string, number>>;

export function buildAmountMap(rows: RateLineRecord[]): LineAmountMap {
  const m: LineAmountMap = new Map();
  for (const r of rows) {
    let inner = m.get(r.personnel_rate_id);
    if (!inner) { inner = new Map(); m.set(r.personnel_rate_id, inner); }
    inner.set(r.rate_type_id, Number(r.amount) || 0);
  }
  return m;
}

/** The amount for one person × type (0 when no line exists yet). */
export function amountOf(map: LineAmountMap, personnelRateId: string, rateTypeId: string): number {
  return map.get(personnelRateId)?.get(rateTypeId) ?? 0;
}

/** A person's RateLines, in catalog order, from the amount map. Types with no
 *  line row for the person contribute 0 (so the column simply reads empty). */
export function personLines(map: LineAmountMap, personnelRateId: string, types: RateTypeMeta[]): RateLine[] {
  const inner = map.get(personnelRateId);
  const rows: RateLineRow[] = types.map((t) => ({ rate_type_id: t.id, amount: inner?.get(t.id) ?? 0 }));
  return buildRateLines(rows, types);
}

/** Person's fee + per-diem totals over their day counts. */
export function personTotals(
  map: LineAmountMap,
  personnelRateId: string,
  types: RateTypeMeta[],
  counts: DayCounts,
): { totalFee: number; totalPerDiem: number } {
  return computeTotals(personLines(map, personnelRateId, types), counts);
}

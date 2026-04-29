/* ============================================
   LOWPASS — Duplicate detection (Phase E budget redesign)

   Pure-JS heuristic over the tour's budget_line_items: rows are flagged
   as "possible duplicates" when they share:
     - same category
     - amount within 5% (proposed_cost OR actual_cost)
     - created within 7 days of each other

   Returns a Map<lineItemId, lineItemId[]> where each key's value is the
   list of OTHER line ids the row collides with. The UI surfaces a
   banner above any flagged row; clicking it opens a comparison
   slide-over with merge / dismiss / keep-both actions.

   Detection runs on the existing dataset already loaded server-side
   so there's no extra DB round-trip — just a quadratic walk over a
   typically-small set (<500 line items per tour).
   ============================================ */

import type { BudgetLineItem } from '@/types';

const AMOUNT_TOLERANCE_PCT = 5;
const TIME_WINDOW_DAYS = 7;

function pickAmount(line: BudgetLineItem): number {
  const actual = Number(line.actual_cost ?? 0);
  if (Number.isFinite(actual) && actual > 0) return actual;
  return Number(line.proposed_cost ?? 0);
}

function withinPctOf(target: number, candidate: number, pct: number): boolean {
  if (target === 0 && candidate === 0) return true;
  const denom = Math.max(Math.abs(target), Math.abs(candidate));
  if (denom === 0) return false;
  return Math.abs(target - candidate) / denom <= pct / 100;
}

function withinDays(aIso: string, bIso: string, days: number): boolean {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return Math.abs(a - b) <= days * 86_400_000;
}

export function detectDuplicates(
  lines: BudgetLineItem[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i];
      const b = lines[j];
      // Same row referenced twice — guard.
      if (a.id === b.id) continue;
      // Same category required (otherwise we get false positives across
      // unrelated buckets).
      const aCat = (a.category ?? '').toString().toLowerCase();
      const bCat = (b.category ?? '').toString().toLowerCase();
      if (!aCat || !bCat || aCat !== bCat) continue;

      const amtA = pickAmount(a);
      const amtB = pickAmount(b);
      if (!withinPctOf(amtA, amtB, AMOUNT_TOLERANCE_PCT)) continue;

      if (!withinDays(a.created_at, b.created_at, TIME_WINDOW_DAYS)) continue;

      const aList = out.get(a.id) ?? [];
      aList.push(b.id);
      out.set(a.id, aList);
      const bList = out.get(b.id) ?? [];
      bList.push(a.id);
      out.set(b.id, bList);
    }
  }
  return out;
}

/** Convenience: convert the Map to a serialisable Record so it crosses
 *  the server→client boundary cleanly. */
export function duplicatesToRecord(
  map: Map<string, string[]>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  map.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

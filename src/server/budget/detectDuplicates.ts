/* ============================================
   LOWPASS — Duplicate detection
   Phase E original + X2.3 fix-up.

   Pure-JS heuristic over the tour's budget_line_items: rows are flagged
   as "possible duplicates" when they share:
     - same category OR same vendor (vendor extracted from the notes
       "Vendor: …" prefix established by BudgetLineSlideOver)
     - amount within 5% (actual_cost preferred, proposed_cost fallback)
     - created within 7 days of each other

   X2.3 changed the original "category-only" key to "category OR
   vendor" so that two rows with different categories but the same
   vendor + amount + date can match. Adam's smoke test had near-
   duplicates that didn't trigger because the original strict
   category match was the bottleneck.

   Returns a Map<lineItemId, lineItemId[]> where each key's value is
   the list of OTHER line ids the row collides with.

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

function pickVendor(line: BudgetLineItem): string | null {
  // Vendor is mirrored through `notes` first line as "Vendor: <name>"
  // (convention established by BudgetLineSlideOver). Strip and lowercase
  // for comparison; null when the line has no vendor prefix.
  const raw = (line.notes ?? '').toString();
  if (!raw.startsWith('Vendor: ')) return null;
  const firstLine = raw.split('\n')[0]?.slice('Vendor: '.length) ?? '';
  const trimmed = firstLine.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
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
      if (a.id === b.id) continue;

      const aCat = (a.category ?? '').toString().toLowerCase();
      const bCat = (b.category ?? '').toString().toLowerCase();
      const sameCategory = !!aCat && !!bCat && aCat === bCat;

      const aVendor = pickVendor(a);
      const bVendor = pickVendor(b);
      const sameVendor = aVendor != null && aVendor === bVendor;

      // Need EITHER a same category OR a same vendor. Without one of
      // those signals the amount + date overlap is too thin to flag.
      if (!sameCategory && !sameVendor) continue;

      const amtA = pickAmount(a);
      const amtB = pickAmount(b);
      // Two zero-cost rows (fresh template / placeholder lines) are not
      // duplicates — only flag when at least one carries a real amount.
      // This kills the "N rows flagged as duplicates" warning that fired
      // on every freshly-applied template or batch of new blank lines.
      if (amtA === 0 && amtB === 0) continue;
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

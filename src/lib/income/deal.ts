/* ============================================
   LOWPASS — a show's deal: ONE list, ONE escalator (Nov 2026, Adam)

   The deal used to be typed twice with two vocabularies — Income (VS / PLUS /
   FLAT) and the settlement (Guarantee / Guarantee + bonus / Door deal / Flat /
   Festival) — stored apart and never filled in from each other. Now the deal
   lives once, on the show's income row (budget_income), and both sides read it:

     Expected — the projection engine (src/lib/budget/incomeProjection.ts)
     Actual   — the night's box-office calculator (src/lib/settlement/walk.ts)

   Adam's list (Nov 2026): Flat guarantee (festival fees are flat too) ·
   Versus · Guarantee plus % · Door deal. Accommodation / ground buy-outs are
   NOT deal terms — they're a minus line on the budget.

   ONE escalator: a higher % above N tickets, marginal (only the tickets above
   N earn the higher %). Used on both sides by `tieredShare`. The settlement's
   old per-ticket "bonus" is gone (Adam: "Higher % above N tickets").

   No imports on purpose: the money harnesses load this file with
   `node --experimental-strip-types`.
   ============================================ */

export const DEAL_TYPES = [
  { value: 'FLAT', label: 'Flat guarantee', help: 'The guarantee only — no backend. Festival fees are flat too.' },
  { value: 'VS', label: 'Versus', help: 'The guarantee or the deal %, whichever is higher.' },
  { value: 'PLUS', label: 'Guarantee plus %', help: 'The guarantee, plus an overage you type.' },
  { value: 'DOOR', label: 'Door deal', help: 'A % of the door — usually no guarantee.' },
] as const;

export type DealType = (typeof DEAL_TYPES)[number]['value'];

const ALIASES: Record<string, DealType> = {
  flat: 'FLAT',
  guarantee: 'FLAT',
  festival: 'FLAT',
  vs: 'VS',
  versus: 'VS',
  guarantee_plus: 'VS',
  plus: 'PLUS',
  door: 'DOOR',
  door_deal: 'DOOR',
};

/** Any stored or typed deal type (old Income or old settlement words) → the
 *  one list. Unknown / blank → null. */
export function normaliseDealType(raw: unknown): DealType | null {
  if (typeof raw !== 'string') return null;
  return ALIASES[raw.trim().toLowerCase()] ?? null;
}

export function dealLabel(t: string | null | undefined): string {
  const n = normaliseDealType(t);
  return n ? DEAL_TYPES.find((d) => d.value === n)!.label : 'No deal set';
}

/** Deals whose backend is a % the app can work out (Expected AND Actual).
 *  Flat has none; Plus's overage is typed. */
export function isPercentageDeal(t: DealType | null): boolean {
  return t === 'VS' || t === 'DOOR';
}

/** The artist's share of a pool earned over `tickets` tickets, with the
 *  escalator: `pct` on every ticket up to `threshold`, `pctAbove` only on the
 *  tickets above it (marginal). The pool is spread evenly per ticket. With no
 *  threshold, no tickets, or tickets ≤ threshold it is simply pct × pool.
 *  Percentages are FRACTIONS (0.85). */
export function tieredShare(
  pool: number,
  tickets: number | null,
  pct: number,
  threshold: number | null,
  pctAbove: number | null,
): number {
  const p2 = pctAbove ?? pct;
  if (threshold == null || tickets == null || !(tickets > 0) || tickets <= threshold) return pct * pool;
  const perTicket = pool / tickets;
  return perTicket * (pct * threshold + p2 * (tickets - threshold));
}

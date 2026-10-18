/* ============================================
   LOWPASS — a new tour's rate card starts from the person's LAST tour (Oct 2026)

   Rates are typed in ONE place: Payroll → Summary. When someone joins a tour,
   their card is pre-filled from the most recent other tour they were on
   (Adam's call), then adjusted in Payroll. Nobody has never-toured? Their card
   starts blank. The old library "Default day rates" (personnel.standard_rates)
   are no longer an input anywhere and no longer seed anything.

   Pure rules only — the database reads live in src/server/payroll/seedRateCard.ts.
   ============================================ */

import { CANONICAL_RATE_TYPE_IDS, DEFAULT_RATE_TYPE_IDS, type RateLineRow } from './rateLines';

export interface PriorCard {
  id: string;
  tour_id: string;
  created_at: string | null;
}

/** The card from the person's most recent OTHER tour: latest tour start first
 *  (a tour with no start date counts as oldest), then the newest card. */
export function pickLatestCard(
  cards: PriorCard[],
  tourStart: ReadonlyMap<string, string | null>,
  excludeTourId: string,
): PriorCard | null {
  const pool = cards.filter((c) => c.tour_id !== excludeTourId);
  if (pool.length === 0) return null;
  const key = (c: PriorCard) => tourStart.get(c.tour_id) ?? '';
  return [...pool].sort((a, b) => {
    const byStart = key(b).localeCompare(key(a));
    if (byStart !== 0) return byStart;
    return (b.created_at ?? '').localeCompare(a.created_at ?? '');
  })[0];
}

/** The five explicit lines every new card has had since RATE-03 (zeros). */
const BASE_IDS = [
  DEFAULT_RATE_TYPE_IDS.show,
  DEFAULT_RATE_TYPE_IDS.offTravel,
  DEFAULT_RATE_TYPE_IDS.rehearsal,
  DEFAULT_RATE_TYPE_IDS.perDiem,
  DEFAULT_RATE_TYPE_IDS.advance,
];

/** Lines for the new card: every non-zero CANONICAL line from the prior card,
 *  plus the five base lines at 0 where the prior card had none. A zero Flat day
 *  line is never written — its mere presence switches a card to day-rate
 *  layout (rateAmountsFor), so it only comes across when it has an amount. */
export function seedLines(prior: RateLineRow[] | null | undefined): Array<{ rate_type_id: string; amount: number }> {
  const out = new Map<string, number>();
  for (const l of prior ?? []) {
    const amount = Number(l.amount) || 0;
    if (amount === 0 || !CANONICAL_RATE_TYPE_IDS.includes(l.rate_type_id)) continue;
    out.set(l.rate_type_id, amount);
  }
  for (const id of BASE_IDS) if (!out.has(id)) out.set(id, 0);
  return [...out].map(([rate_type_id, amount]) => ({ rate_type_id, amount }));
}

/** The per-diem amount among seed lines (mirrored onto the card's legacy column). */
export function perDiemOf(lines: Array<{ rate_type_id: string; amount: number }>): number {
  return lines.find((l) => l.rate_type_id === DEFAULT_RATE_TYPE_IDS.perDiem)?.amount ?? 0;
}

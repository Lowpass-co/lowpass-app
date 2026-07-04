/* ============================================
   LOWPASS — Per-tour FX rates (Income Redesign Phase 2)

   budget_fx_rates: 1 <currency> = rate <tour currency>. Used to total per-show
   foreign income into the tour currency in the P&L. Unversioned.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

export type FxRateMap = Record<string, number>;

/** Load the tour's FX map: { EUR: 1.17, USD: 0.79, … } (rate to tour currency). */
export async function loadTourFxRates(
  supabase: SupabaseClient,
  tourId: string,
  workspaceId: string,
): Promise<FxRateMap> {
  const { data } = await supabase
    .from('budget_fx_rates')
    .select('currency, rate_to_tour_currency')
    .eq('tour_id', tourId)
    .eq('workspace_id', workspaceId);
  const m: FxRateMap = {};
  for (const r of data ?? []) {
    const c = String((r as { currency?: string }).currency ?? '').toUpperCase();
    const rate = Number((r as { rate_to_tour_currency?: number }).rate_to_tour_currency);
    if (c && Number.isFinite(rate) && rate > 0) m[c] = rate;
  }
  return m;
}

/** Convert a per-show native amount to the tour currency (pure). The tour
 *  currency and any currency without a rate convert 1:1 (so missing rates never
 *  silently zero income — they just don't convert). */
export function toTourCurrency(
  amount: number,
  showCurrency: string | null | undefined,
  tourCurrency: string,
  rates: FxRateMap,
): number {
  const from = (showCurrency ?? '').toUpperCase();
  if (!from || from === tourCurrency.toUpperCase()) return amount;
  const rate = rates[from];
  return Number.isFinite(rate) && rate > 0 ? amount * rate : amount;
}

/** The single-source FX resolution used everywhere (FX unify · Stage 2).
 *  Precedence: an explicit `lockedRate` (a settled income row's locked_fx_rate,
 *  or an actualized expense line's) wins → the tour's budget_fx_rates entry →
 *  a FLAGGED 1:1 fallback (`missing: true`) so the caller can render a warning
 *  chip instead of silently pivoting through a stale hardcoded table. Never
 *  returns 0. Pure. */
export interface TourFxRate {
  /** 1 `from` unit = `rate` tour-currency units. */
  rate: number;
  /** True when there is no rate for this pair and 1:1 was used as a fallback. */
  missing: boolean;
  /** True when a locked/settled rate was used (not the live tour rate). */
  locked: boolean;
}

export function tourFxRate(
  from: string | null | undefined,
  tourCurrency: string,
  rates: FxRateMap,
  lockedRate?: number | null,
): TourFxRate {
  if (lockedRate != null && Number.isFinite(lockedRate) && lockedRate > 0) {
    return { rate: lockedRate, missing: false, locked: true };
  }
  const f = (from ?? '').toUpperCase();
  const t = (tourCurrency || 'GBP').toUpperCase();
  if (!f || f === t) return { rate: 1, missing: false, locked: false };
  const r = rates[f];
  if (Number.isFinite(r) && r > 0) return { rate: r, missing: false, locked: false };
  return { rate: 1, missing: true, locked: false };
}

/** Convert `amount` (native `from`) into the tour currency via tourFxRate's
 *  precedence (locked → tour rate → flagged 1:1). Pure. Replaces the static
 *  GBP-pivot convertToCurrency for BOTH expenses and income. */
export function convertToTour(
  amount: number,
  from: string | null | undefined,
  tourCurrency: string,
  rates: FxRateMap,
  lockedRate?: number | null,
): number {
  return amount * tourFxRate(from, tourCurrency, rates, lockedRate).rate;
}

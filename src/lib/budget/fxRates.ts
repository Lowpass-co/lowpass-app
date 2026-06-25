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

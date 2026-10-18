/* ============================================
   LOWPASS — live FX for a tour (Oct 2026: "all currency should be live
   requested, not manually typed")

   budget_fx_rates stays the ONE store the P&L reads (1 <currency> = rate
   <tour currency>), but nobody types into it any more. Rates are fetched from
   the live vendors and kept fresh: every foreign currency the tour uses (lines,
   income, plus any rate already stored) is refetched when its stored rate is
   over an hour old (Adam's call). Actuals are unaffected — an actualised line
   or settled show keeps its own locked_fx_rate.

   Best-effort by design: a vendor outage leaves the last good rate in place
   (or none — then the page's missing-rate banner says so). Never throws.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { pickRate } from '@/lib/budget/fxVendor';

export const FX_MAX_AGE_MS = 60 * 60 * 1000; // hourly
const CACHE_SECONDS = 3600;
const TIMEOUT_MS = 3000;

const VENDORS = (from: string, to: string) => [
  `https://api.exchangerate.host/latest?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`,
  `https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`,
];

/** A live 1 `from` = rate `to` figure, trying each vendor in order; null when
 *  none answers with a number. */
export async function fetchLiveRate(from: string, to: string): Promise<number | null> {
  for (const url of VENDORS(from, to)) {
    try {
      const res = await fetch(url, { next: { revalidate: CACHE_SECONDS }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) continue;
      const rate = pickRate(await res.json(), to);
      if (rate != null && rate > 0) return rate;
    } catch {
      /* try the next vendor */
    }
  }
  return null;
}

export interface StoredRate {
  currency: string;
  updated_at: string | null;
}

/** Which currencies need a live fetch: every foreign currency in use or already
 *  stored, whose stored rate is missing or older than `maxAgeMs`. Pure. */
export function staleCurrencies(
  used: Iterable<string>,
  stored: StoredRate[],
  tourCurrency: string,
  now: number,
  maxAgeMs: number = FX_MAX_AGE_MS,
): string[] {
  const tour = tourCurrency.toUpperCase();
  const age = new Map(stored.map((r) => [r.currency.toUpperCase(), r.updated_at ? Date.parse(r.updated_at) : NaN]));
  const all = new Set<string>();
  for (const c of used) if (c) all.add(c.toUpperCase());
  for (const c of age.keys()) all.add(c);
  return [...all]
    .filter((c) => /^[A-Z]{3}$/.test(c) && c !== tour)
    .filter((c) => {
      const t = age.get(c);
      return t === undefined || !Number.isFinite(t) || now - (t as number) > maxAgeMs;
    })
    .sort();
}

/** Refresh the tour's stale rates from the live vendors and store them. */
export async function refreshTourFxRates(
  supabase: SupabaseClient,
  args: { tourId: string; workspaceId: string; tourCurrency: string; used: Iterable<string>; force?: boolean },
): Promise<{ refreshed: string[]; failed: string[] }> {
  try {
    const tour = args.tourCurrency.toUpperCase();
    const { data } = await supabase
      .from('budget_fx_rates')
      .select('currency, updated_at')
      .eq('tour_id', args.tourId)
      .eq('workspace_id', args.workspaceId);
    const stored = ((data ?? []) as StoredRate[]).map((r) => ({ currency: String(r.currency), updated_at: r.updated_at }));
    const todo = staleCurrencies(args.used, stored, tour, Date.now(), args.force ? -1 : FX_MAX_AGE_MS);
    if (todo.length === 0) return { refreshed: [], failed: [] };

    const results = await Promise.all(todo.map(async (c) => ({ c, rate: await fetchLiveRate(c, tour) })));
    const now = new Date().toISOString();
    const good = results.filter((r): r is { c: string; rate: number } => r.rate != null);
    if (good.length) {
      await supabase.from('budget_fx_rates').upsert(
        good.map((r) => ({
          tour_id: args.tourId,
          workspace_id: args.workspaceId,
          currency: r.c,
          rate_to_tour_currency: r.rate,
          updated_at: now,
        })),
        { onConflict: 'tour_id,currency' },
      );
    }
    return { refreshed: good.map((r) => r.c), failed: results.filter((r) => r.rate == null).map((r) => r.c) };
  } catch {
    return { refreshed: [], failed: [] };
  }
}

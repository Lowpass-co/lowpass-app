/* ============================================
   LOWPASS — tour money context (currency + FX) and transaction sums

   Shared by the derived-line reconcile and the transaction auto-sync so the
   two can never disagree about what a line's receipts add up to.

   A transaction can be in a different currency from its line (a ¥ receipt on
   a £ line). Its amount is converted into the LINE's currency at the tour's
   rate before it is summed — it used to be added raw, so ¥25,000 counted as
   £25,000. A NULL transaction currency means "the tour currency": the
   transactions route stores the line's currency, and a line with no currency
   of its own is in the tour currency.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { convertVia, type FxRateMap } from '@/lib/budget/fxRates';
import type { TxnAggregate } from '@/lib/budget/derivedPlan';

export interface TourMoneyContext {
  tourCurrency: string;
  rates: FxRateMap;
  /** null = tour currency. A missing rate converts 1:1 (flagged elsewhere). */
  convert: (amount: number, from: string | null, to: string | null) => number;
}

function fail(what: string, error: { message?: string; code?: string }): never {
  throw Object.assign(new Error(`${what}: ${error.message ?? 'unknown error'}`), { cause: error });
}

export async function loadTourMoneyContext(
  supabase: SupabaseClient,
  tourId: string,
  workspaceId: string,
): Promise<TourMoneyContext> {
  const [tourRes, fxRes] = await Promise.all([
    supabase.from('tours').select('currency').eq('id', tourId).eq('workspace_id', workspaceId).maybeSingle(),
    supabase.from('budget_fx_rates').select('currency, rate_to_tour_currency').eq('tour_id', tourId).eq('workspace_id', workspaceId),
  ]);
  if (tourRes.error) fail('tour', tourRes.error);
  if (fxRes.error) fail('fx rates', fxRes.error);
  const tourCurrency = String((tourRes.data as { currency?: string } | null)?.currency ?? 'GBP').toUpperCase();
  const rates: FxRateMap = {};
  for (const r of (fxRes.data ?? []) as Array<{ currency?: string; rate_to_tour_currency?: number }>) {
    const c = String(r.currency ?? '').toUpperCase();
    const rate = Number(r.rate_to_tour_currency);
    if (c && Number.isFinite(rate) && rate > 0) rates[c] = rate;
  }
  const convert = (amount: number, from: string | null, to: string | null) =>
    convertVia(amount, from ?? tourCurrency, to ?? tourCurrency, tourCurrency, rates);
  return { tourCurrency, rates, convert };
}

/** Transaction sums per line, converted into each line's currency. */
export async function loadTxnAggregates(
  supabase: SupabaseClient,
  lines: Array<{ id: string; currency: string | null }>,
  money: Pick<TourMoneyContext, 'convert'>,
): Promise<Map<string, TxnAggregate>> {
  const out = new Map<string, TxnAggregate>();
  if (lines.length === 0) return out;
  const ccyByLine = new Map(lines.map((l) => [l.id, (l.currency ?? '').toUpperCase() || null]));
  const ids = lines.map((l) => l.id);
  for (let i = 0; i < ids.length; i += 200) {
    const res = await supabase
      .from('budget_line_item_transactions')
      .select('line_item_id, amount, currency')
      .in('line_item_id', ids.slice(i, i + 200));
    if (res.error) fail('transactions', res.error);
    for (const r of (res.data ?? []) as Array<{ line_item_id: string; amount: number | string | null; currency: string | null }>) {
      const lineCcy = ccyByLine.get(r.line_item_id) ?? null;
      const txnCcy = (r.currency ?? '').toUpperCase() || null;
      const amt = money.convert(Number(r.amount) || 0, txnCcy, lineCcy);
      const agg = out.get(r.line_item_id) ?? { count: 0, sum: 0 };
      agg.count += 1;
      agg.sum += amt;
      out.set(r.line_item_id, agg);
    }
  }
  return out;
}

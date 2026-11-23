/* ============================================
   LOWPASS — changing a tour's currency (Nov 2026, Adam)

   The ONE way tours.currency changes (PATCH /api/tours/[id] — Tour settings ›
   Details and Budget › Money both send it). A live 1 old = r new rate is
   fetched and handed to change_tour_currency() (migration 297), which
   restates every stored exchange rate and locked actual in one transaction —
   flipping the code alone would misread them all. Then the budget's automatic
   lines are rebuilt (a hotel billed in £ is now a foreign line on a $ tour).

   Amounts with no currency of their own keep their numbers (£350 → $350).
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchLiveRate } from '@/server/budget/liveFx';
import { refreshDerivedLines } from '@/server/budget/reconcileDerivedLines';

export type CurrencyChange =
  | { ok: true; changed: boolean; from?: string; to: string }
  | { ok: false; status: number; error: string };

const CODE = /^[A-Z]{3}$/;

export async function changeTourCurrency(
  supabase: SupabaseClient,
  tourId: string,
  currencyIn: unknown,
  deps: { liveRate?: (from: string, to: string) => Promise<number | null> } = {},
): Promise<CurrencyChange> {
  const to = typeof currencyIn === 'string' ? currencyIn.trim().toUpperCase() : '';
  if (!CODE.test(to)) return { ok: false, status: 400, error: 'Pick a currency' };

  const { data: tour } = await supabase.from('tours').select('currency, workspace_id').eq('id', tourId).maybeSingle();
  if (!tour) return { ok: false, status: 404, error: 'Tour not found' };
  const t = tour as { currency: string | null; workspace_id: string };
  const from = (t.currency || 'GBP').toUpperCase();
  if (from === to) return { ok: true, changed: false, to };

  const rate = await (deps.liveRate ?? fetchLiveRate)(from, to);
  if (rate == null || !(rate > 0)) {
    return {
      ok: false,
      status: 502,
      error: `Couldn't get a live ${from} → ${to} rate to restate this tour's exchange rates. Try again in a minute.`,
    };
  }

  const { error } = await supabase.rpc('change_tour_currency', { p_tour_id: tourId, p_currency: to, p_rate: rate });
  if (error) {
    if (error.code === '42883' || /change_tour_currency/.test(error.message ?? '')) {
      return { ok: false, status: 500, error: 'Changing currency needs migration 297 — paste it in Supabase first.' };
    }
    return { ok: false, status: error.code === '42501' ? 403 : 500, error: error.message };
  }

  await refreshDerivedLines(supabase, tourId, t.workspace_id, 'all');
  return { ok: true, changed: true, from, to };
}

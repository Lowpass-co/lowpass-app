/* ============================================
   LOWPASS — Artist Budget Summary API

   GET /api/budget/artist-summary?artist_id=uuid&year=2026 (year optional)

   Every tour for an artist with its P&L — each one computed by `loadTourPnl`,
   the same formula as the tour's own Budget Summary (money repair, Oct 2026).
   This route used to carry its own copy: commissions on gross only whatever
   their basis, percentages not normalised, 0% insurance as 3%, no currency
   conversion, and totals that added a dollar tour to a pound tour.

   Totals are only summed across tours that share a currency. When the
   artist's tours are in more than one currency, `totals` is per-currency in
   `totals_by_currency` and `mixed_currencies` is true — there is no honest
   single number without a cross-tour exchange rate.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { loadTourPnl } from '@/server/budget/loadTourPnl';

type Totals = {
  income_proposed: number;
  income_actual: number;
  expenses_proposed: number;
  expenses_actual: number;
  net_proposed: number;
  net_actual: number;
};
const zero = (): Totals => ({ income_proposed: 0, income_actual: 0, expenses_proposed: 0, expenses_actual: 0, net_proposed: 0, net_actual: 0 });

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const artistId = searchParams.get('artist_id');
  const year = searchParams.get('year');
  if (!artistId) return NextResponse.json({ error: 'artist_id required' }, { status: 400 });

  const wid = profile.workspace_id;

  let tourQuery = supabase
    .from('tours')
    .select('id, name, start_date, end_date, status, continent, currency')
    .eq('workspace_id', wid)
    .eq('artist_id', artistId)
    .order('start_date', { ascending: false });
  if (year) {
    tourQuery = tourQuery.gte('end_date', `${year}-01-01`).lte('start_date', `${year}-12-31`);
  }

  const { data: tours, error: toursErr } = await tourQuery;
  if (toursErr) return NextResponse.json({ error: toursErr.message }, { status: 500 });
  if (!tours || tours.length === 0) {
    return NextResponse.json({ tours: [], totals: zero(), totals_by_currency: {}, mixed_currencies: false, monthly_rolling: [] });
  }

  // The roll-up reads the derived lines as their writers last left them
  // (every source write refreshes them) instead of re-reconciling every tour.
  let bundles;
  try {
    bundles = await Promise.all(tours.map((t) => loadTourPnl(supabase, t.id as string, wid, { reconcile: false })));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const result = tours.map((tour, i) => {
    const { pnl, routingDays, tourCurrency, fxMissing } = bundles[i];
    return {
      tour_id: tour.id,
      tour_name: tour.name,
      start_date: tour.start_date,
      end_date: tour.end_date,
      status: tour.status,
      continent: tour.continent,
      currency: tourCurrency,
      income_proposed: pnl.grossIncome.projected,
      income_actual: pnl.grossIncome.actual,
      expenses_proposed: pnl.totalExpenses.projected,
      expenses_actual: pnl.totalExpenses.actual,
      net_proposed: pnl.net.projected,
      net_actual: pnl.net.actual,
      show_count: routingDays.filter((r) => r.day_type === 'show' || r.day_type === 'festival').length,
      fx_missing: fxMissing,
    };
  });

  const byCurrency: Record<string, Totals> = {};
  for (const r of result) {
    const t = (byCurrency[r.currency] ??= zero());
    t.income_proposed += r.income_proposed;
    t.income_actual += r.income_actual;
    t.expenses_proposed += r.expenses_proposed;
    t.expenses_actual += r.expenses_actual;
    t.net_proposed += r.net_proposed;
    t.net_actual += r.net_actual;
  }
  const currencies = Object.keys(byCurrency);
  const mixed = currencies.length > 1;

  // Monthly net — per currency too; only meaningful as one series when unmixed.
  const monthly: Record<string, { proposed: number; actual: number }> = {};
  if (!mixed) {
    for (const t of result) {
      const month = t.start_date?.slice(0, 7);
      if (!month) continue;
      monthly[month] ??= { proposed: 0, actual: 0 };
      monthly[month].proposed += t.net_proposed;
      monthly[month].actual += t.net_actual;
    }
  }
  const monthlyRolling = Object.entries(monthly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v }));

  return NextResponse.json({
    tours: result,
    totals: mixed ? zero() : byCurrency[currencies[0]],
    totals_currency: mixed ? null : currencies[0],
    totals_by_currency: byCurrency,
    mixed_currencies: mixed,
    monthly_rolling: monthlyRolling,
  });
}

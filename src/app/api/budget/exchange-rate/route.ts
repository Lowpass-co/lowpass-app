/* ============================================
   LOWPASS — Budget Exchange Rate API (FX unify · Stage 2)

   The single FX truth is budget_fx_rates. This route is the admin "refresh"
   seam over the live vendor:

   GET  ?from=USD&to=GBP           → { rate, source, fetched_at }  (live, cached 1h)
   POST { tour_id, currency }      → fetch the live currency→tour rate and UPSERT it
                                     into budget_fx_rates (1 <currency> = rate <tour
                                     currency>). No longer writes the retired
                                     budget_settings.exchange_rate scalar (store #3,
                                     dropped by migration 236).

   Per-currency manual edits still go through /api/budget/fx-rates.
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { pickRate } from '@/lib/budget/fxVendor';

const CACHE_MAX_AGE = 3600; // 1 hour

const VENDORS = (from: string, to: string) => [
  `https://api.exchangerate.host/latest?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`,
  `https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`,
];

/** Fetch a live 1 `from` = rate `to` figure, trying each vendor in order. */
async function fetchLiveRate(from: string, to: string): Promise<number | null> {
  for (const url of VENDORS(from, to)) {
    try {
      const res = await fetch(url, { next: { revalidate: CACHE_MAX_AGE } });
      if (!res.ok) continue;
      const rate = pickRate(await res.json(), to);
      if (rate != null) return rate;
    } catch {
      /* try the next vendor */
    }
  }
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from')?.toUpperCase() ?? 'USD';
  const to = searchParams.get('to')?.toUpperCase() ?? 'GBP';
  const fetchedAt = new Date().toISOString();

  const rate = await fetchLiveRate(from, to);
  if (rate == null) {
    return NextResponse.json({ error: 'Failed to fetch exchange rate' }, { status: 502 });
  }
  return NextResponse.json(
    { rate, source: 'live', fetched_at: fetchedAt },
    { headers: { 'Cache-Control': `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_MAX_AGE}` } }
  );
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  let body: { tour_id?: string; currency?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const tourId = body.tour_id;
  const currency = body.currency?.toUpperCase();
  if (!tourId || !currency) {
    return NextResponse.json({ error: 'tour_id and currency are required' }, { status: 400 });
  }

  const { data: tour } = await supabase
    .from('tours')
    .select('id, currency')
    .eq('id', tourId)
    .eq('workspace_id', profile.workspace_id)
    .single();
  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }
  const tourCurrency = ((tour.currency as string | null) ?? 'GBP').toUpperCase();
  if (currency === tourCurrency) {
    return NextResponse.json({ error: 'currency equals the tour currency (rate is 1:1)' }, { status: 400 });
  }

  const rate = await fetchLiveRate(currency, tourCurrency);
  if (rate == null || !(rate > 0)) {
    return NextResponse.json({ error: 'Failed to fetch a live rate for this pair' }, { status: 502 });
  }

  // Persist into the ONE FX store, keyed per currency (1 <currency> = rate <tour ccy>).
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('budget_fx_rates')
    .upsert(
      {
        tour_id: tourId,
        workspace_id: profile.workspace_id,
        currency,
        rate_to_tour_currency: rate,
        updated_at: now,
      },
      { onConflict: 'tour_id,currency' }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ...data, source: 'live', fetched_at: now });
}

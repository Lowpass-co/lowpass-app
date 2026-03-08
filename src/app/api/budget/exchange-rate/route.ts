/* ============================================
   LOWPASS — Budget Exchange Rate API

   GET: Fetch live rate (?from=USD&to=GBP). Cached 1 hour.
   POST: Save rate to budget_settings for a tour.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const CACHE_MAX_AGE = 3600; // 1 hour

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from')?.toUpperCase() ?? 'USD';
  const to = searchParams.get('to')?.toUpperCase() ?? 'GBP';

  const fetchedAt = new Date().toISOString();

  try {
    const res = await fetch(
      `https://api.exchangerate.host/latest?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`,
      { next: { revalidate: CACHE_MAX_AGE } }
    );
    if (!res.ok) throw new Error('exchangerate.host failed');
    const data = (await res.json()) as { rates?: Record<string, number> };
    const rate = data?.rates?.[to];
    if (typeof rate !== 'number') throw new Error('Invalid response');
    return NextResponse.json(
      { rate, source: 'exchangerate.host', fetched_at: fetchedAt },
      {
        headers: {
          'Cache-Control': `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_MAX_AGE}`,
        },
      }
    );
  } catch {
    // Fallback
    try {
      const fallbackRes = await fetch(
        `https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`,
        { next: { revalidate: CACHE_MAX_AGE } }
      );
      if (!fallbackRes.ok) throw new Error('er-api failed');
      const data = (await fallbackRes.json()) as {
        conversion_rates?: Record<string, number>;
      };
      const rate = data?.conversion_rates?.[to];
      if (typeof rate !== 'number') throw new Error('Invalid response');
      return NextResponse.json(
        { rate, source: 'open.er-api.com', fetched_at: fetchedAt },
        {
          headers: {
            'Cache-Control': `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_MAX_AGE}`,
          },
        }
      );
    } catch (fallbackErr) {
      return NextResponse.json(
        { error: 'Failed to fetch exchange rate' },
        { status: 502 }
      );
    }
  }
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
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

  let body: { tour_id: string; exchange_rate: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { tour_id, exchange_rate } = body;
  if (!tour_id || typeof exchange_rate !== 'number') {
    return NextResponse.json(
      { error: 'tour_id and exchange_rate are required' },
      { status: 400 }
    );
  }

  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tour_id)
    .eq('workspace_id', profile.workspace_id)
    .single();

  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('budget_settings')
    .upsert(
      {
        tour_id,
        workspace_id: profile.workspace_id,
        exchange_rate: exchange_rate,
        exchange_rate_updated_at: now,
        updated_at: now,
      },
      { onConflict: 'tour_id' }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

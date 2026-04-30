/* ============================================
   LOWPASS — Previously Played API (Phase 2 §C)

   GET /api/advance/previously-played?routingId=...
     - Resolves the routing's venue/city for matching
     - Returns past shows in the workspace at the same venue
       (preferred: same venue_id; fallback: same venue_name + city)
     - Excludes the current tour and the current routing
     - Returns advance summary metadata so the slide-over can list
       shows with date, tour, venue, section count, last update —
       and optionally `data` per show when ?withData=1.

   Sister POST endpoint at /api/advance/previously-played/import
   handles the actual copy.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

type RoutingRow = {
  id: string;
  date: string;
  day_type: string | null;
  venue_id: string | null;
  venue_name: string | null;
  city: string | null;
  tour_id: string;
};

type AdvanceRow = {
  id: string;
  routing_id: string;
  status: string | null;
  data: Record<string, unknown>;
  last_updated_at: string | null;
};

type TourRow = { id: string; name: string | null };

type ResponsePastShow = {
  routingId: string;
  date: string;
  tourId: string;
  tourName: string;
  venueName: string | null;
  city: string | null;
  matchType: 'venue_id' | 'name_city';
  sectionsCount: number;
  lastUpdatedAt: string | null;
  data?: Record<string, unknown>;
};

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const routingId = url.searchParams.get('routingId');
  const withData = url.searchParams.get('withData') === '1';
  if (!routingId) {
    return NextResponse.json(
      { error: 'routingId query param is required' },
      { status: 400 },
    );
  }

  // Resolve the current routing's venue + tour for matching.
  const { data: currentRouting, error: routingErr } = await supabase
    .from('routing')
    .select('id, date, day_type, venue_id, venue_name, city, tour_id')
    .eq('id', routingId)
    .maybeSingle();
  if (routingErr || !currentRouting) {
    return NextResponse.json({ error: 'Routing not found' }, { status: 404 });
  }
  const cur = currentRouting as RoutingRow;

  if (!cur.venue_id && !(cur.venue_name && cur.city)) {
    // Nothing to match against — return an empty list rather than
    // a giant cross-tour scan.
    return NextResponse.json({ shows: [], match: 'none' });
  }

  // Find candidate routings — prefer venue_id, fallback to
  // venue_name + city pairs. Excludes the current routing AND the
  // current tour (Adam's spec: "shows at this same venue across the
  // workspace's tour history" — past tours, not the same tour).
  let candidatesQuery = supabase
    .from('routing')
    .select('id, date, day_type, venue_id, venue_name, city, tour_id')
    .neq('id', cur.id)
    .neq('tour_id', cur.tour_id)
    .order('date', { ascending: false });

  if (cur.venue_id) {
    candidatesQuery = candidatesQuery.eq('venue_id', cur.venue_id);
  } else {
    candidatesQuery = candidatesQuery
      .ilike('venue_name', cur.venue_name ?? '')
      .ilike('city', cur.city ?? '');
  }

  const { data: candidatesData, error: candidatesErr } = await candidatesQuery;
  if (candidatesErr) {
    return NextResponse.json(
      { error: 'Failed to fetch candidates' },
      { status: 500 },
    );
  }
  const candidates = (candidatesData ?? []) as RoutingRow[];
  if (candidates.length === 0) {
    return NextResponse.json({
      shows: [],
      match: cur.venue_id ? 'venue_id' : 'name_city',
    });
  }

  // Pull advance instances for those routings (only ones that have an
  // advance — otherwise nothing to copy).
  const candidateRoutingIds = candidates.map((r) => r.id);
  const { data: advanceData, error: advanceErr } = await supabase
    .from('advance_instances')
    .select('id, routing_id, status, data, last_updated_at')
    .in('routing_id', candidateRoutingIds);
  if (advanceErr) {
    return NextResponse.json(
      { error: 'Failed to fetch advance instances' },
      { status: 500 },
    );
  }
  const advances = (advanceData ?? []) as AdvanceRow[];
  if (advances.length === 0) {
    return NextResponse.json({
      shows: [],
      match: cur.venue_id ? 'venue_id' : 'name_city',
    });
  }
  const advanceByRouting = new Map(advances.map((a) => [a.routing_id, a]));

  // Tour names lookup so we can label each row.
  const tourIds = Array.from(new Set(candidates.map((r) => r.tour_id)));
  const { data: tourData } = await supabase
    .from('tours')
    .select('id, name')
    .in('id', tourIds);
  const toursById = new Map(
    ((tourData ?? []) as TourRow[]).map((t) => [t.id, t]),
  );

  const shows: ResponsePastShow[] = [];
  for (const r of candidates) {
    const adv = advanceByRouting.get(r.id);
    if (!adv) continue;
    const data = adv.data ?? {};
    const sectionsCount =
      data && typeof data === 'object' ? Object.keys(data).length : 0;
    if (sectionsCount === 0) continue;
    shows.push({
      routingId: r.id,
      date: r.date,
      tourId: r.tour_id,
      tourName: toursById.get(r.tour_id)?.name ?? 'Tour',
      venueName: r.venue_name,
      city: r.city,
      matchType: cur.venue_id ? 'venue_id' : 'name_city',
      sectionsCount,
      lastUpdatedAt: adv.last_updated_at,
      data: withData ? data : undefined,
    });
  }

  return NextResponse.json({
    shows,
    match: cur.venue_id ? 'venue_id' : 'name_city',
  });
}

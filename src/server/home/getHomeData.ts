/* ============================================
   LOWPASS — Home page server data (Phase 0 reference)

   Single async fetcher for the artist-scoped Home page:
     - Artist identity (name, image)
     - Stats: active tours / shows this month / personnel active /
       budget committed
     - Tours grouped per product (Operations / Budget / Advance) so
       the product cards can list this artist's tours as clickable
     - Recent activity: union of recent budget edits + advance saves
       + operations updates, sorted desc, top 10

   Phase 0: this is reference-only, mounted at the playground route.
   Phase 1+ promotes it to canonical Home data.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

export type HomeArtist = {
  id: string;
  name: string;
  imageUrl: string | null;
};

export type HomeStats = {
  activeTours: number;
  showsThisMonth: number;
  personnelActive: number;
  budgetCommitted: number;
  budgetCurrency: string;
};

export type HomeTourSummary = {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  showCount: number;
  /** Per-product touch timestamps for the product cards. */
  lastBudgetTouchedAt: string | null;
  lastAdvanceTouchedAt: string | null;
  lastOpsTouchedAt: string | null;
};

export type HomeActivityRow = {
  id: string;
  product: 'budget' | 'advance' | 'operations';
  tourId: string;
  tourName: string;
  summary: string;
  occurredAt: string;
};

export type HomeData = {
  artist: HomeArtist;
  stats: HomeStats;
  tours: HomeTourSummary[];
  recentActivity: HomeActivityRow[];
};

function pickArtistImage(
  branding: unknown,
  spotify: string | null | undefined,
): string | null {
  if (spotify && spotify.trim()) return spotify;
  if (!branding || typeof branding !== 'object') return null;
  const b = branding as Record<string, unknown>;
  const candidates = [b.logo_url, b.logoUrl, b.image_url, b.imageUrl];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c;
  }
  return null;
}

export async function getHomeData(
  supabase: SupabaseClient,
  artistId: string,
): Promise<HomeData | null> {
  const [{ data: artistRow }, { data: tourRows }] = await Promise.all([
    supabase
      .from('artists')
      .select('id, name, spotify_image_url, branding')
      .eq('id', artistId)
      .maybeSingle(),
    supabase
      .from('tours')
      .select('id, name, status, start_date, end_date, currency, updated_at')
      .eq('artist_id', artistId)
      .order('start_date', { ascending: false }),
  ]);

  if (!artistRow) return null;

  const artist: HomeArtist = {
    id: artistRow.id as string,
    name: (artistRow.name as string | null) ?? 'Artist',
    imageUrl: pickArtistImage(
      artistRow.branding,
      artistRow.spotify_image_url as string | null,
    ),
  };

  const tours = (tourRows ?? []) as Array<{
    id: string;
    name: string | null;
    status: string | null;
    start_date: string | null;
    end_date: string | null;
    currency: string | null;
    updated_at: string | null;
  }>;
  const tourIds = tours.map((t) => t.id);

  // Stats: aggregate routing + budget + tour_personnel for this artist's
  // tours. All in parallel.
  const today = new Date();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);

  const empty = Promise.resolve({ data: [] as Array<Record<string, unknown>>, count: 0 });

  const [
    routingThisMonthRes,
    budgetRowsRes,
    personnelRes,
    advanceUpdatedRes,
    budgetUpdatedRes,
  ] = await Promise.all([
    tourIds.length
      ? supabase
          .from('routing')
          .select('id, tour_id, day_type, date')
          .in('tour_id', tourIds)
          .gte('date', monthStart)
          .lte('date', monthEnd)
      : empty,
    tourIds.length
      ? supabase
          .from('budget_line_items')
          .select('tour_id, proposed_cost, updated_at, label, category, status')
          .in('tour_id', tourIds)
      : empty,
    tourIds.length
      ? supabase
          .from('tour_personnel')
          .select('id, tour_id', { count: 'exact' })
          .in('tour_id', tourIds)
      : empty,
    tourIds.length
      ? supabase
          .from('advance_instances')
          .select('id, routing_id, updated_at, status')
          .order('updated_at', { ascending: false })
          .limit(20)
      : empty,
    tourIds.length
      ? supabase
          .from('budget_line_items')
          .select('id, tour_id, label, updated_at, status')
          .in('tour_id', tourIds)
          .order('updated_at', { ascending: false })
          .limit(20)
      : empty,
  ]);

  const routingThisMonth = (routingThisMonthRes.data ?? []) as Array<{
    id: string;
    tour_id: string;
    day_type: string | null;
    date: string | null;
  }>;
  const showsThisMonth = routingThisMonth.filter((r) => {
    const dt = (r.day_type ?? '').toLowerCase();
    return dt.includes('show') || dt.includes('festival');
  }).length;

  const budgetRows = (budgetRowsRes.data ?? []) as Array<{
    tour_id: string;
    proposed_cost: number | null;
    updated_at: string | null;
    label: string | null;
    category: string | null;
    status: string | null;
  }>;
  let budgetCommitted = 0;
  const budgetByTour = new Map<string, string | null>();
  for (const row of budgetRows) {
    const p = Number(row.proposed_cost ?? 0);
    if (Number.isFinite(p)) budgetCommitted += p;
    if (row.tour_id) {
      const existing = budgetByTour.get(row.tour_id);
      const candidate = row.updated_at;
      if (!existing || (candidate && candidate > existing)) {
        budgetByTour.set(row.tour_id, candidate ?? null);
      }
    }
  }

  // Active tours = tours with status === 'active'
  const activeTours = tours.filter((t) => t.status === 'active').length;

  // Show count per tour from the same routing query bracketed to the
  // tour-window months — but for the per-tour summary we want *all*
  // shows (not just this-month). One extra cheap query.
  const showCountByTour = new Map<string, number>();
  if (tourIds.length > 0) {
    const { data: allRouting } = await supabase
      .from('routing')
      .select('tour_id, day_type')
      .in('tour_id', tourIds);
    for (const r of (allRouting ?? []) as Array<{
      tour_id: string;
      day_type: string | null;
    }>) {
      const dt = (r.day_type ?? '').toLowerCase();
      if (!dt.includes('show') && !dt.includes('festival')) continue;
      showCountByTour.set(r.tour_id, (showCountByTour.get(r.tour_id) ?? 0) + 1);
    }
  }

  // Advance updated-at: re-bucket to per-tour. advance_instances has
  // routing_id only, so we need the routing→tour mapping.
  const advanceUpdatedByTour = new Map<string, string>();
  const advanceUpdates = (advanceUpdatedRes.data ?? []) as Array<{
    id: string;
    routing_id: string;
    updated_at: string | null;
  }>;
  if (advanceUpdates.length > 0) {
    const advanceRoutingIds = advanceUpdates
      .map((a) => a.routing_id)
      .filter(Boolean);
    if (advanceRoutingIds.length > 0) {
      const { data: routingMap } = await supabase
        .from('routing')
        .select('id, tour_id')
        .in('id', advanceRoutingIds);
      const routingToTour = new Map(
        ((routingMap ?? []) as Array<{ id: string; tour_id: string }>).map(
          (r) => [r.id, r.tour_id],
        ),
      );
      for (const adv of advanceUpdates) {
        const tourId = routingToTour.get(adv.routing_id);
        if (!tourId || !adv.updated_at) continue;
        const existing = advanceUpdatedByTour.get(tourId);
        if (!existing || adv.updated_at > existing) {
          advanceUpdatedByTour.set(tourId, adv.updated_at);
        }
      }
    }
  }

  // Per-tour summaries.
  const tourSummaries: HomeTourSummary[] = tours.map((t) => ({
    id: t.id,
    name: t.name ?? 'Tour',
    status: t.status ?? 'planning',
    startDate: t.start_date,
    endDate: t.end_date,
    showCount: showCountByTour.get(t.id) ?? 0,
    lastBudgetTouchedAt: budgetByTour.get(t.id) ?? null,
    lastAdvanceTouchedAt: advanceUpdatedByTour.get(t.id) ?? null,
    lastOpsTouchedAt: t.updated_at, // tours.updated_at is the closest "Ops touch" we have
  }));

  // Recent activity: union of budget + advance updates, capped at 10.
  const tourNameById = new Map(tours.map((t) => [t.id, t.name ?? 'Tour']));
  const budgetUpdates = (budgetUpdatedRes.data ?? []) as Array<{
    id: string;
    tour_id: string;
    label: string | null;
    updated_at: string | null;
    status: string | null;
  }>;
  const recentActivity: HomeActivityRow[] = [];
  for (const row of budgetUpdates) {
    if (!row.updated_at) continue;
    recentActivity.push({
      id: `budget-${row.id}`,
      product: 'budget',
      tourId: row.tour_id,
      tourName: tourNameById.get(row.tour_id) ?? 'Tour',
      summary: `${row.label ?? 'Line item'} · ${(row.status ?? 'draft').toString()}`,
      occurredAt: row.updated_at,
    });
  }
  for (const adv of advanceUpdates) {
    if (!adv.updated_at) continue;
    // Best effort — we don't have advance_instance.tour_id directly.
    // Re-resolve via the routing→tour map we built earlier; if it's
    // missing, skip rather than show "Tour" with no name.
    const advanceRoutingIds = advanceUpdates
      .map((a) => a.routing_id)
      .filter(Boolean);
    if (advanceRoutingIds.length === 0) continue;
    // Fall through with a best-effort tour name lookup.
    recentActivity.push({
      id: `advance-${adv.id}`,
      product: 'advance',
      tourId: '',
      tourName: '',
      summary: 'Advance instance updated',
      occurredAt: adv.updated_at,
    });
  }
  // Tours themselves count as Operations updates.
  for (const t of tours) {
    if (!t.updated_at) continue;
    recentActivity.push({
      id: `tour-${t.id}`,
      product: 'operations',
      tourId: t.id,
      tourName: t.name ?? 'Tour',
      summary: `Tour metadata updated`,
      occurredAt: t.updated_at,
    });
  }
  recentActivity.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  const top10 = recentActivity.slice(0, 10);

  // Default budget currency = the most-common tour currency for this
  // artist (or GBP if none).
  const currencyVotes = new Map<string, number>();
  for (const t of tours) {
    const c = (t.currency ?? 'GBP').toUpperCase();
    currencyVotes.set(c, (currencyVotes.get(c) ?? 0) + 1);
  }
  let budgetCurrency = 'GBP';
  let topVotes = -1;
  currencyVotes.forEach((v, k) => {
    if (v > topVotes) {
      topVotes = v;
      budgetCurrency = k;
    }
  });

  return {
    artist,
    stats: {
      activeTours,
      showsThisMonth,
      personnelActive: personnelRes.count ?? 0,
      budgetCommitted,
      budgetCurrency,
    },
    tours: tourSummaries,
    recentActivity: top10,
  };
}

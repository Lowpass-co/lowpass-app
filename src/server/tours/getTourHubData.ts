/* ============================================
   LOWPASS — Tour Hub server data
   Built fresh on the budget-redesign fix-up branch (X3).

   PR #3 originally specified a getTourHubData() helper as part of
   the nav redesign Phase C. PR #3 hasn't merged, so this file is
   built from scratch here. When PR #3 lands and conflicts at merge
   time, prefer this version — it queries channel_list_rows directly
   for the channel-list Setup chip (the X3 fix-up requirement),
   whereas PR #3's earlier draft used a rider_packs proxy.

   Single async fetch. Returns:
     - tour identity (id, name, status, dates, currency)
     - artist (joined)
     - sibling tours for this artist (Switch-tour pill data)
     - setup status booleans + ridersLinked count
     - advance counts (complete / total shows)
     - budget summary (proposed / actual)
     - secondary-card counts (personnel, routing, channelList,
       rooming)

   Cheap existence queries (`SELECT id … LIMIT 1`) for each Setup
   chip; counts use `count: 'exact', head: true`. Aggregates run in
   parallel.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

export type TourHubArtist = {
  id: string;
  name: string;
  spotify_image_url?: string | null;
  branding?: unknown;
};

export type TourHubSiblingTour = {
  id: string;
  name: string;
  status: string;
};

export type TourHubSetup = {
  /** ✓ when at least one routing row exists. Source: routing.tour_id */
  routing: boolean;
  /** ✓ when at least one channel_list_rows row exists for any rider
   *  pack on this tour. Two-step query: (1) find pack ids for the
   *  tour, (2) probe channel_list_rows.pack_id IN (…). */
  channelList: boolean;
  /** ✓ when at least one tour_personnel row exists. */
  personnel: boolean;
  /** ✓ when at least one rooming_grid row exists. */
  rooming: boolean;
  /** Count of artist-level rider packs (rider_packs.artist_id =
   *  this tour's artist_id). Surfaced as an orange ↗ chip rather
   *  than a binary tick — operators want to see how many of the
   *  artist library's riders apply to this tour. */
  ridersLinked: number;
};

export type TourHubAdvance = {
  totalShows: number;
  completeShows: number;
  /** 0–100. */
  percent: number;
};

export type TourHubBudget = {
  proposed: number;
  actual: number;
  /** 0–100. Capped at 999 visually but raw arithmetic. */
  percent: number;
  currency: string;
};

export type TourHubSecondary = {
  personnelCount: number;
  routingCount: number;
  channelListConfigured: boolean;
  roomCount: number;
};

export type TourHubData = {
  tour: {
    id: string;
    name: string;
    status: string;
    start_date: string;
    end_date: string;
    currency: string;
  };
  artist: TourHubArtist;
  siblingTours: TourHubSiblingTour[];
  setup: TourHubSetup;
  advance: TourHubAdvance;
  budget: TourHubBudget;
  secondary: TourHubSecondary;
};

type AdvanceInstanceRow = {
  routing_id: string;
  sections: { template_id?: string | null; label?: string | null }[] | null;
  section_statuses: Record<string, { status?: string }> | null;
};

export async function getTourHubData(
  supabase: SupabaseClient,
  tourId: string,
): Promise<TourHubData | null> {
  const { data: tourRow } = await supabase
    .from('tours')
    .select('id, name, status, start_date, end_date, currency, artist_id')
    .eq('id', tourId)
    .maybeSingle();

  if (!tourRow) return null;
  const artistId = tourRow.artist_id as string | null;
  if (!artistId) return null;

  // Parallel fetches.
  const [
    artistRes,
    siblingsRes,
    routingRes,
    personnelRes,
    riderPacksTourRes,
    riderPacksArtistRes,
    roomingRes,
    budgetRes,
  ] = await Promise.all([
    supabase
      .from('artists')
      .select('id, name, spotify_image_url, branding')
      .eq('id', artistId)
      .maybeSingle(),
    supabase
      .from('tours')
      .select('id, name, status')
      .eq('artist_id', artistId)
      .order('start_date', { ascending: false }),
    supabase
      .from('routing')
      .select('id, day_type, date')
      .eq('tour_id', tourId),
    supabase
      .from('tour_personnel')
      .select('id', { count: 'exact', head: true })
      .eq('tour_id', tourId),
    // X3 fix-up: channel-list Setup chip queries channel_list_rows
    // directly, not a rider_packs proxy. We pull pack ids for this
    // tour first, then probe channel_list_rows.pack_id.
    supabase
      .from('rider_packs')
      .select('id')
      .eq('tour_id', tourId),
    supabase
      .from('rider_packs')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', artistId),
    supabase
      .from('rooming_grid')
      .select('id', { count: 'exact', head: true })
      .eq('tour_id', tourId),
    supabase
      .from('budget_line_items')
      .select('proposed_cost, actual_cost')
      .eq('tour_id', tourId),
  ]);

  if (!artistRes.data) return null;

  // Channel-list real check: any channel_list_rows row whose pack_id
  // belongs to this tour.
  const tourPackIds = ((riderPacksTourRes.data ?? []) as Array<{ id: string }>).map(
    (p) => p.id,
  );
  let channelListSetup = false;
  if (tourPackIds.length > 0) {
    const { data: clRow } = await supabase
      .from('channel_list_rows')
      .select('id')
      .in('pack_id', tourPackIds)
      .limit(1)
      .maybeSingle();
    channelListSetup = clRow !== null;
  }

  // Routing → show-day filter + advance progress lookups.
  const routingRows = (routingRes.data ?? []) as Array<{
    id: string;
    day_type: string | null;
    date: string | null;
  }>;
  const showRoutingIds = routingRows
    .filter((r) => {
      const dt = (r.day_type ?? '').toLowerCase();
      return dt.includes('show') || dt.includes('festival');
    })
    .map((r) => r.id);

  let completeShows = 0;
  if (showRoutingIds.length > 0) {
    const { data: advanceRows } = await supabase
      .from('advance_instances')
      .select('routing_id, sections, section_statuses')
      .in('routing_id', showRoutingIds);
    const advanceByShow = new Map<string, AdvanceInstanceRow>();
    for (const row of (advanceRows ?? []) as AdvanceInstanceRow[]) {
      advanceByShow.set(row.routing_id, row);
    }
    for (const showId of showRoutingIds) {
      const adv = advanceByShow.get(showId);
      if (!adv) continue;
      const sections = adv.sections ?? [];
      const statuses = adv.section_statuses ?? {};
      if (sections.length === 0) continue;
      let allComplete = true;
      for (const sec of sections) {
        const key = sec.template_id ?? sec.label;
        if (!key || statuses[key]?.status !== 'complete') {
          allComplete = false;
          break;
        }
      }
      if (allComplete) completeShows += 1;
    }
  }

  const personnelCount = personnelRes.count ?? 0;
  const ridersArtistCount = riderPacksArtistRes.count ?? 0;
  const routingCount = routingRows.length;
  const roomCount = roomingRes.count ?? 0;

  // Budget aggregate.
  const budgetRows = (budgetRes.data ?? []) as Array<{
    proposed_cost: number | null;
    actual_cost: number | null;
  }>;
  let proposedTotal = 0;
  let actualTotal = 0;
  for (const row of budgetRows) {
    const p = Number(row.proposed_cost ?? 0);
    const a = Number(row.actual_cost ?? 0);
    if (Number.isFinite(p)) proposedTotal += p;
    if (Number.isFinite(a)) actualTotal += a;
  }
  const budgetPercent = proposedTotal > 0 ? (actualTotal / proposedTotal) * 100 : 0;

  const totalShows = showRoutingIds.length;
  const advancePercent = totalShows > 0 ? (completeShows / totalShows) * 100 : 0;

  return {
    tour: {
      id: tourRow.id as string,
      name: (tourRow.name as string | null) ?? 'Tour',
      status: (tourRow.status as string | null) ?? 'planning',
      start_date: (tourRow.start_date as string) ?? '',
      end_date: (tourRow.end_date as string) ?? '',
      currency: (tourRow.currency as string | null) ?? 'GBP',
    },
    artist: {
      id: artistRes.data.id as string,
      name: (artistRes.data.name as string | null) ?? 'Artist',
      spotify_image_url: (artistRes.data.spotify_image_url as string | null) ?? null,
      branding: artistRes.data.branding,
    },
    siblingTours: ((siblingsRes.data ?? []) as Array<{
      id: string;
      name: string | null;
      status: string | null;
    }>)
      .filter((t) => t.id !== tourId)
      .map((t) => ({
        id: t.id,
        name: t.name ?? 'Tour',
        status: t.status ?? 'planning',
      })),
    setup: {
      routing: routingCount > 0,
      channelList: channelListSetup,
      personnel: personnelCount > 0,
      rooming: roomCount > 0,
      ridersLinked: ridersArtistCount,
    },
    advance: {
      totalShows,
      completeShows,
      percent: advancePercent,
    },
    budget: {
      proposed: proposedTotal,
      actual: actualTotal,
      percent: budgetPercent,
      currency: (tourRow.currency as string | null) ?? 'GBP',
    },
    secondary: {
      personnelCount,
      routingCount,
      channelListConfigured: channelListSetup,
      roomCount,
    },
  };
}

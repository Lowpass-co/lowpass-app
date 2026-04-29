/* ============================================
   LOWPASS — Tour Hub server data (Phase C nav redesign)

   Single async fetcher for the /tours/[id] hub. Returns all the
   shaped data the hub renders: tour identity, artist, sibling tours
   for the Switch dropdown, Setup-strip booleans, Advance progress,
   Budget summary, and secondary-card counts.

   Uses Promise.all for parallel reads. Aggregations happen in JS
   rather than SQL where the tour-row counts are typically small —
   one network round-trip beats N count() queries.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Tour, TourStatus } from '@/types';

export type TourHubArtist = {
  id: string;
  name: string;
  spotify_image_url?: string | null;
  branding?: unknown;
};

export type TourHubSiblingTour = {
  id: string;
  name: string;
  status: TourStatus;
};

export type TourHubSetup = {
  /** ✓ when at least one routing row exists. */
  routing: boolean;
  /** ✓ when at least one rider pack exists for this tour (proxy for
      channel-list configuration — improve once channel_list_rows can
      be joined cheaply). */
  channelList: boolean;
  /** ✓ when at least one tour_personnel row exists. */
  personnel: boolean;
  /** ✓ when at least one hotel for this tour has at least one room. */
  rooming: boolean;
  /** Count of artist-level rider packs linked through to this tour
      (applicable via shared artist_id). */
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
  tour: Pick<Tour, 'id' | 'name' | 'status' | 'start_date' | 'end_date' | 'currency'>;
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

/**
 * Returns null when the tour or its artist can't be resolved. Caller
 * is responsible for 404-ing.
 */
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

  // Parallel block — everything we need to render the hub. Each query
  // is shaped to fetch only the columns the page consumes.
  const [
    artistRes,
    siblingsRes,
    routingRes,
    personnelRes,
    riderPacksTourRes,
    riderPacksArtistRes,
    hotelsRes,
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
    supabase
      .from('rider_packs')
      .select('id', { count: 'exact', head: true })
      .eq('tour_id', tourId),
    supabase
      .from('rider_packs')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', artistId),
    supabase
      .from('hotels')
      .select('id')
      .eq('tour_id', tourId),
    supabase
      .from('budget_line_items')
      .select('proposed_cost, actual_cost')
      .eq('tour_id', tourId),
  ]);

  if (!artistRes.data) return null;

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

  // Per-show advance completion. A show counts as complete when its
  // advance_instances row has at least one section AND every section's
  // status === 'complete'. Anything missing reads as incomplete.
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
        if (!key) {
          allComplete = false;
          break;
        }
        if (statuses[key]?.status !== 'complete') {
          allComplete = false;
          break;
        }
      }
      if (allComplete) completeShows += 1;
    }
  }

  // Rooms per hotel — single query keyed by hotel_id IN (...). Skipped
  // when there are no hotels.
  const hotelIds = (hotelsRes.data ?? []).map((h) => (h as { id: string }).id);
  let roomCount = 0;
  if (hotelIds.length > 0) {
    const { count } = await supabase
      .from('rooms')
      .select('id', { count: 'exact', head: true })
      .in('hotel_id', hotelIds);
    roomCount = count ?? 0;
  }

  const personnelCount = personnelRes.count ?? 0;
  const ridersTourCount = riderPacksTourRes.count ?? 0;
  const ridersArtistCount = riderPacksArtistRes.count ?? 0;
  const routingCount = routingRows.length;
  const channelListConfigured = ridersTourCount > 0;

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
      status: (tourRow.status as TourStatus) ?? 'planning',
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
      status: TourStatus | null;
    }>)
      .filter((t) => t.id !== tourId)
      .map((t) => ({
        id: t.id,
        name: t.name ?? 'Tour',
        status: t.status ?? 'planning',
      })),
    setup: {
      routing: routingCount > 0,
      channelList: channelListConfigured,
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
      channelListConfigured,
      roomCount,
    },
  };
}

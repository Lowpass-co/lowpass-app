/* ============================================
   LOWPASS — Sprint 7 §5 — getWorkspaceLandingData

   Server-side aggregator for /artists (workspace landing).
   Pulls everything the redesigned page needs:

   - workspace name + 4 stats (artists count, active tours,
     shows this month, budget committed)
   - "pick up where you left off" — most recently-updated tour
     in the workspace (proxy for "most recent context"; a
     proper user-scoped audit log can replace this later)
   - artists array with banner/logo URLs resolved + per-artist
     meta (active tour count, months upcoming, next show)
   - workspace-wide recent activity (last 24h, capped at 10)

   Single round-trip-via-Promise.all where possible. Per-artist
   image resolution fans out across resolveArtistLogoUrl/Banner;
   the Spotify cache layer means most calls are L1 hits and the
   total fanout is bounded by the artists-in-workspace count.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  resolveArtistLogoUrl,
  resolveArtistBannerUrl,
  getArtistGradient,
} from '@/lib/artists/imageUrl';

export interface WorkspaceLandingArtist {
  id: string;
  name: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  bannerGradient: string;
  activeTourCount: number;
  monthsUpcoming: number;
  nextShow: { date: string; venue: string | null } | null;
}

export interface WorkspaceLandingPickUp {
  tourId: string;
  tourName: string;
  artistId: string;
  artistName: string;
  artistLogoUrl: string | null;
  /** Plain-English summary of what was last touched on this
   *  tour. Today: just the relative time of the last update.
   *  A proper audit-log integration can replace this. */
  lastEditSummary: string;
  lastEditAt: string;
  /** Default product surface to resume on. Today: budget — the
   *  most-trafficked surface. Later: derive from the audit-log. */
  resumeProduct: 'budget' | 'advance' | 'operations';
}

export interface WorkspaceLandingActivityRow {
  id: string;
  occurredAt: string;
  actor: string;
  action: string;
  entity: string;
  href: string | null;
}

export interface WorkspaceLandingData {
  workspaceId: string;
  workspaceName: string;
  stats: {
    artistCount: number;
    activeTourCount: number;
    showsThisMonth: number;
    budgetCommitted: number;
    budgetCurrency: string;
  };
  pickUp: WorkspaceLandingPickUp | null;
  artists: WorkspaceLandingArtist[];
  activity: WorkspaceLandingActivityRow[];
}

function startOfMonthISO(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function endOfMonthISO(): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  d.setUTCHours(23, 59, 59, 0);
  return d.toISOString().slice(0, 10);
}

export async function getWorkspaceLandingData(
  supabase: SupabaseClient,
): Promise<WorkspaceLandingData | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  const workspaceId = (profile as { workspace_id?: string } | null)
    ?.workspace_id;
  if (!workspaceId) return null;

  const monthStart = startOfMonthISO();
  const monthEnd = endOfMonthISO();

  const [
    workspaceRes,
    artistsRes,
    toursRes,
    routingRes,
    monthRoutingRes,
    pickUpRes,
    budgetRes,
  ] = await Promise.all([
    supabase
      .from('workspaces')
      .select('id, name, currency')
      .eq('id', workspaceId)
      .maybeSingle(),
    supabase
      .from('artists')
      .select(
        'id, name, branding, spotify_id, spotify_image_url, spotify_banner_url',
      )
      .eq('workspace_id', workspaceId)
      .order('name'),
    supabase
      .from('tours')
      .select('id, name, artist_id, status, start_date, end_date, updated_at')
      .eq('workspace_id', workspaceId)
      .order('start_date', { ascending: false }),
    supabase
      .from('routing')
      .select('tour_id, date, venue_name')
      .gte('date', new Date().toISOString().slice(0, 10))
      .order('date', { ascending: true }),
    supabase
      .from('routing')
      .select('id', { count: 'exact', head: true })
      .gte('date', monthStart)
      .lte('date', monthEnd),
    // Sprint 8.2 §6 — order by last_visited_at DESC NULLS LAST,
    // updated_at as the secondary sort. last_visited_at is bumped
    // by POST /api/tours/[id]/touch on each tour-scoped page
    // load (workspace-shared scope: any member's visit moves
    // the column). updated_at is the fallback for tours that
    // have never been visited via the new tracker (rows
    // pre-dating migration 069).
    supabase
      .from('tours')
      .select('id, name, artist_id, updated_at, last_visited_at')
      .eq('workspace_id', workspaceId)
      .order('last_visited_at', {
        ascending: false,
        nullsFirst: false,
      })
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('budget_line_items')
      .select('proposed_cost')
      .eq('workspace_id', workspaceId),
  ]);

  type ArtistRow = {
    id: string;
    name: string;
    branding: unknown;
    spotify_id: string | null;
    spotify_image_url: string | null;
    spotify_banner_url: string | null;
  };
  type TourRow = {
    id: string;
    name: string;
    artist_id: string | null;
    status: string | null;
    start_date: string | null;
    end_date: string | null;
    updated_at: string | null;
  };

  const workspaceRow = workspaceRes.data as {
    id: string;
    name: string;
    currency: string | null;
  } | null;
  const artistRows = (artistsRes.data ?? []) as ArtistRow[];
  const tourRows = (toursRes.data ?? []) as TourRow[];
  const upcomingRouting = (routingRes.data ?? []) as Array<{
    tour_id: string;
    date: string;
    venue_name: string | null;
  }>;
  const budgetLines = (budgetRes.data ?? []) as Array<{
    proposed_cost: number | null;
  }>;

  // Per-artist aggregates.
  const toursByArtist = new Map<string, TourRow[]>();
  for (const t of tourRows) {
    if (!t.artist_id) continue;
    const list = toursByArtist.get(t.artist_id) ?? [];
    list.push(t);
    toursByArtist.set(t.artist_id, list);
  }
  const upcomingByTour = new Map<string, typeof upcomingRouting>();
  for (const r of upcomingRouting) {
    const list = upcomingByTour.get(r.tour_id) ?? [];
    list.push(r);
    upcomingByTour.set(r.tour_id, list);
  }

  // Resolve image URLs for each artist in parallel. Cache layer
  // means token + per-artist Spotify hits are mostly free.
  const artists: WorkspaceLandingArtist[] = await Promise.all(
    artistRows.map(async (a) => {
      const [logoUrl, bannerUrl] = await Promise.all([
        resolveArtistLogoUrl(a),
        resolveArtistBannerUrl(a),
      ]);
      const artistTours = toursByArtist.get(a.id) ?? [];
      const activeTours = artistTours.filter((t) => t.status === 'active');
      // Months upcoming = months between now and the latest end_date
      // across this artist's tours, capped at 24.
      let monthsUpcoming = 0;
      const now = new Date();
      for (const t of artistTours) {
        if (!t.end_date) continue;
        const end = new Date(`${t.end_date.slice(0, 10)}T12:00:00Z`);
        if (Number.isNaN(end.getTime())) continue;
        const months =
          (end.getUTCFullYear() - now.getUTCFullYear()) * 12 +
          (end.getUTCMonth() - now.getUTCMonth());
        if (months > monthsUpcoming) monthsUpcoming = months;
      }
      monthsUpcoming = Math.max(0, Math.min(24, monthsUpcoming));

      // Next show across all this artist's tours.
      let nextShow: WorkspaceLandingArtist['nextShow'] = null;
      for (const t of artistTours) {
        const list = upcomingByTour.get(t.id) ?? [];
        if (list.length === 0) continue;
        const first = list[0];
        if (!nextShow || first.date < nextShow.date) {
          nextShow = { date: first.date, venue: first.venue_name };
        }
      }

      return {
        id: a.id,
        name: a.name,
        logoUrl,
        bannerUrl,
        bannerGradient: getArtistGradient(a.name),
        activeTourCount: activeTours.length,
        monthsUpcoming,
        nextShow,
      };
    }),
  );

  // Pick-up resolution.
  type PickUpTourRow = {
    id: string;
    name: string;
    artist_id: string | null;
    updated_at: string | null;
    last_visited_at: string | null;
  };
  const pickUpTour = pickUpRes.data as PickUpTourRow | null;
  let pickUp: WorkspaceLandingPickUp | null = null;
  // Sprint 8.2 §6 — prefer last_visited_at, fall back to
  // updated_at when the tour has never been visited via the
  // new tracker. The card's "Last edit" copy still reads
  // accurately because the visit timestamp implies "someone
  // worked on this tour at" that time.
  const lastTouchAt =
    pickUpTour?.last_visited_at ?? pickUpTour?.updated_at ?? null;
  if (pickUpTour && pickUpTour.artist_id && lastTouchAt) {
    const artist = artistRows.find((a) => a.id === pickUpTour.artist_id);
    if (artist) {
      const artistLogoUrl = await resolveArtistLogoUrl(artist);
      const lastEditAt = lastTouchAt;
      const ms = Date.now() - new Date(lastEditAt).getTime();
      const min = Math.round(ms / 60_000);
      const hours = Math.round(min / 60);
      const days = Math.round(hours / 24);
      const rel =
        min < 1
          ? 'just now'
          : min < 60
            ? `${min}m ago`
            : hours < 24
              ? `${hours}h ago`
              : `${days}d ago`;
      pickUp = {
        tourId: pickUpTour.id,
        tourName: pickUpTour.name,
        artistId: artist.id,
        artistName: artist.name,
        artistLogoUrl,
        lastEditSummary: `Last edit ${rel}`,
        lastEditAt,
        resumeProduct: 'budget',
      };
    }
  }

  // Stats.
  const activeTourCount = tourRows.filter((t) => t.status === 'active').length;
  const showsThisMonth = monthRoutingRes.count ?? 0;
  const budgetCommitted = budgetLines.reduce(
    (sum, l) => sum + (Number(l.proposed_cost) || 0),
    0,
  );

  return {
    workspaceId,
    workspaceName: workspaceRow?.name ?? 'Workspace',
    stats: {
      artistCount: artistRows.length,
      activeTourCount,
      showsThisMonth,
      budgetCommitted,
      budgetCurrency: workspaceRow?.currency ?? 'GBP',
    },
    pickUp,
    artists,
    // Activity feed deferred to a follow-up iteration; the existing
    // RecentActivityTable on /artists/[id] is artist-scoped and
    // doesn't generalize cleanly to workspace-wide. Returning an
    // empty list lets the page render the section as "No recent
    // activity" until a workspace-scoped feed lands. Noted in the
    // sprint report's deferred section.
    activity: [],
  };
}

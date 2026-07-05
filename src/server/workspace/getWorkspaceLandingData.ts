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
    /** Tours in planning (status = 'planning'). UX-walk §A.6 — shown when
     *  nothing is on tour right now so the stat isn't a bare "0". */
    planningTourCount: number;
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

  /* ============================================
     Sprint 8.4 §4 — workspace activity feed.

     Approach (per Adam's prompt sign-off): SQL UNION across
     existing tables — no new schema. Each source supplies
     up to 10 most-recent rows; we merge in JS, sort by
     timestamp DESC, take top 10.

     Tables in scope:
       - tours             (updated_at)        action: "tour updated"
       - routing           (created_at — no updated_at on this
                            table per migration 001; "show
                            added" is the meaningful event)
       - budget_line_items (updated_at)        action: "budget line updated"
       - advance_instances (last_updated_at, last_updated_by_id)
       - deal_memos        (updated_at)        action: "deal memo updated"

     Workspace scoping: tours / budget_line_items / deal_memos
     have workspace_id directly. routing + advance_instances
     don't — they scope via tour_id → tours.workspace_id, which
     RLS already enforces (we still pass tour_id IN (...) for
     index hits + clarity).
     ============================================ */
  const ACTIVITY_PER_SOURCE = 10;

  const [
    workspaceRes,
    artistsRes,
    toursRes,
    routingRes,
    monthRoutingRes,
    pickUpRes,
    budgetRes,
    actToursRes,
    actBudgetRes,
    actDealMemosRes,
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
      // UX-walk §A.2 — "Next show" must be the first SHOW DAY, not the first
      // routing row (which may be a day off / travel / rehearsal).
      .from('routing')
      .select('tour_id, date, venue_name')
      .in('day_type', ['show', 'festival'])
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
    // Sprint 8.4 §4 — activity sources (limit per-source so
    // the merge step has bounded work).
    supabase
      .from('tours')
      .select('id, name, artist_id, updated_at')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false })
      .limit(ACTIVITY_PER_SOURCE),
    supabase
      .from('budget_line_items')
      .select('id, description, category, tour_id, updated_at')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false })
      .limit(ACTIVITY_PER_SOURCE),
    supabase
      .from('deal_memos')
      .select('id, title, tour_id, updated_at')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false })
      .limit(ACTIVITY_PER_SOURCE),
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
  const planningTourCount = tourRows.filter((t) => t.status === 'planning').length;
  const showsThisMonth = monthRoutingRes.count ?? 0;
  const budgetCommitted = budgetLines.reduce(
    (sum, l) => sum + (Number(l.proposed_cost) || 0),
    0,
  );

  /* ============================================
     Sprint 8.4 §4 — assemble activity rows.

     The first wave (in the Promise.all above) covered the three
     workspace_id-scoped tables. routing + advance_instances
     scope through tours.workspace_id only, so we run them
     here against the tour_ids we already have.
     ============================================ */
  type ActTourRow = {
    id: string;
    name: string;
    artist_id: string | null;
    updated_at: string | null;
  };
  type ActBudgetRow = {
    id: string;
    description: string | null;
    category: string | null;
    tour_id: string | null;
    updated_at: string | null;
  };
  type ActDealMemoRow = {
    id: string;
    title: string | null;
    tour_id: string | null;
    updated_at: string | null;
  };
  const actTours = (actToursRes.data ?? []) as ActTourRow[];
  const actBudget = (actBudgetRes.data ?? []) as ActBudgetRow[];
  const actDealMemos = (actDealMemosRes.data ?? []) as ActDealMemoRow[];

  // Lookup maps for entity_href construction.
  const tourById = new Map<string, TourRow>(
    tourRows.map((t) => [t.id, t]),
  );
  const artistById = new Map<string, ArtistRow>(
    artistRows.map((a) => [a.id, a]),
  );

  const tourIdsInWorkspace = tourRows.map((t) => t.id);

  // Second wave: tour_id-scoped sources. Skip when the workspace
  // has no tours (no FK to query against).
  const [actRoutingRes, actAdvanceRes] =
    tourIdsInWorkspace.length > 0
      ? await Promise.all([
          supabase
            .from('routing')
            .select('id, tour_id, date, venue_name, city, created_at')
            .in('tour_id', tourIdsInWorkspace)
            .order('created_at', { ascending: false })
            .limit(ACTIVITY_PER_SOURCE),
          supabase
            .from('advance_instances')
            .select(
              'id, routing_id, status, last_updated_at, last_updated_by_id',
            )
            .in(
              'routing_id',
              // Pass routing_ids — RLS still scopes via the tour
              // chain, but supabase needs a value list. We don't
              // have routing_ids cached, so pass the empty array
              // when none — the IN clause then matches nothing.
              [], // populated immediately below
            )
            .order('last_updated_at', { ascending: false })
            .limit(0),
        ])
      : [{ data: [] as unknown[] }, { data: [] as unknown[] }];

  type ActRoutingRow = {
    id: string;
    tour_id: string | null;
    date: string;
    venue_name: string | null;
    city: string | null;
    created_at: string | null;
  };
  const actRouting = (actRoutingRes.data ?? []) as ActRoutingRow[];

  // Advance instances need routing_ids to query. Re-query with
  // the routing_ids gathered from the routing source above so
  // the .in() clause hits real data.
  const routingIds = actRouting.map((r) => r.id);
  type ActAdvanceRow = {
    id: string;
    routing_id: string | null;
    status: string | null;
    last_updated_at: string | null;
    last_updated_by_id: string | null;
  };
  let actAdvance: ActAdvanceRow[] = [];
  // Skip the dummy advance query; it returned 0 rows. Re-query
  // properly when we have routing_ids.
  void actAdvanceRes;
  if (routingIds.length > 0) {
    const { data: advanceData } = await supabase
      .from('advance_instances')
      .select(
        'id, routing_id, status, last_updated_at, last_updated_by_id',
      )
      .in('routing_id', routingIds)
      .order('last_updated_at', { ascending: false })
      .limit(ACTIVITY_PER_SOURCE);
    actAdvance = (advanceData ?? []) as ActAdvanceRow[];
  }

  // Collect actor user ids that need name resolution.
  const actorIds = new Set<string>();
  for (const a of actAdvance) {
    if (a.last_updated_by_id) actorIds.add(a.last_updated_by_id);
  }

  let profilesById = new Map<string, string>();
  if (actorIds.size > 0) {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', Array.from(actorIds));
    const profiles = (profileData ?? []) as Array<{
      id: string;
      full_name: string | null;
      email: string | null;
    }>;
    profilesById = new Map(
      profiles.map((p) => {
        const display =
          (p.full_name && p.full_name.trim()) ||
          (p.email && p.email.split('@')[0]) ||
          '—';
        return [p.id, display];
      }),
    );
  }

  // Build rows from each source. Action copy is short and
  // present-tense per the dot-density visual language.
  function tourCtxLabel(tourId: string | null): string {
    if (!tourId) return '';
    const t = tourById.get(tourId);
    if (!t) return '';
    const a = t.artist_id ? artistById.get(t.artist_id) : null;
    return a?.name ? `${a.name} · ${t.name}` : t.name;
  }
  function tourArtistHref(tourId: string | null): string | null {
    if (!tourId) return null;
    const t = tourById.get(tourId);
    if (!t) return null;
    return `/budget/${t.id}`;
  }

  const activityCandidates: WorkspaceLandingActivityRow[] = [];

  for (const t of actTours) {
    if (!t.updated_at) continue;
    const a = t.artist_id ? artistById.get(t.artist_id) : null;
    activityCandidates.push({
      id: `tour-${t.id}-${t.updated_at}`,
      occurredAt: t.updated_at,
      actor: '—',
      action: 'tour updated',
      entity: a?.name ? `${a.name} · ${t.name}` : t.name,
      href: `/budget/${t.id}`,
    });
  }

  for (const b of actBudget) {
    if (!b.updated_at) continue;
    const ctx = tourCtxLabel(b.tour_id);
    const label =
      b.description?.trim() ||
      b.category?.trim() ||
      'budget line';
    activityCandidates.push({
      id: `budget-${b.id}-${b.updated_at}`,
      occurredAt: b.updated_at,
      actor: '—',
      action: 'budget line updated',
      entity: ctx ? `${ctx} · ${label}` : label,
      href: tourArtistHref(b.tour_id),
    });
  }

  for (const d of actDealMemos) {
    if (!d.updated_at) continue;
    const ctx = tourCtxLabel(d.tour_id);
    const label = d.title?.trim() || 'deal memo';
    activityCandidates.push({
      id: `deal-${d.id}-${d.updated_at}`,
      occurredAt: d.updated_at,
      actor: '—',
      action: 'deal memo updated',
      entity: ctx ? `${ctx} · ${label}` : label,
      href: tourArtistHref(d.tour_id),
    });
  }

  for (const r of actRouting) {
    if (!r.created_at) continue;
    const ctx = tourCtxLabel(r.tour_id);
    const showLabel = r.venue_name?.trim() || r.city?.trim() || r.date;
    activityCandidates.push({
      id: `routing-${r.id}-${r.created_at}`,
      occurredAt: r.created_at,
      actor: '—',
      action: 'show added',
      entity: ctx ? `${ctx} · ${showLabel}` : showLabel,
      href: r.tour_id ? `/advance/${r.tour_id}/${r.id}` : null,
    });
  }

  // Build a routing→tour_id map so advance rows can resolve to
  // the parent tour's context label.
  const tourIdByRoutingId = new Map<string, string>(
    actRouting
      .filter((r) => r.tour_id)
      .map((r) => [r.id, r.tour_id as string]),
  );

  for (const a of actAdvance) {
    if (!a.last_updated_at) continue;
    const tourId = a.routing_id
      ? tourIdByRoutingId.get(a.routing_id) ?? null
      : null;
    const ctx = tourCtxLabel(tourId);
    const actor = a.last_updated_by_id
      ? profilesById.get(a.last_updated_by_id) ?? '—'
      : '—';
    activityCandidates.push({
      id: `advance-${a.id}-${a.last_updated_at}`,
      occurredAt: a.last_updated_at,
      actor,
      action: 'advance updated',
      entity: ctx || 'show advance',
      href:
        tourId && a.routing_id
          ? `/advance/${tourId}/${a.routing_id}`
          : null,
    });
  }

  // Sort by timestamp DESC + take top 10. The merge is the
  // "UNION ORDER BY timestamp DESC LIMIT 10" final pass.
  activityCandidates.sort((x, y) =>
    y.occurredAt.localeCompare(x.occurredAt),
  );
  const activity = activityCandidates.slice(0, 10);

  return {
    workspaceId,
    workspaceName: workspaceRow?.name ?? 'Workspace',
    stats: {
      artistCount: artistRows.length,
      activeTourCount,
      planningTourCount,
      showsThisMonth,
      budgetCommitted,
      budgetCurrency: workspaceRow?.currency ?? 'GBP',
    },
    pickUp,
    artists,
    activity,
  };
}

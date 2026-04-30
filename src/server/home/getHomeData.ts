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
  /** Display name of who did the action — best-effort lookup; falls
      back to email-local-part, then '—'. Phase 1 §B addition. */
  actor: string;
  summary: string;
  occurredAt: string;
};

export type HomeCalendarCell = {
  date: string; // YYYY-MM-DD
  dayType: string;
  city: string | null;
  venue: string | null;
  tourId: string;
  routingId: string;
};

/** One number + label per product for the Home product cards.
    Surface-level "what's hot" — see prompt §B.2. */
export type HomeWhatsHot = {
  operations: { value: number; label: string };
  budget: { value: number; label: string };
  advance: { value: number; label: string };
};

export type HomeData = {
  artist: HomeArtist;
  stats: HomeStats;
  tours: HomeTourSummary[];
  recentActivity: HomeActivityRow[];
  /** Phase 1 §B: artist-scoped calendar cells, next 30 days. */
  calendar: HomeCalendarCell[];
  /** Phase 1 §B: single actionable metric per product card. */
  whatsHot: HomeWhatsHot;
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
          .select('id, tour_id, label, updated_at, status, created_by')
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
    created_by?: string | null;
  }>;
  // Phase 1 §B: collect actor user-ids first; resolve display names
  // in one batch lookup at the end. Best-effort — falls back to '—'
  // if profiles row is missing.
  const actorIds = new Set<string>();
  for (const row of budgetUpdates) {
    if (row.created_by) actorIds.add(row.created_by);
  }
  const recentActivity: HomeActivityRow[] = [];
  for (const row of budgetUpdates) {
    if (!row.updated_at) continue;
    recentActivity.push({
      id: `budget-${row.id}`,
      product: 'budget',
      tourId: row.tour_id,
      tourName: tourNameById.get(row.tour_id) ?? 'Tour',
      actor: row.created_by ?? '',
      summary: `${row.label ?? 'Line item'} · ${(row.status ?? 'draft').toString()}`,
      occurredAt: row.updated_at,
    });
  }
  for (const adv of advanceUpdates) {
    if (!adv.updated_at) continue;
    recentActivity.push({
      id: `advance-${adv.id}`,
      product: 'advance',
      tourId: '',
      tourName: '',
      actor: '',
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
      actor: '',
      summary: `Tour metadata updated`,
      occurredAt: t.updated_at,
    });
  }
  recentActivity.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  const top10 = recentActivity.slice(0, 10);

  // Phase 1 §B — Resolve actor display names. Best-effort: pulls
  // `profiles.full_name | email`. If profiles is missing or join
  // fails, we render '—' rather than a UUID.
  if (actorIds.size > 0) {
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', Array.from(actorIds));
    const nameById = new Map<string, string>();
    for (const p of (profileRows ?? []) as Array<{
      id: string;
      full_name: string | null;
      email: string | null;
    }>) {
      const display =
        (p.full_name && p.full_name.trim()) ||
        (p.email && p.email.split('@')[0]) ||
        '';
      if (display) nameById.set(p.id, display);
    }
    for (const row of top10) {
      if (row.actor && nameById.has(row.actor)) {
        row.actor = nameById.get(row.actor) as string;
      } else if (row.actor) {
        row.actor = '';
      }
    }
  }

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

  // Phase 1 §B — Calendar widget data (next 30 days, artist-scoped) +
  // "what's hot" metrics per product card. Two cheap queries.
  const todayIso = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);
  const in30 = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 30),
  )
    .toISOString()
    .slice(0, 10);

  const calendarRes =
    tourIds.length > 0
      ? await supabase
          .from('routing')
          .select('id, tour_id, date, day_type, city, venue_name')
          .in('tour_id', tourIds)
          .gte('date', todayIso)
          .lte('date', in30)
          .order('date', { ascending: true })
      : { data: [] as unknown[] };

  const calendar: HomeCalendarCell[] = (
    (calendarRes.data ?? []) as Array<{
      id: string;
      tour_id: string;
      date: string | null;
      day_type: string | null;
      city: string | null;
      venue_name: string | null;
    }>
  )
    .filter((r) => r.date)
    .map((r) => ({
      date: r.date as string,
      dayType: r.day_type ?? '',
      city: r.city,
      venue: r.venue_name,
      tourId: r.tour_id,
      routingId: r.id,
    }));

  // What's hot per product:
  //   Operations  → upcoming shows in next 30 days
  //   Budget      → draft line items needing review
  //   Advance     → show routings in next 30 days that lack an
  //                 advance_instance (best-effort — counts shows
  //                 minus advances; clamps at 0).
  const upcomingShows = calendar.filter((c) => {
    const dt = c.dayType.toLowerCase();
    return dt.includes('show') || dt.includes('festival');
  }).length;

  const draftBudgetLines = budgetRows.filter(
    (r) => (r.status ?? '').toLowerCase() === 'draft',
  ).length;

  // Pull the count of advance_instances whose routing falls in the
  // next 30 days; subtract from upcomingShows to get "shows missing
  // advance". Cheap-ish query — limit to the routing IDs already in
  // the calendar window.
  const upcomingShowRoutingIds = calendar
    .filter((c) => {
      const dt = c.dayType.toLowerCase();
      return dt.includes('show') || dt.includes('festival');
    })
    .map((c) => c.routingId);
  let advanceCoverage = 0;
  if (upcomingShowRoutingIds.length > 0) {
    const { data: advRows } = await supabase
      .from('advance_instances')
      .select('routing_id')
      .in('routing_id', upcomingShowRoutingIds);
    const covered = new Set(
      ((advRows ?? []) as Array<{ routing_id: string }>).map((r) => r.routing_id),
    );
    advanceCoverage = covered.size;
  }
  const showsMissingAdvance = Math.max(
    0,
    upcomingShowRoutingIds.length - advanceCoverage,
  );

  const whatsHot: HomeWhatsHot = {
    operations: {
      value: upcomingShows,
      label:
        upcomingShows === 1
          ? 'show in the next 30 days'
          : 'shows in the next 30 days',
    },
    budget: {
      value: draftBudgetLines,
      label:
        draftBudgetLines === 1
          ? 'draft line item to review'
          : 'draft line items to review',
    },
    advance: {
      value: showsMissingAdvance,
      label:
        showsMissingAdvance === 1
          ? 'show missing advance'
          : 'shows missing advance',
    },
  };

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
    calendar,
    whatsHot,
  };
}

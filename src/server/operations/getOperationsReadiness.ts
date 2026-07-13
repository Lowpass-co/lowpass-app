/* ============================================================
   LOWPASS — getOperationsReadiness (Design pass §9 · TR-01/TR-02)

   Shared server loader for the Operations "readiness + pending" data. Ported
   verbatim from the old /operations/[tourId] tour-root page so BOTH consumers
   agree:

   - /operations/[tourId]/summary  — the full summary surface (cards + quick
     actions + activity + upcoming shows), relocated here from the tour root.
   - /operations/[tourId]/routing  — the new tour landing, which renders the
     de-boxed readiness rail (Shows / Crew / Conflicts / Pending) from this
     same data.

   VENUE GUARDRAIL — the routing read joins canonical + discriminator columns
   and resolves each row through resolveVenue (live → canonical, past/frozen →
   snapshot). No raw venue_* is surfaced.
   ============================================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveVenue, type RoutingVenueSource } from '@/lib/venues/resolveVenue';
import { nextShow as deriveNextShow, type DeriveRoutingDay } from '@/lib/derive/tourStatus';

export interface ReadinessActivityRow {
  id: string;
  action: string;
  entity_type: string;
  created_at: string;
  actor_name: string | null;
  field_changes: Record<string, unknown> | null;
}

export interface ReadinessUpcomingShow {
  id: string;
  date: string;
  city: string | null;
  venue_name: string | null;
  venue_capacity: number | null;
}

export interface ReadinessRoutingDate {
  id: string;
  date: string;
  city: string | null;
  venue_name: string | null;
}

export interface ReadinessPendingPersonnel {
  id: string;
  display_name: string;
  role: string;
  status: string;
}

export interface ReadinessPendingShow {
  id: string;
  date: string;
  city: string | null;
}

export interface OperationsReadiness {
  shows: { count: number; nextShowDate: string | null };
  /** §C4 — advances complete vs total show days (the routing landing rail). */
  advances: { done: number; total: number };
  crew: { count: number; excludePersonIds: string[] };
  /** §C4 — committed spend (sum of budget_line_items.proposed_cost) + currency. */
  budget: { committed: number; currency: string };
  conflicts: { count: number };
  pending: {
    awaitingContract: ReadinessPendingPersonnel[];
    tentative: ReadinessPendingPersonnel[];
    showsWithoutVenue: ReadinessPendingShow[];
  };
  recentActivity: ReadinessActivityRow[];
  upcomingShows: ReadinessUpcomingShow[];
  allRoutingDates: ReadinessRoutingDate[];
}

interface TourPersonnelJoined {
  id: string;
  person_id: string;
  role: string;
  status: string;
}

interface PersonRow {
  id: string;
  full_name: string;
  preferred_name: string | null;
  email: string | null;
  canonical_person_id: string | null;
}

export async function getOperationsReadiness(
  supabase: SupabaseClient,
  args: {
    tourId: string;
    workspaceId: string;
    tourStartDate: string | null;
    tourEndDate: string | null;
  },
): Promise<OperationsReadiness> {
  const { tourId, workspaceId, tourStartDate, tourEndDate } = args;

  const now = Date.now();
  const todayIso = new Date(now).toISOString().slice(0, 10);
  const sevenDaysAgoIso = new Date(now - 7 * 86400000).toISOString();

  const [routingRes, tpRes, auditRes] = await Promise.all([
    supabase
      .from('routing')
      // Venue SSOT — join canonical + discriminator columns so venue facts
      // resolve (live → canonical, past → snapshot); this SSR read resolves only.
      .select(
        'id, date, day_type, city, country, address, venue_name, venue_phone, venue_website, venue_capacity, canonical_venue_id, venue_frozen_at, canonical:canonical_venues(id, name, address, city, country, capacity)',
      )
      .eq('tour_id', tourId)
      .order('date'),
    supabase
      .from('tour_personnel')
      .select('id, person_id, role, status')
      .eq('tour_id', tourId),
    supabase
      .from('audit_log')
      .select('id, action, entity_type, actor_user_id, field_changes, created_at')
      .eq('workspace_id', workspaceId)
      .in('entity_type', ['routing', 'tour_personnel', 'tour'])
      .gte('created_at', sevenDaysAgoIso)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  // A-closeout — A1-class embed resilience: if the canonical embed select fails
  // at runtime (missing/renamed FK relationship makes PostgREST reject the whole
  // query), routingRes.data is null → the readiness rail derives "SHOWS 0 · none
  // upcoming" for a tour with real shows. Retry without the join; resolveVenue
  // then reads the routing.venue_* snapshot per row (correct for display).
  let routingData = routingRes.data;
  // F1 — retry on EMPTY as well as error. On some production schemas PostgREST
  // returns the embed query with rows:[] and error:null (rather than a hard
  // error), so the error-only guard never fired → the rail read "0 shows" over a
  // fully-rendered grid. An empty routing result for a tour is the signal to fall
  // back to the plain (embed-free) read.
  if (routingRes.error || !routingData || routingData.length === 0) {
    if (routingRes.error) {
      console.error('[getOperationsReadiness] canonical embed failed, retrying plain:', routingRes.error.message);
    }
    const { data: plain } = await supabase
      .from('routing')
      .select(
        'id, date, day_type, city, country, address, venue_name, venue_phone, venue_website, venue_capacity, canonical_venue_id, venue_frozen_at',
      )
      .eq('tour_id', tourId)
      .order('date');
    // The plain rows lack the joined `canonical` — resolveVenue reads the
    // routing.venue_* snapshot when it's absent, so the cast is safe.
    if (plain && plain.length > 0) routingData = plain as typeof routingData;
  }

  const routing = ((routingData ?? []) as RoutingVenueSource[]).map((r) => {
    const v = resolveVenue(r);
    return {
      id: r.id as string,
      date: r.date as string,
      day_type: (r as { day_type?: string | null }).day_type ?? null,
      city: v.city,
      venue_name: v.name,
      venue_capacity: v.capacity,
    };
  });
  const tourPersonnel = (tpRes.data ?? []) as TourPersonnelJoined[];
  const auditRows = (auditRes.data ?? []) as Array<{
    id: string;
    action: string;
    entity_type: string;
    actor_user_id: string | null;
    field_changes: Record<string, unknown> | null;
    created_at: string;
  }>;

  const personIds = Array.from(new Set(tourPersonnel.map((tp) => tp.person_id)));
  const actorIds = Array.from(
    new Set(auditRows.map((a) => a.actor_user_id).filter((v): v is string => !!v)),
  );

  const [personsRes, profilesRes] = await Promise.all([
    personIds.length > 0
      ? supabase
          .from('persons')
          .select('id, full_name, preferred_name, email, canonical_person_id')
          .in('id', personIds)
      : Promise.resolve({ data: [] as PersonRow[] }),
    actorIds.length > 0
      ? supabase.from('profiles').select('id, name').in('id', actorIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string | null }> }),
  ]);

  const personById = new Map(
    ((personsRes.data ?? []) as PersonRow[]).map((p) => [p.id, p]),
  );
  const actorNameById = new Map(
    ((profilesRes.data ?? []) as Array<{ id: string; name: string | null }>).map(
      (p) => [p.id, p.name],
    ),
  );

  // Conflicts — sum BOTH RPCs (canonical + email fallback) so personnel with a
  // NULL canonical_person_id still count.
  const canonicalIds = Array.from(
    new Set(
      tourPersonnel
        .map((tp) => personById.get(tp.person_id)?.canonical_person_id ?? null)
        .filter((v): v is string => !!v),
    ),
  );
  const fallbackEmails = Array.from(
    new Set(
      tourPersonnel
        .map((tp) => {
          const p = personById.get(tp.person_id);
          if (!p || p.canonical_person_id) return null;
          return p.email ? p.email.trim().toLowerCase() : null;
        })
        .filter((v): v is string => !!v && v.length > 0),
    ),
  );
  let conflictCount = 0;
  if (tourStartDate && tourEndDate) {
    const calls: Array<Promise<{ data: unknown[] | null }>> = [];
    if (canonicalIds.length > 0) {
      calls.push(
        supabase.rpc('check_personnel_conflicts_batch', {
          p_canonical_person_ids: canonicalIds,
          p_start_date: tourStartDate,
          p_end_date: tourEndDate,
          p_excluding_tour_id: tourId,
        }) as unknown as Promise<{ data: unknown[] | null }>,
      );
    }
    if (fallbackEmails.length > 0) {
      calls.push(
        supabase.rpc('check_personnel_conflicts_by_email_batch', {
          p_emails: fallbackEmails,
          p_start_date: tourStartDate,
          p_end_date: tourEndDate,
          p_excluding_tour_id: tourId,
        }) as unknown as Promise<{ data: unknown[] | null }>,
      );
    }
    if (calls.length > 0) {
      const results = await Promise.all(calls);
      for (const r of results) conflictCount += (r.data ?? []).length;
    }
  }

  const awaitingContract = tourPersonnel
    .filter((tp) => tp.status === 'awaiting_contract')
    .map((tp) => {
      const p = personById.get(tp.person_id);
      return {
        id: tp.id,
        display_name: p?.preferred_name?.trim() || p?.full_name?.trim() || 'Unknown',
        role: tp.role,
        status: tp.status,
      };
    });
  const tentative = tourPersonnel
    .filter((tp) => tp.status === 'tentative')
    .map((tp) => {
      const p = personById.get(tp.person_id);
      return {
        id: tp.id,
        display_name: p?.preferred_name?.trim() || p?.full_name?.trim() || 'Unknown',
        role: tp.role,
        status: tp.status,
      };
    });
  const showsWithoutVenue = routing
    .filter((r) => {
      const types = (r.day_type ?? '').split(',').map((s) => s.trim());
      return types.includes('show') && (!r.venue_name || r.venue_name.trim() === '');
    })
    .map((r) => ({ id: r.id, date: r.date, city: r.city }));

  const showRows = routing.filter((r) => {
    const types = (r.day_type ?? '').split(',').map((s) => s.trim());
    return types.includes('show') || types.includes('festival');
  });
  const upcomingShows = showRows
    .filter((r) => r.date >= todayIso)
    .slice(0, 5)
    .map((r) => ({
      id: r.id,
      date: r.date,
      city: r.city,
      venue_name: r.venue_name,
      venue_capacity: r.venue_capacity,
    }));
  // A3 — nextShow via the single derivation module (Show-Day filtered). The
  // count/filter here is already correct; the "none upcoming with 11 shows" the
  // audit saw is the A1 canonical-embed read fragility (routing came back empty),
  // not this logic.
  const nextShowDate =
    deriveNextShow(routing as unknown as DeriveRoutingDay[], todayIso)?.date ?? null;

  const recentActivity = auditRows.map((a) => ({
    id: a.id,
    action: a.action,
    entity_type: a.entity_type,
    created_at: a.created_at,
    actor_name: a.actor_user_id ? actorNameById.get(a.actor_user_id) ?? null : null,
    field_changes: a.field_changes,
  }));

  const allRoutingDates = routing.map((r) => ({
    id: r.id,
    date: r.date,
    city: r.city,
    venue_name: r.venue_name,
  }));

  const excludePersonIds = Array.from(new Set(tourPersonnel.map((tp) => tp.person_id)));

  // §C4 — readiness rail extras: Advances (complete vs total show days) + Budget
  // (committed spend + display currency). Bounded queries keyed by this tour.
  const showRoutingIds = showRows.map((r) => r.id);
  const [advanceRes, budgetRes, tourCcyRes] = await Promise.all([
    showRoutingIds.length > 0
      ? supabase.from('advance_instances').select('routing_id, status').in('routing_id', showRoutingIds)
      : Promise.resolve({ data: [] as Array<{ routing_id: string; status: string | null }> }),
    supabase.from('budget_line_items').select('proposed_cost').eq('tour_id', tourId),
    // F1 — the committed figure is in the TOUR's currency, not the workspace's.
    // Showing "£2K" on a USD tour was reading the wrong currency; fall back to the
    // workspace currency only when the tour has none.
    supabase.from('tours').select('currency').eq('id', tourId).maybeSingle(),
  ]);
  const advancesDone = ((advanceRes.data ?? []) as Array<{ status: string | null }>).filter(
    (a) => a.status === 'complete',
  ).length;
  const budgetCommitted = ((budgetRes.data ?? []) as Array<{ proposed_cost: number | null }>).reduce(
    (sum, l) => sum + (Number(l.proposed_cost) || 0),
    0,
  );
  let budgetCurrency = (tourCcyRes.data as { currency?: string | null } | null)?.currency ?? null;
  if (!budgetCurrency) {
    const { data: ws } = await supabase.from('workspaces').select('currency').eq('id', workspaceId).maybeSingle();
    budgetCurrency = (ws as { currency?: string | null } | null)?.currency ?? 'GBP';
  }

  return {
    shows: { count: showRows.length, nextShowDate },
    advances: { done: advancesDone, total: showRows.length },
    crew: { count: tourPersonnel.length, excludePersonIds },
    budget: { committed: budgetCommitted, currency: budgetCurrency },
    conflicts: { count: conflictCount },
    pending: { awaitingContract, tentative, showsWithoutVenue },
    recentActivity,
    upcomingShows,
    allRoutingDates,
  };
}

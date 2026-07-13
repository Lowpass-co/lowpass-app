/* ============================================================
   LOWPASS — /api/debug/derivations (alignment F0 · observability)

   Site-admin-gated JSON that reports, for a tour (or every tour in the caller's
   workspace when ?tourId= is omitted), the DERIVED values the workspace cards +
   routing readiness rail show — AND a per-QUERY ok/error/rowCount flag for every
   source query each value depends on.

   Purpose: the last three regressions were debugged by theorising about which
   query silently returned empty on production (canonical-embed failures, row
   caps). This endpoint ends that: Cowork hits it authenticated on prod and pastes
   the output, so the real failing query is named, not guessed.

   Gate mirrors bugs/page.tsx (getUserAndAdminStatus → 404 for non-admins). No
   writes; RLS still scopes every read to the caller's workspace.
   ============================================================ */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getUserAndAdminStatus } from '@/lib/site-admin';
import { resolveVenue, type RoutingVenueSource } from '@/lib/venues/resolveVenue';
import {
  tourStatusLine,
  nextShow as deriveNextShow,
  type DeriveTour,
  type DeriveRoutingDay,
} from '@/lib/derive/tourStatus';

export const dynamic = 'force-dynamic';

const EMBED_SELECT =
  'id, tour_id, date, day_type, city, country, address, venue_name, venue_phone, venue_website, venue_capacity, canonical_venue_id, venue_frozen_at, canonical:canonical_venues(id, name, address, city, country, capacity)';
const PLAIN_SELECT =
  'id, tour_id, date, day_type, city, country, address, venue_name, venue_phone, venue_website, venue_capacity, canonical_venue_id, venue_frozen_at';

interface QueryProbe {
  ok: boolean;
  error: string | null;
  rowCount: number;
}

/** Run a probe and capture ok/error/rowCount without throwing. */
async function probe<T>(
  run: () => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ probe: QueryProbe; data: T[] }> {
  try {
    const { data, error } = await run();
    return {
      probe: { ok: !error, error: error?.message ?? null, rowCount: (data ?? []).length },
      data: (data ?? []) as T[],
    };
  } catch (e) {
    return { probe: { ok: false, error: e instanceof Error ? e.message : String(e), rowCount: 0 }, data: [] };
  }
}

function isShowDay(dayType: string | null): boolean {
  const first = (dayType ?? '').split(',')[0]?.trim().toLowerCase();
  return first === 'show' || first === 'festival';
}

type TourRow = {
  id: string;
  name: string | null;
  artist_id: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  currency: string | null;
};

async function derivationsForTour(
  supabase: SupabaseClient,
  tour: TourRow,
  workspaceCurrency: string,
  todayIso: string,
) {
  const queries: Record<string, QueryProbe> = {};

  // 1 — routing via the canonical embed (the query the cards + rail use).
  const embed = await probe<RoutingVenueSource & { id: string; tour_id: string; date: string; day_type: string | null }>(
    () => supabase.from('routing').select(EMBED_SELECT).eq('tour_id', tour.id).order('date') as never,
  );
  queries['routing.embed'] = embed.probe;

  // 2 — routing plain (the retry path). Always run it so we can compare.
  const plain = await probe<RoutingVenueSource & { id: string; tour_id: string; date: string; day_type: string | null }>(
    () => supabase.from('routing').select(PLAIN_SELECT).eq('tour_id', tour.id).order('date') as never,
  );
  queries['routing.plain'] = plain.probe;

  // 3 — light routing (date + day_type only): what statusLine/fingerprint need.
  const light = await probe<{ date: string; day_type: string | null }>(
    () => supabase.from('routing').select('date, day_type').eq('tour_id', tour.id).order('date') as never,
  );
  queries['routing.light'] = light.probe;

  // Prefer embed rows, fall back to plain, then light (date/day_type only).
  const rows: Array<{ id?: string; date: string; day_type: string | null } & Partial<RoutingVenueSource>> =
    embed.probe.ok && embed.data.length > 0
      ? embed.data
      : plain.probe.ok && plain.data.length > 0
        ? plain.data
        : light.data.map((r) => ({ date: r.date, day_type: r.day_type }));
  const usedSource = embed.probe.ok && embed.data.length > 0 ? 'embed' : plain.probe.ok && plain.data.length > 0 ? 'plain' : 'light';

  const days: DeriveRoutingDay[] = rows.map((r) => ({ date: r.date, day_type: r.day_type ?? 'off' }));
  const showRows = rows.filter((r) => isShowDay(r.day_type ?? null));
  const showIds = showRows.map((r) => r.id).filter((v): v is string => !!v);

  // 4 — advances over the show routing ids.
  const adv = showIds.length
    ? await probe<{ routing_id: string; status: string | null }>(
        () => supabase.from('advance_instances').select('routing_id, status').in('routing_id', showIds) as never,
      )
    : { probe: { ok: true, error: null, rowCount: 0 } as QueryProbe, data: [] as Array<{ routing_id: string; status: string | null }> };
  queries['advance_instances'] = adv.probe;

  // 5 — crew.
  const crew = await probe<{ id: string }>(
    () => supabase.from('tour_personnel').select('id').eq('tour_id', tour.id) as never,
  );
  queries['tour_personnel'] = crew.probe;

  // 6 — budget committed.
  const budget = await probe<{ proposed_cost: number | null }>(
    () => supabase.from('budget_line_items').select('proposed_cost').eq('tour_id', tour.id) as never,
  );
  queries['budget_line_items'] = budget.probe;
  const committed = budget.data.reduce((s, l) => s + (Number(l.proposed_cost) || 0), 0);

  // Derived values (the same fns the surfaces use).
  const deriveTour: DeriveTour = {
    start_date: tour.start_date,
    end_date: tour.end_date,
    status: tour.status,
  };
  const statusLine = tourStatusLine(deriveTour, days, todayIso);
  const ns = deriveNextShow(days, todayIso);
  let nextShow: { date: string; city: string | null; venue: string | null } | null = null;
  if (ns) {
    const row = rows.find((r) => r.date.slice(0, 10) === ns.date) ?? null;
    const v = row && usedSource !== 'light' ? resolveVenue(row as RoutingVenueSource) : null;
    nextShow = { date: ns.date, city: v?.city ?? null, venue: v?.name ?? null };
  }

  const advancesDone = adv.data.filter((a) => a.status === 'complete').length;

  return {
    tourId: tour.id,
    tourName: tour.name,
    tourCurrency: tour.currency, // the "£ on USD tour" check — rail must use THIS
    workspaceCurrency,
    routingSourceUsed: usedSource,
    derived: {
      statusLine,
      nextShow,
      counts: {
        shows: showRows.length,
        routingDays: rows.length,
        advances: { done: advancesDone, total: showRows.length },
        crew: crew.data.length,
        committed,
        committedCurrency: tour.currency ?? workspaceCurrency,
      },
    },
    queries,
  };
}

export async function GET(request: Request) {
  const { isAdmin } = await getUserAndAdminStatus();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const supabase = await createServerSupabaseClient();
  const { searchParams } = new URL(request.url);
  const tourId = searchParams.get('tourId');
  const todayIso = new Date().toISOString().slice(0, 10);

  const { data: userData } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', userData?.user?.id ?? '')
    .maybeSingle();
  const workspaceId = (profile as { workspace_id?: string } | null)?.workspace_id ?? null;

  const { data: wsRow } = workspaceId
    ? await supabase.from('workspaces').select('currency').eq('id', workspaceId).maybeSingle()
    : { data: null };
  const workspaceCurrency = (wsRow as { currency?: string | null } | null)?.currency ?? 'GBP';

  const toursProbe = await probe<TourRow>(() =>
    (tourId
      ? supabase.from('tours').select('id, name, artist_id, status, start_date, end_date, currency').eq('id', tourId)
      : supabase.from('tours').select('id, name, artist_id, status, start_date, end_date, currency').order('start_date', { ascending: false }).limit(25)) as never,
  );

  const results = [];
  for (const t of toursProbe.data) {
    results.push(await derivationsForTour(supabase, t, workspaceCurrency, todayIso));
  }

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      todayIso,
      workspaceId,
      workspaceCurrency,
      toursQuery: toursProbe.probe,
      tours: results,
    },
    { status: 200 },
  );
}

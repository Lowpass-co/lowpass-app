/* ============================================
   LOWPASS — flight search, server side (Nov 2026). See src/lib/flights/lookup.ts
   for the rules. Every call the provider sees goes through here:

     cache → plan window → reserve one of the month's calls (database,
     atomic) → ONE request → store the answer on the reserved row.

   The service-role client is used ONLY for flight_lookups (no client may
   read or write it); the route has already checked who's asking.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  aviationstackError,
  cacheFresh,
  inPlanWindow,
  parseAviationstack,
  type CachedRow,
  type FlightFound,
} from '@/lib/flights/lookup';

export const PROVIDER = 'aviationstack';

export type LookupConfig = {
  key: string | null;
  plan: string; // 'free' | anything paid
  base: string; // https://api.aviationstack.com/v1
  monthlyCap: number; // all workspaces together
  workspaceCap: number; // one workspace's share
};

export function lookupConfig(env: Record<string, string | undefined> = process.env): LookupConfig {
  const n = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : d);
  return {
    key: env.AVIATIONSTACK_KEY?.trim() || null,
    plan: (env.AVIATIONSTACK_PLAN ?? 'free').trim().toLowerCase() || 'free',
    base: (env.AVIATIONSTACK_BASE ?? 'https://api.aviationstack.com/v1').replace(/\/+$/, ''),
    // 100 a month on the free plan; keep 10 back for mistakes and testing.
    monthlyCap: n(env.FLIGHT_LOOKUP_MONTHLY_CAP, 90),
    workspaceCap: n(env.FLIGHT_LOOKUP_WORKSPACE_CAP, 30),
  };
}

export type LookupResult =
  | { ok: true; flight: FlightFound; cached: boolean }
  | { ok: false; code: 'NOT_CONFIGURED' | 'OUT_OF_RANGE' | 'CAP_REACHED' | 'NOT_FOUND' | 'PROVIDER_ERROR' | 'BUSY'; message: string; cached?: boolean };

export async function lookupFlight(
  db: SupabaseClient,
  cfg: LookupConfig,
  q: { flightIata: string; flightDate: string; workspaceId: string; userId: string },
  deps: { fetch?: typeof fetch; now?: Date } = {},
): Promise<LookupResult> {
  const now = deps.now ?? new Date();
  const doFetch = deps.fetch ?? fetch;
  if (!cfg.key) return { ok: false, code: 'NOT_CONFIGURED', message: 'Flight search isn’t set up yet.' };

  // 1. Cache — the newest answer for this flight + date.
  const { data: rows } = await db
    .from('flight_lookups')
    .select('status, created_at, flight_date, result, error')
    .eq('flight_iata', q.flightIata)
    .eq('flight_date', q.flightDate)
    .order('created_at', { ascending: false })
    .limit(1);
  const last = (rows?.[0] ?? null) as (CachedRow & { result: FlightFound | null; error: string | null }) | null;
  if (last && cacheFresh(last, now)) {
    if (last.status === 'ok' && last.result) return { ok: true, flight: last.result, cached: true };
    if (last.status === 'pending') return { ok: false, code: 'BUSY', message: 'Already searching for that flight — try again in a moment.' };
    return { ok: false, code: 'NOT_FOUND', message: notFoundText(q), cached: true };
  }

  // 2. A date this plan can't answer never reaches the provider.
  if (!inPlanWindow(cfg.plan, q.flightDate, now.toISOString().slice(0, 10))) {
    return {
      ok: false,
      code: 'OUT_OF_RANGE',
      message: 'Flight search on the free plan only finds flights flying today (± a day). Fill this one in by hand.',
    };
  }

  // 3. Take one of the month's calls — or don't call.
  const { data: reserved, error: rErr } = await db.rpc('flight_lookup_reserve', {
    p_cap: cfg.monthlyCap,
    p_workspace_cap: cfg.workspaceCap,
    p_provider: PROVIDER,
    p_flight_iata: q.flightIata,
    p_flight_date: q.flightDate,
    p_workspace_id: q.workspaceId,
    p_user_id: q.userId,
  });
  if (rErr) return { ok: false, code: 'PROVIDER_ERROR', message: 'Flight search isn’t ready (migration 299).' };
  const id = reserved as string | null;
  if (!id) return { ok: false, code: 'CAP_REACHED', message: 'This month’s flight searches are used up — fill it in by hand.' };

  // 4. ONE request. Free plan: no date filter (it can't take one) — the
  //    answer is filtered to the date here.
  const params = new URLSearchParams({ access_key: cfg.key, flight_iata: q.flightIata });
  if (cfg.plan !== 'free') params.set('flight_date', q.flightDate);
  let json: unknown = null;
  try {
    const res = await doFetch(`${cfg.base}/flights?${params}`, { cache: 'no-store' });
    json = await res.json().catch(() => null);
  } catch {
    await db.from('flight_lookups').update({ status: 'error', error: 'network' }).eq('id', id);
    return { ok: false, code: 'PROVIDER_ERROR', message: 'Couldn’t reach the flight-search service.' };
  }
  const err = aviationstackError(json);
  if (err) {
    await db.from('flight_lookups').update({ status: 'error', error: err.message }).eq('id', id);
    return { ok: false, code: 'PROVIDER_ERROR', message: err.message };
  }
  const flight = parseAviationstack(json, q.flightIata, q.flightDate);
  if (!flight) {
    await db.from('flight_lookups').update({ status: 'not_found' }).eq('id', id);
    return { ok: false, code: 'NOT_FOUND', message: notFoundText(q) };
  }
  await db.from('flight_lookups').update({ status: 'ok', result: flight }).eq('id', id);
  return { ok: true, flight, cached: false };
}

function notFoundText(q: { flightIata: string; flightDate: string }): string {
  return `No ${q.flightIata} found on ${q.flightDate}.`;
}

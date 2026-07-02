/* ============================================
   LOWPASS — Canonical venue CITY backfill (run-once, admin) — routing-city fix

   POST → for the caller's workspace: the existing linking backfill never re-derived
   city for ALREADY-LINKED venues, so blank ("—") and localized (København, Wien)
   cities stayed. This route:
     1. finds the DISTINCT canonical venues linked to this workspace's routing that
        carry a google_place_id, and for each calls Place Details (languageCode=en)
        → OVERWRITES canonical city+country with the English metro (via
        refreshCanonicalVenueCityCountry). Fills nulls AND normalizes localized
        names; re-writing an already-English city is a harmless no-op → idempotent.
     2. fills routing.city where it's blank from the (now-English) linked canonical.

   Admin-gated. Places Details calls ride the google rate lane + are logged. Capped
   per run so one call can't fan out unbounded. Re-runnable. Adam runs it once.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server';
import { guardGoogleCall, logGoogleCall } from '@/lib/external/googleUsage';
import { refreshCanonicalVenueCityCountry } from '@/lib/venues/canonical';

/** Cap distinct venues per run so one call can't fan out unbounded. */
const MAX_VENUES_PER_RUN = 200;

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: isAdmin, error: rpcErr } = await supabase.rpc('is_workspace_admin');
  if (rpcErr) return NextResponse.json({ error: 'Admin check failed' }, { status: 500 });
  if (!isAdmin) return NextResponse.json({ error: 'Workspace admin required' }, { status: 403 });

  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  if (!process.env.GOOGLE_PLACES_API_KEY) return NextResponse.json({ error: 'Places API not configured' }, { status: 503 });

  // Pre-flight google rate-limit (one guard for the run; each call logged).
  const g = await guardGoogleCall('google.places.details');
  if (!g.ok) return g.response;

  // This workspace's linked routing rows (RLS scopes to the workspace).
  const { data: routingRows } = await supabase
    .from('routing')
    .select('id, city, canonical_venue_id')
    .not('canonical_venue_id', 'is', null);
  const linkedRows = (routingRows ?? []) as Array<{ id: string; city: string | null; canonical_venue_id: string }>;

  const canonicalIds = [...new Set(linkedRows.map((r) => r.canonical_venue_id))];
  if (canonicalIds.length === 0) {
    return NextResponse.json({ ok: true, distinct_venues: 0, refreshed: 0, routing_city_filled: 0, note: 'No library-linked routing rows in this workspace.' });
  }

  const svc = createServiceSupabaseClient();
  // The linked canonical venues (world-readable) — need place_id + current city.
  const { data: cvRows } = await svc
    .from('canonical_venues')
    .select('id, google_place_id, city')
    .in('id', canonicalIds);
  const canonicals = (cvRows ?? []) as Array<{ id: string; google_place_id: string | null; city: string | null }>;

  const withPlace = canonicals.filter((c) => c.google_place_id);
  const truncated = withPlace.length > MAX_VENUES_PER_RUN;
  const toProcess = withPlace.slice(0, MAX_VENUES_PER_RUN);

  // 1. Refresh (English overwrite) each distinct venue's city + country.
  let refreshed = 0;
  const stillLocalizedNote: string[] = [];
  const cityById = new Map<string, string | null>();
  for (const c of toProcess) {
    const result = await refreshCanonicalVenueCityCountry(c.google_place_id!, svc);
    await logGoogleCall(g.ctx, result ? 'ok' : 'error');
    if (result?.city) {
      refreshed += 1;
      cityById.set(c.id, result.city);
      // Sub-locality judgment (flag, don't hard-code): surface anything that
      // still looks like a district (contains a digit or a hyphenated suffix) so
      // Adam can eyeball it rather than us mapping metros.
      if (/\d/.test(result.city) || /-\s?\w/.test(result.city)) stillLocalizedNote.push(result.city);
    } else {
      cityById.set(c.id, c.city);
    }
  }
  // Venues we didn't process (already-English / no place_id) keep their stored city.
  for (const c of canonicals) if (!cityById.has(c.id)) cityById.set(c.id, c.city);

  // 2. Fill routing.city where blank from the linked canonical (now English).
  let routingCityFilled = 0;
  for (const r of linkedRows) {
    const blank = !r.city || !r.city.trim();
    const canonCity = cityById.get(r.canonical_venue_id);
    if (blank && canonCity && canonCity.trim()) {
      const { error } = await supabase.from('routing').update({ city: canonCity }).eq('id', r.id);
      if (!error) routingCityFilled += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    distinct_venues: withPlace.length,
    processed: toProcess.length,
    truncated,
    refreshed,
    routing_city_filled: routingCityFilled,
    review_examples: stillLocalizedNote.slice(0, 10),
    note: 'City overwritten to the English metro from Place Details; routing.city filled where blank. Re-runnable. Any review_examples still look like a district — check them.',
  });
}

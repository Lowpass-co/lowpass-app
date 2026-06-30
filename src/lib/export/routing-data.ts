/* ============================================
   LOWPASS — Routing export data loader (#8 Document Export, Routing slice)

   Mirrors the routing surface's data (the `routing` table — one row per tour day,
   migration 001 + 214 canonical venue link). Every day is included (show AND
   travel/off/press/etc. — D7); the day_type distinguishes them. Venue/city prefer
   the canonical_venues join, falling back to the denormalised routing columns.

   Optional per-day advance summary (config toggle, OFF by default — D7): a
   BEST-EFFORT read of advance_instances (status + how many fields are filled in the
   free-form `data` jsonb). The advance `data` shape is per-tour config
   (`{ sectionId: { fieldId: value } }`) with opaque field ids, so we summarise
   counts + status rather than guessing labels.

   Read-only. Caller has auth'd + workspace-scoped the tour.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveArtistLogoUrl } from '@/lib/artists/imageUrl';
import type { DateRange } from '@/lib/export/template-config';

export interface RoutingAdvanceSummary {
  status: string;
  filledFields: number;
  sections: number;
}

export interface RoutingDayRow {
  date: string;
  dayType: string;
  city: string | null;
  country: string | null;
  venue: string | null;
  address: string | null;
  capacity: number | null;
  advance: RoutingAdvanceSummary | null;
  lat: number | null;
  lng: number | null;
  /** Part F — travel minutes to the NEXT day (null = unknown). */
  legMins: number | null;
  /** True when legMins is a straight-line approximation (no cached drive time). */
  legApprox: boolean;
}

export interface RoutingLoadOptions {
  range?: DateRange;
  travelTimes?: boolean;
}

/** Haversine distance (km) between two coords. */
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export interface RoutingExportData {
  tour: { id: string; name: string; start_date: string | null; end_date: string | null };
  artist: { name: string } | null;
  logoUrl: string | null;
  days: RoutingDayRow[];
  /** Count of days that have an advance instance (for the subtitle / smoke). */
  advanceCount: number;
}

/** Count non-empty scalar field values across the advance `data` jsonb, and the
 *  number of sections that hold at least one. Arrays/objects (contacts/files) are
 *  not counted as a single scalar. Best-effort — never throws. */
function summariseAdvanceData(data: unknown): { filledFields: number; sections: number } {
  if (!data || typeof data !== 'object') return { filledFields: 0, sections: 0 };
  let filledFields = 0;
  let sections = 0;
  for (const sectionVal of Object.values(data as Record<string, unknown>)) {
    if (!sectionVal || typeof sectionVal !== 'object') continue;
    let any = 0;
    for (const v of Object.values(sectionVal as Record<string, unknown>)) {
      if (v === null || v === undefined || v === '') continue;
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        filledFields++;
        any++;
      } else if (Array.isArray(v) && v.length > 0) {
        filledFields++;
        any++;
      }
    }
    if (any > 0) sections++;
  }
  return { filledFields, sections };
}

// NOTE: no workspaceId param — `routing` is tour-scoped (no workspace_id column,
// same as the budget routing/income loader); RLS + the route's workspace-verified
// tour already scope it. The route verifies the tour belongs to the workspace
// before calling this.
export async function loadRoutingExportData(
  supabase: SupabaseClient,
  tour: { id: string; name: string; start_date: string | null; end_date: string | null; artist_id: string | null },
  opts?: RoutingLoadOptions,
): Promise<RoutingExportData> {
  const tourId = tour.id;
  const range = opts?.range;

  const [routingRes, artistRes] = await Promise.all([
    supabase
      .from('routing')
      .select('id, date, day_type, city, address, venue_name, venue_capacity, latitude, longitude, canonical_venue_id, canonical_venues(name, city, country, capacity)')
      .eq('tour_id', tourId)
      .order('date', { ascending: true }),
    tour.artist_id
      ? supabase.from('artists').select('id, name, branding, spotify_id, spotify_image_url').eq('id', tour.artist_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const routingAll = (routingRes.data ?? []) as Array<{
    id: string;
    date: string;
    day_type: string | null;
    city: string | null;
    address: string | null;
    venue_name: string | null;
    venue_capacity: number | null;
    latitude: number | null;
    longitude: number | null;
    canonical_venue_id: string | null;
    canonical_venues?: { name?: string | null; city?: string | null; country?: string | null; capacity?: number | null } | Array<{ name?: string | null; city?: string | null; country?: string | null; capacity?: number | null }> | null;
  }>;
  // Date-range filter (Part E shared control; null = whole tour).
  const routingRaw = routingAll.filter((r) => (!range?.from || r.date >= range.from) && (!range?.to || r.date <= range.to));

  // Advance instances for these routing days (best-effort; toggle off by default).
  const routingIds = routingRaw.map((r) => r.id);
  const advanceByRoutingId = new Map<string, { status: string; data: unknown }>();
  if (routingIds.length) {
    const { data: advRows } = await supabase.from('advance_instances').select('routing_id, status, data').in('routing_id', routingIds);
    for (const a of (advRows ?? []) as Array<{ routing_id: string; status: string | null; data: unknown }>) {
      advanceByRoutingId.set(a.routing_id, { status: a.status ?? 'not_started', data: a.data });
    }
  }

  const days: RoutingDayRow[] = routingRaw.map((r) => {
    const canon = Array.isArray(r.canonical_venues) ? r.canonical_venues[0] : r.canonical_venues;
    const venue = (canon?.name ?? r.venue_name) || null;
    const city = (canon?.city ?? r.city) || null;
    const country = canon?.country || null;
    const capacity = (canon?.capacity ?? r.venue_capacity) ?? null;
    const adv = advanceByRoutingId.get(r.id);
    const advance: RoutingAdvanceSummary | null = adv
      ? { status: adv.status, ...summariseAdvanceData(adv.data) }
      : null;
    return {
      date: r.date,
      dayType: (r.day_type ?? '').trim(),
      city,
      country,
      venue,
      address: (r.address ?? '') || null,
      capacity: typeof capacity === 'number' ? capacity : null,
      advance,
      lat: typeof r.latitude === 'number' ? r.latitude : null,
      lng: typeof r.longitude === 'number' ? r.longitude : null,
      legMins: null,
      legApprox: false,
    };
  });

  // Part F — leg travel times between consecutive days with coords. Reads the
  // existing drive_time_cache (origin/dest "lat,lng", mode 'driving') — NEVER calls
  // Google from the export (cost-hardening). Uncached legs fall back to a straight-
  // line (haversine) approximation, flagged legApprox.
  if (opts?.travelTimes) {
    const legs: Array<{ i: number; origin: string; dest: string; aLat: number; aLng: number; bLat: number; bLng: number }> = [];
    for (let i = 0; i < days.length - 1; i++) {
      const a = days[i];
      const b = days[i + 1];
      if (a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
        legs.push({ i, origin: `${a.lat},${a.lng}`, dest: `${b.lat},${b.lng}`, aLat: a.lat, aLng: a.lng, bLat: b.lat, bLng: b.lng });
      }
    }
    if (legs.length) {
      const origins = Array.from(new Set(legs.map((l) => l.origin)));
      const { data: cacheRows } = await supabase
        .from('drive_time_cache')
        .select('origin, destination, duration_seconds')
        .in('origin', origins)
        .eq('mode', 'driving');
      const cache = new Map<string, number>();
      for (const c of (cacheRows ?? []) as Array<{ origin: string; destination: string; duration_seconds: number }>) {
        cache.set(`${c.origin}|${c.destination}`, c.duration_seconds);
      }
      for (const leg of legs) {
        const cached = cache.get(`${leg.origin}|${leg.dest}`);
        if (cached != null) {
          days[leg.i].legMins = Math.round(cached / 60);
          days[leg.i].legApprox = false;
        } else {
          const km = haversineKm(leg.aLat, leg.aLng, leg.bLat, leg.bLng);
          days[leg.i].legMins = Math.round((km / 75) * 60); // ~75 km/h rough driving avg
          days[leg.i].legApprox = true;
        }
      }
    }
  }

  const artistRow = artistRes.data as { id: string; name: string; branding: unknown; spotify_id: string | null; spotify_image_url: string | null } | null;
  const logoUrl = artistRow ? await resolveArtistLogoUrl(artistRow) : null;

  return {
    tour: { id: tourId, name: tour.name, start_date: tour.start_date, end_date: tour.end_date },
    artist: artistRow ? { name: artistRow.name } : null,
    logoUrl,
    days,
    advanceCount: days.filter((d) => d.advance !== null).length,
  };
}

/* ============================================
   LOWPASS — Google Directions API (drive time)

   GET ?origin=lat,lng&destination=lat,lng
   Returns { durationSeconds } for driving.
   Uses same key as Geocoding (enable Directions API in Google Cloud).
   ============================================ */

import { NextResponse } from 'next/server';
import { guardGoogleCall, logGoogleCall } from '@/lib/external/googleUsage';
import { createServiceSupabaseClient } from '@/lib/supabase-server';

const MODE = 'driving';

export async function GET(request: Request) {
  // Security audit §H2 — authenticate + rate-limit + meter. Auth still runs
  // on a cache hit (we don't serve cached results to unauthed callers); the
  // rate-limit pre-flight is just a count read and logs nothing on a hit.
  const g = await guardGoogleCall('google.directions');
  if (!g.ok) return g.response;

  const { searchParams } = new URL(request.url);
  const origin = searchParams.get('origin')?.trim();
  const destination = searchParams.get('destination')?.trim();
  if (!origin || !destination) {
    return NextResponse.json({ error: 'origin and destination required (lat,lng)' }, { status: 400 });
  }

  // 1. Cache check — a drive time between two fixed points is deterministic,
  //    so a hit returns without touching Google (no call, no cost event).
  const svc = createServiceSupabaseClient();
  const { data: cached } = await svc
    .from('drive_time_cache')
    .select('duration_seconds, distance_meters')
    .eq('origin', origin)
    .eq('destination', destination)
    .eq('mode', MODE)
    .maybeSingle();
  if (cached?.duration_seconds != null) {
    return NextResponse.json({ durationSeconds: cached.duration_seconds, cached: true });
  }

  // 2. Miss — call Google, meter it, cache the result.
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'Directions not configured' }, { status: 503 });
  }

  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=${MODE}&key=${key}`;
  const res = await fetch(url);
  await logGoogleCall(g.ctx, res.ok ? 'ok' : 'error');
  if (!res.ok) {
    return NextResponse.json({ error: 'Directions request failed' }, { status: 502 });
  }

  const data = (await res.json()) as {
    status?: string;
    routes?: Array<{
      legs?: Array<{ duration?: { value: number }; distance?: { value: number } }>;
    }>;
  };

  if (data.status !== 'OK' || !data.routes?.[0]?.legs?.[0]?.duration) {
    return NextResponse.json({ error: 'No route' }, { status: 404 });
  }

  const leg = data.routes[0].legs[0];
  const durationSeconds = leg.duration!.value;
  const distanceMeters = leg.distance?.value ?? null;

  // Write back (service-role; UNIQUE(origin,destination,mode) makes it
  // idempotent under concurrent misses). Best-effort — never fail the
  // response on a cache-write error.
  await svc
    .from('drive_time_cache')
    .upsert(
      { origin, destination, mode: MODE, duration_seconds: durationSeconds, distance_meters: distanceMeters },
      { onConflict: 'origin,destination,mode' },
    )
    .then(({ error }) => {
      if (error) console.error('[directions] cache write failed', error);
    });

  return NextResponse.json({ durationSeconds });
}

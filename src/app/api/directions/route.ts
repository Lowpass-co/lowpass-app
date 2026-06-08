/* ============================================
   LOWPASS — Google Directions API (drive time)

   GET ?origin=lat,lng&destination=lat,lng
   Returns { durationSeconds } for driving.
   Uses same key as Geocoding (enable Directions API in Google Cloud).
   ============================================ */

import { NextResponse } from 'next/server';
import { guardGoogleCall, logGoogleCall } from '@/lib/external/googleUsage';

export async function GET(request: Request) {
  // Security audit §H2 — authenticate + rate-limit + meter (was open).
  const g = await guardGoogleCall('google.directions');
  if (!g.ok) return g.response;

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'Directions not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const origin = searchParams.get('origin')?.trim();
  const destination = searchParams.get('destination')?.trim();
  if (!origin || !destination) {
    return NextResponse.json({ error: 'origin and destination required (lat,lng)' }, { status: 400 });
  }

  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=driving&key=${key}`;
  const res = await fetch(url);
  await logGoogleCall(g.ctx, res.ok ? 'ok' : 'error');
  if (!res.ok) {
    return NextResponse.json({ error: 'Directions request failed' }, { status: 502 });
  }

  const data = (await res.json()) as {
    status?: string;
    routes?: Array<{
      legs?: Array<{ duration?: { value: number } }>;
    }>;
  };

  if (data.status !== 'OK' || !data.routes?.[0]?.legs?.[0]?.duration) {
    return NextResponse.json({ error: 'No route' }, { status: 404 });
  }

  const durationSeconds = data.routes[0].legs[0].duration.value;
  return NextResponse.json({ durationSeconds });
}

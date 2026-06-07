/* ============================================
   LOWPASS — Geocode address to lat/lng (Google)

   GET ?address=... returns { lat, lng } for map display.
   Enable "Geocoding API" in Google Cloud if you use this.
   ============================================ */

import { NextResponse } from 'next/server';
import { guardGoogleCall, logGoogleCall } from '@/lib/external/googleUsage';

export async function GET(request: Request) {
  // Security audit §H2 — authenticate + rate-limit + meter (was open).
  const g = await guardGoogleCall('google.geocode');
  if (!g.ok) return g.response;

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'Geocoding not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address')?.trim();
  if (!address) {
    return NextResponse.json({ error: 'address required' }, { status: 400 });
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`;
  const res = await fetch(url);
  await logGoogleCall(g.ctx, res.ok ? 'ok' : 'error');
  if (!res.ok) {
    return NextResponse.json({ error: 'Geocode failed' }, { status: 502 });
  }

  const data = (await res.json()) as { results?: Array<{ geometry?: { location?: { lat: number; lng: number } } }>; status?: string };
  const loc = data.results?.[0]?.geometry?.location;
  if (!loc || data.status !== 'OK') {
    return NextResponse.json({ error: 'No result' }, { status: 404 });
  }

  return NextResponse.json({ lat: loc.lat, lng: loc.lng });
}

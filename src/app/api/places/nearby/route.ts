/* ============================================
   LOWPASS — Google Places Nearby Search proxy

   GET ?lat=X&lng=Y&type=hospital|pharmacy|laundromat|gym
   Uses searchNearby; returns name, address, mapsUri, distance.
   ============================================ */

import { NextResponse } from 'next/server';
import { guardGoogleCall, logGoogleCall } from '@/lib/external/googleUsage';

const VALID_TYPES = ['hospital', 'pharmacy', 'laundromat', 'gym'] as const;
const GOOGLE_TYPE_MAP: Record<(typeof VALID_TYPES)[number], string> = {
  hospital: 'hospital',
  pharmacy: 'pharmacy',
  laundromat: 'laundry',
  gym: 'gym',
};

function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function GET(request: Request) {
  // Security audit §H2 — authenticate + rate-limit + meter (was open).
  const g = await guardGoogleCall('google.places.nearby');
  if (!g.ok) return g.response;

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'Places API not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const latStr = searchParams.get('lat');
  const lngStr = searchParams.get('lng');
  const typeParam = searchParams.get('type')?.toLowerCase().trim();

  const lat = latStr != null ? parseFloat(latStr) : NaN;
  const lng = lngStr != null ? parseFloat(lngStr) : NaN;
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return NextResponse.json({ error: 'Valid lat and lng required' }, { status: 400 });
  }

  if (!typeParam || !VALID_TYPES.includes(typeParam as (typeof VALID_TYPES)[number])) {
    return NextResponse.json({ error: 'type must be one of: hospital, pharmacy, laundromat, gym' }, { status: 400 });
  }

  const includedType = GOOGLE_TYPE_MAP[typeParam as (typeof VALID_TYPES)[number]];

  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.googleMapsUri,places.location',
    },
    body: JSON.stringify({
      includedTypes: [includedType],
      maxResultCount: 5,
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: 5000,
        },
      },
      rankPreference: 'DISTANCE',
    }),
  });
  await logGoogleCall(g.ctx, res.ok ? 'ok' : 'error');

  if (!res.ok) {
    const err = await res.text();
    console.error('Places nearby error:', res.status, err);
    return NextResponse.json({ error: 'Nearby search failed' }, { status: 502 });
  }

  const data = (await res.json()) as {
    places?: Array<{
      displayName?: { text?: string };
      formattedAddress?: string;
      googleMapsUri?: string;
      location?: { latitude?: number; longitude?: number };
    }>;
  };

  const originLat = lat;
  const originLng = lng;

  const results = (data.places ?? []).map((p) => {
    const name = p.displayName?.text ?? '';
    const address = p.formattedAddress ?? '';
    const mapsUri = p.googleMapsUri ?? undefined;
    const placeLat = p.location?.latitude;
    const placeLng = p.location?.longitude;
    let distance: number | undefined;
    if (placeLat != null && placeLng != null) {
      distance = Math.round(haversineDistanceMeters(originLat, originLng, placeLat, placeLng));
    }
    return { name, address, mapsUri, distance };
  });

  return NextResponse.json({ results });
}

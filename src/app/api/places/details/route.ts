/* ============================================
   LOWPASS — Google Place Details (New) proxy

   GET ?placeId=ChIJ...
   Returns: { displayName: string; formattedAddress: string; locality?: string; country?: string }
   ============================================ */

import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'Places API not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const placeId = searchParams.get('placeId')?.trim();
  if (!placeId) {
    return NextResponse.json({ error: 'placeId required' }, { status: 400 });
  }

  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'displayName,formattedAddress,addressComponents,location',
    },
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Place details error:', res.status, err);
    return NextResponse.json({ error: 'Place details failed' }, { status: 502 });
  }

  const data = (await res.json()) as {
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    addressComponents?: Array<{
      types?: string[];
      longText?: string;
      shortText?: string;
    }>;
  };

  let locality: string | undefined;
  let country: string | undefined;
  for (const comp of data.addressComponents ?? []) {
    const types = comp.types ?? [];
    const text = comp.longText ?? comp.shortText ?? '';
    if (types.includes('locality')) locality = text;
    if (types.includes('country')) country = text;
  }

  return NextResponse.json({
    displayName: data.displayName?.text ?? '',
    formattedAddress: data.formattedAddress ?? '',
    locality,
    country,
    latitude: data.location?.latitude,
    longitude: data.location?.longitude,
  });
}

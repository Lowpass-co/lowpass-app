/* ============================================
   LOWPASS — Google Place Details (New) proxy

   GET ?placeId=ChIJ...
   Returns: { displayName: string; formattedAddress: string; locality?: string; country?: string }
   ============================================ */

import { NextResponse } from 'next/server';
import { guardGoogleCall, logGoogleCall } from '@/lib/external/googleUsage';

export async function GET(request: Request) {
  // Security audit §H2 — authenticate + rate-limit + meter (was open).
  const g = await guardGoogleCall('google.places.details');
  if (!g.ok) return g.response;

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'Places API not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const placeId = searchParams.get('placeId')?.trim();
  if (!placeId) {
    return NextResponse.json({ error: 'placeId required' }, { status: 400 });
  }

  // Sprint 8.6 patch — opt-in iataCode via ?includeIata=1.
  // Google's Places API (New) returns 400 INVALID_ARGUMENT for
  // non-airport place types when iataCode is in the field mask.
  // This cascaded to a 502 here and broke the venue picker for
  // every venue lookup. Default mask omits iataCode; airport-
  // autocomplete callers (FlightsGrid) pass ?includeIata=1.
  const includeIata = searchParams.get('includeIata') === '1';

  const fieldMask = [
    'displayName',
    'formattedAddress',
    'addressComponents',
    'location',
    'websiteUri',
    'internationalPhoneNumber',
    'rating',
    'currentOpeningHours',
    'types',
    'primaryType',
    ...(includeIata ? ['iataCode'] : []),
  ].join(',');

  // F2 — close the Places session opened by the autocomplete requests, so
  // the whole lookup bills as one session rather than a separate Details
  // charge. (place_id capture is unaffected — the client already holds it.)
  const sessiontoken = searchParams.get('sessiontoken')?.trim();
  const url =
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}` +
    (sessiontoken ? `?sessionToken=${encodeURIComponent(sessiontoken)}` : '');
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': fieldMask,
    },
  });
  await logGoogleCall(g.ctx, res.ok ? 'ok' : 'error');

  if (!res.ok) {
    const err = await res.text();
    console.error('Place details error:', res.status, err);
    return NextResponse.json({ error: 'Place details failed' }, { status: 502 });
  }

  const data = (await res.json()) as {
    displayName?: { text?: string };
    formattedAddress?: string;
    iataCode?: string;
    primaryType?: string;
    types?: string[];
    location?: { latitude?: number; longitude?: number };
    addressComponents?: Array<{
      types?: string[];
      longText?: string;
      shortText?: string;
    }>;
    websiteUri?: string;
    internationalPhoneNumber?: string;
    rating?: number;
    currentOpeningHours?: {
      weekdayDescriptions?: string[];
      periods?: unknown[];
      openNow?: boolean;
    };
  };

  let locality: string | undefined;
  let postalTown: string | undefined;
  let sublocality: string | undefined;
  let adminArea2: string | undefined;
  let adminArea1: string | undefined;
  let country: string | undefined;
  for (const comp of data.addressComponents ?? []) {
    const types = comp.types ?? [];
    const text = comp.longText ?? comp.shortText ?? '';
    if (types.includes('locality')) locality = text;
    if (types.includes('postal_town')) postalTown = text;
    if (types.includes('sublocality') || types.includes('sublocality_level_1')) sublocality = text;
    if (types.includes('administrative_area_level_2')) adminArea2 = text;
    if (types.includes('administrative_area_level_1')) adminArea1 = text;
    if (types.includes('country')) country = text;
  }

  const inferredCity =
    locality?.trim() ||
    postalTown?.trim() ||
    sublocality?.trim() ||
    adminArea2?.trim() ||
    adminArea1?.trim() ||
    null;

  const openingHours = data.currentOpeningHours
    ? {
        weekdayDescriptions: data.currentOpeningHours.weekdayDescriptions ?? [],
        openNow: data.currentOpeningHours.openNow,
      }
    : undefined;

  return NextResponse.json({
    displayName: data.displayName?.text ?? '',
    formattedAddress: data.formattedAddress ?? '',
    iataCode: data.iataCode ?? undefined,
    primaryType: data.primaryType ?? undefined,
    types: data.types ?? undefined,
    locality,
    postalTown: postalTown ?? undefined,
    inferredCity,
    country,
    latitude: data.location?.latitude,
    longitude: data.location?.longitude,
    website: data.websiteUri ?? undefined,
    phone: data.internationalPhoneNumber ?? undefined,
    rating: data.rating != null ? data.rating : undefined,
    opening_hours: openingHours,
  });
}

/* ============================================
   LOWPASS — Google Places Autocomplete (New) proxy

   POST body: { input: string; includedPrimaryTypes?: string[] }
   Returns: { suggestions: { placeId: string; text: string }[] }
   ============================================ */

import { NextResponse } from 'next/server';
import { guardGoogleCall, logGoogleCall } from '@/lib/external/googleUsage';

const PLACES_AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';

export async function POST(request: Request) {
  // Security audit §H2 — authenticate + rate-limit + meter (was open).
  const g = await guardGoogleCall('google.places.autocomplete');
  if (!g.ok) return g.response;

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'Places API not configured' }, { status: 503 });
  }

  let body: { input?: string; includedPrimaryTypes?: string[]; sessiontoken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const input = typeof body.input === 'string' ? body.input.trim() : '';
  if (input.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  const requestPayload: Record<string, unknown> = { input };
  if (Array.isArray(body.includedPrimaryTypes) && body.includedPrimaryTypes.length > 0) {
    requestPayload.includedPrimaryTypes = body.includedPrimaryTypes.filter(
      (t): t is string => typeof t === 'string' && t.length > 0
    );
  }
  // F2 — a Places session token bundles this session's autocomplete
  // requests + the final Place Details call into ONE billed session.
  if (typeof body.sessiontoken === 'string' && body.sessiontoken.length > 0) {
    requestPayload.sessionToken = body.sessiontoken;
  }

  const res = await fetch(PLACES_AUTOCOMPLETE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text',
    },
    body: JSON.stringify(requestPayload),
  });
  await logGoogleCall(g.ctx, res.ok ? 'ok' : 'error');

  if (!res.ok) {
    const err = await res.text();
    console.error('Places autocomplete error:', res.status, err);
    return NextResponse.json({ error: 'Places request failed' }, { status: 502 });
  }

  const data = (await res.json()) as {
    suggestions?: Array<{
      placePrediction?: {
        placeId?: string;
        text?: { text?: string };
      };
    }>;
  };

  const suggestions = (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter(Boolean)
    .filter((p): p is { placeId?: string; text?: { text?: string } } => !!p?.placeId)
    .map((p) => ({
      placeId: p.placeId!,
      text: p.text?.text ?? '',
    }))
    .filter((s) => s.text);

  return NextResponse.json({ suggestions });
}

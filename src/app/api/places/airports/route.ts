/* ============================================
   LOWPASS — Google Places Autocomplete (airports only)

   POST body: { input: string }
   Returns: { suggestions: { placeId: string; text: string }[] }
   Uses Places API (New) with includedPrimaryTypes: [airport].
   ============================================ */

import { NextResponse } from 'next/server';

const PLACES_AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';

export async function POST(request: Request) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'Places API not configured' }, { status: 503 });
  }

  let body: { input?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const input = typeof body.input === 'string' ? body.input.trim() : '';
  if (input.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  const res = await fetch(PLACES_AUTOCOMPLETE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text',
    },
    body: JSON.stringify({
      input,
      includedPrimaryTypes: ['airport'],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Places airport autocomplete error:', res.status, err);
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

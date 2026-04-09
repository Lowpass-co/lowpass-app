import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/equipment/find-image?q=ITEM_NAME
 *
 * Returns the first image URL from Google Custom Search for the given query.
 * Requires:
 *   GOOGLE_PLACES_API_KEY  — your existing Google API key (must have Custom Search API enabled)
 *   GOOGLE_CSE_CX          — Programmable Search Engine ID (create at programmablesearchengine.google.com)
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ error: 'Missing query' }, { status: 400 });

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const cx     = process.env.GOOGLE_CSE_CX;

  if (!apiKey || !cx) {
    return NextResponse.json(
      { error: 'GOOGLE_PLACES_API_KEY or GOOGLE_CSE_CX not configured.' },
      { status: 500 }
    );
  }

  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('cx', cx);
  url.searchParams.set('q', q);
  url.searchParams.set('searchType', 'image');
  url.searchParams.set('num', '1');
  url.searchParams.set('imgType', 'photo');
  url.searchParams.set('safe', 'active');

  let res: Response;
  try {
    res = await fetch(url.toString());
  } catch {
    return NextResponse.json({ error: 'Network error reaching Google.' }, { status: 502 });
  }

  const data = await res.json();

  if (!res.ok) {
    return NextResponse.json(
      { error: data?.error?.message ?? 'Google search failed.' },
      { status: res.status }
    );
  }

  const imageUrl: string | null = data.items?.[0]?.link ?? null;
  return NextResponse.json({ imageUrl });
}

import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/equipment/find-image?q=ITEM_NAME
 *
 * Returns the first image URL from Google Custom Search for the given query.
 * Requires:
 *   GOOGLE_CSE_CX — Programmable Search Engine ID (programmablesearchengine.google.com)
 *   Plus one API key (Custom Search JSON API enabled in Google Cloud):
 *     GOOGLE_CUSTOM_SEARCH_API_KEY (optional, preferred for this route) or
 *     GOOGLE_PLACES_API_KEY (reused if custom key not set)
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ error: 'Missing query' }, { status: 400 });

  const cx = process.env.GOOGLE_CSE_CX?.trim() || '';
  const apiKey =
    process.env.GOOGLE_CUSTOM_SEARCH_API_KEY?.trim() ||
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    '';

  if (!apiKey || !cx) {
    const missing: string[] = [];
    if (!apiKey) {
      missing.push('GOOGLE_PLACES_API_KEY or GOOGLE_CUSTOM_SEARCH_API_KEY');
    }
    if (!cx) {
      missing.push('GOOGLE_CSE_CX');
    }
    return NextResponse.json(
      {
        error: 'Google Custom Search is not configured on the server.',
        missing,
        code: 'CSE_NOT_CONFIGURED' as const,
      },
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

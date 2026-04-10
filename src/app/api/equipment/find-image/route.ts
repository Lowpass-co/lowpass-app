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
 *
 * All outcomes except a bad request use HTTP 200 + JSON so clients never treat
 * “not configured” or Google errors as transport failures.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q) {
    return NextResponse.json({ imageUrl: null, code: 'BAD_REQUEST' as const, message: 'Missing query' }, { status: 400 });
  }

  const cx = process.env.GOOGLE_CSE_CX?.trim() || '';
  const apiKey =
    process.env.GOOGLE_CUSTOM_SEARCH_API_KEY?.trim() ||
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    '';

  if (!cx || !apiKey) {
    return NextResponse.json({
      imageUrl: null,
      code: 'CSE_NOT_CONFIGURED' as const,
      message:
        !cx && !apiKey
          ? 'Add GOOGLE_CSE_CX and a Google API key with Custom Search API enabled.'
          : !cx
            ? 'Missing GOOGLE_CSE_CX (search engine ID).'
            : 'Missing GOOGLE_CUSTOM_SEARCH_API_KEY or GOOGLE_PLACES_API_KEY.',
    });
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
    return NextResponse.json({
      imageUrl: null,
      code: 'GOOGLE_CSE_ERROR' as const,
      message: 'Network error reaching Google.',
    });
  }

  let data: { items?: { link?: string }[]; error?: { message?: string } };
  try {
    data = await res.json();
  } catch {
    return NextResponse.json({
      imageUrl: null,
      code: 'GOOGLE_CSE_ERROR' as const,
      message: 'Invalid response from Google.',
    });
  }

  if (!res.ok) {
    return NextResponse.json({
      imageUrl: null,
      code: 'GOOGLE_CSE_ERROR' as const,
      message: data?.error?.message ?? 'Google Custom Search request failed.',
    });
  }

  const imageUrl: string | null = data.items?.[0]?.link ?? null;
  return NextResponse.json({ imageUrl, code: 'OK' as const });
}

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

/**
 * GET /api/equipment/import-sheet?id=SHEET_ID
 *
 * Server-side proxy for Google Sheets → CSV export.
 * Required because fetching directly from the browser hits a CORS block.
 * The sheet must be set to "Anyone with the link can view".
 */
export async function GET(req: NextRequest) {
  // Security audit — was unauthenticated (open proxy / mild SSRF to
  // docs.google.com). Require a logged-in user. The sheet id is already
  // constrained to [A-Za-z0-9_-] so only Sheets export URLs are reachable.
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get('id');
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    return NextResponse.json({ error: 'Invalid sheet ID.' }, { status: 400 });
  }

  const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      redirect: 'follow',
    });
  } catch {
    return new NextResponse('Network error fetching sheet.', { status: 502 });
  }

  if (!res.ok) {
    return new NextResponse(
      'Could not fetch sheet — make sure it is set to "Anyone with the link can view".',
      { status: 422 }
    );
  }

  const contentType = res.headers.get('content-type') ?? '';
  // Google returns HTML when the sheet is private / inaccessible
  if (contentType.includes('text/html')) {
    return new NextResponse(
      'Sheet is not publicly accessible. Set sharing to "Anyone with the link can view".',
      { status: 422 }
    );
  }

  const csv = await res.text();
  return new NextResponse(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8' },
  });
}

/* ============================================
   LOWPASS — GET /api/rental/inventory/[id]/qr.svg (Sprint 12 §2)

   Returns the QR code SVG for one rental_inventory row,
   encoding a scan URL that resolves to /rental/scan?t=<token>.

   Workspace scoping is enforced by RLS — the SELECT here uses
   the caller's auth session, so a request for a row outside
   the caller's workspace returns 404 without leaking
   existence.

   Cache strategy: the qr_token is stable for the lifetime of
   the inventory row, so the SVG is effectively immutable per
   id+token. We set max-age=31536000 immutable and a Vary on
   Cookie so per-workspace responses don't cross-pollute a CDN.
   Adam's print loop will hit this once per item and never
   again unless an item is re-tokenised (no UI for that).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { renderRentalQrSvg } from '@/lib/rental/qr';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: row, error } = await supabase
    .from('rental_inventory')
    .select('id, qr_token')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const item = row as { id: string; qr_token: string | null };
  if (!item.qr_token) {
    return NextResponse.json(
      { error: 'No qr_token on this inventory item.' },
      { status: 409 },
    );
  }

  /* Build the scan URL origin. Prefer the env-pinned canonical
     host so prod QRs always point at lowpass.co even if a
     staging deploy renders them; fall back to the request host
     for local dev. */
  const envOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN?.trim();
  const headerOrigin = new URL(request.url).origin;
  const origin = envOrigin || headerOrigin;

  const svg = await renderRentalQrSvg(item.qr_token, origin);

  return new NextResponse(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

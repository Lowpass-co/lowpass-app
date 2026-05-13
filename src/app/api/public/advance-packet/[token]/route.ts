/* ============================================
   LOWPASS — Public Advance Packet endpoint
   POST /api/public/advance-packet/[token]
        body: { password?: string }

   Token-gated read-only manifest fetch. Service-role client
   scoped to the packet's pack_id; no workspace leakage.
   Password gate mirrors /api/public/rider/[token].

   Stamps last_viewed_at on each successful unlock so the
   in-app share panel can show "Last viewed: …".
   ============================================ */

import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import { verifyPassword } from '@/lib/rider-packs/web-links';
import { getPacketManifest } from '@/lib/advance-packet/manifest';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  let body: { password?: unknown } = {};
  try {
    body = (await request.json()) as { password?: unknown };
  } catch {
    /* empty body ok */
  }
  const password = typeof body.password === 'string' ? body.password : null;

  const service = createServiceSupabaseClient();
  const { data: link } = await service
    .from('advance_packet_links')
    .select('id, tour_id, routing_id, password_hash, revoked_at')
    .eq('token', token)
    .maybeSingle<{
      id: string;
      tour_id: string;
      routing_id: string | null;
      password_hash: string | null;
      revoked_at: string | null;
    }>();
  if (!link || link.revoked_at) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  if (link.password_hash) {
    if (!password) {
      return NextResponse.json({ requires_password: true }, { status: 401 });
    }
    const ok = await verifyPassword(password, link.password_hash);
    if (!ok) {
      return NextResponse.json({ invalid_password: true }, { status: 401 });
    }
  }

  const manifest = await getPacketManifest(service, link.tour_id, link.routing_id);
  if (!manifest) {
    return NextResponse.json({ error: 'Packet not found' }, { status: 404 });
  }

  /* Stamp last_viewed_at + last_viewer_ip. Best-effort — a DB
     error here shouldn't fail the read. IP comes from the
     proxy header (x-forwarded-for) since Vercel sits behind
     a CDN. */
  const ipHeader = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip');
  const ip = ipHeader ? ipHeader.split(',')[0].trim().slice(0, 64) : null;
  try {
    await service
      .from('advance_packet_links')
      .update({ last_viewed_at: new Date().toISOString(), last_viewer_ip: ip })
      .eq('id', link.id);
  } catch {
    /* ignore */
  }

  return NextResponse.json({
    manifest,
    tour_id: link.tour_id,
    routing_id: link.routing_id,
    /* Surface whether the link carries a password so the
       reader's "Download bundled PDF" URL can include the
       password param when the user re-clicks. */
    has_password: !!link.password_hash,
  });
}

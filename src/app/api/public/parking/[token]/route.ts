/* ============================================
   POST /api/public/parking/[token] → a driver's view of ONE show's parking map

   PUBLIC — no session. The unguessable token IS the grant: resolved with the
   service-role client through parking_share_touch() (counts the view; an
   expired / revoked link says so), then driverMapPayload() returns only that
   map, its venue and the drawings' files it uses. POST so the response is
   never cached on the way.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import { DriverLinkError, driverMapPayload, supabaseSignStorage, touchLink } from '@/server/parking/driverLinks';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const service = createServiceSupabaseClient();
    const link = await touchLink(service, token, false);
    return NextResponse.json(await driverMapPayload(service, supabaseSignStorage(service), link), { headers: NO_STORE });
  } catch (e) {
    if (e instanceof DriverLinkError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status, headers: NO_STORE });
    console.error('[public parking]', e);
    return NextResponse.json({ error: 'Couldn’t open this link.' }, { status: 500 });
  }
}

/* ============================================
   POST /api/public/parking/[token]/3d → { remaining3d }   (429 when used up)

   PUBLIC — the token is the grant. Each 3D open is a billed Google session
   (photorealistic 3D tiles), so the page asks here FIRST: parking_share_touch
   takes one of the link's 3D opens atomically, or refuses. The plan view
   never comes through here.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import { remaining3d } from '@/lib/parking/driverLinks';
import { DriverLinkError, touchLink } from '@/server/parking/driverLinks';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const link = await touchLink(createServiceSupabaseClient(), token, true);
    return NextResponse.json({ remaining3d: remaining3d(link) }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof DriverLinkError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status, headers: NO_STORE });
    console.error('[public parking 3d]', e);
    return NextResponse.json({ error: 'Couldn’t open 3D.' }, { status: 500 });
  }
}

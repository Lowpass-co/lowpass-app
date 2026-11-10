/* ============================================
   /api/tours/[id]/parking/[routingId]/drawings — venue drawings (Nov 2026, Adam)

     GET ?ids=a,b   → { files, reuse }
       files  the PDFs / images that can be laid on this map (the tour's
              files, files linked to the show or its venue, and the ids
              asked for — the map's own drawings), with their Storage
              bucket + path for the browser to sign (Storage RLS applies)
       reuse  the latest other map at this venue with drawings, or null

   Same gate as the map's GET: session + workspace + the tour is in it; the
   RLS client does the reads. Reads only.
   ============================================ */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireUserAndWorkspace } from '@/lib/auth/workspace-check';
import { tourGate } from '@/server/advance/routeGuard';
import { loadDrawingFiles, loadParkingShow, loadVenueReuse } from '@/server/parking/maps';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };
type Params = { params: Promise<{ id: string; routingId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id: tourId, routingId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireUserAndWorkspace(supabase as unknown as SupabaseClient);
  if ('error' in auth) return auth.error;
  const gate = await tourGate(supabase, tourId, auth.workspaceId);
  if (gate) return gate;
  const client = supabase as unknown as SupabaseClient;
  try {
    const show = await loadParkingShow(client, tourId, routingId);
    if (!show) return NextResponse.json({ error: 'Show not found' }, { status: 404 });
    const ids = (new URL(request.url).searchParams.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20);
    const reuse = await loadVenueReuse(client, show);
    // The reused drawings' files too, so "Use them" can draw them at once.
    const files = await loadDrawingFiles(client, show, [...ids, ...(reuse?.drawings.map((d) => d.fileId) ?? [])]);
    return NextResponse.json({ files, reuse }, { headers: NO_STORE });
  } catch (e) {
    console.error('[parking drawings]', e);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}

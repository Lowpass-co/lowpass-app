/* ============================================
   /api/tours/[id]/parking/[routingId] — a show's parking map (Production › Parking, Nov 2026)

     GET                              → { show, map | null }
     PUT   { map, version | null }    → { map }       save (409 { error, current } if stale)
     PATCH { pdfFileId }              → { map }       remember the exported PDF

   READ CHECK: session + workspace (requireUserAndWorkspace) + the tour is in
   that workspace (tourGate); the RLS client does the reads.
   WRITES: requireWrite (admin/manager, as every advance write) + tourGate.
   The body goes through parseMapBody() — the one gate into parking_maps.items.
   ============================================ */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireUserAndWorkspace, requireWrite } from '@/lib/auth/workspace-check';
import { readJson, tourGate } from '@/server/advance/routeGuard';
import { ParkingInputError, parseMapBody } from '@/lib/parking/model';
import { ParkingConflict, ParkingNotFound, loadParkingMap, loadParkingShow, recordPdf, saveParkingMap } from '@/server/parking/maps';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };
type Params = { params: Promise<{ id: string; routingId: string }> };

function fail(e: unknown): NextResponse {
  if (e instanceof ParkingInputError) return NextResponse.json({ error: e.message }, { status: 400 });
  if (e instanceof ParkingConflict) return NextResponse.json({ error: e.message, current: e.current }, { status: 409 });
  if (e instanceof ParkingNotFound) return NextResponse.json({ error: e.message }, { status: 404 });
  console.error('[parking]', e);
  return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
}

export async function GET(_request: Request, { params }: Params) {
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
    return NextResponse.json({ show, map: await loadParkingMap(client, routingId) }, { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(request: Request, { params }: Params) {
  const { id: tourId, routingId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const gate = await tourGate(supabase, tourId, auth.workspaceId);
  if (gate) return gate;
  const body = await readJson<{ map?: unknown; version?: unknown }>(request);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const version = body.version == null ? null : Number(body.version);
  if (version != null && !(Number.isInteger(version) && version > 0)) {
    return NextResponse.json({ error: 'version must be a positive whole number or null' }, { status: 400 });
  }
  const client = supabase as unknown as SupabaseClient;
  try {
    const data = parseMapBody(body.map);
    const show = await loadParkingShow(client, tourId, routingId);
    if (!show) return NextResponse.json({ error: 'Show not found' }, { status: 404 });
    const map = await saveParkingMap(client, { show, userId: auth.user.id, data, version });
    return NextResponse.json({ map }, { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const { id: tourId, routingId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const gate = await tourGate(supabase, tourId, auth.workspaceId);
  if (gate) return gate;
  const body = await readJson<{ pdfFileId?: unknown }>(request);
  if (typeof body?.pdfFileId !== 'string' || !body.pdfFileId) return NextResponse.json({ error: 'Send { pdfFileId }' }, { status: 400 });
  const client = supabase as unknown as SupabaseClient;
  try {
    const show = await loadParkingShow(client, tourId, routingId);
    if (!show) return NextResponse.json({ error: 'Show not found' }, { status: 404 });
    return NextResponse.json({ map: await recordPdf(client, { show, fileId: body.pdfFileId }) }, { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}

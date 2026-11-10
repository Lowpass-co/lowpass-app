/* ============================================
   /api/tours/[id]/parking/[routingId]/driver-links — send the map to drivers
   (Nov 2026, Adam — migration 289)

     GET                              → { links }
     POST  { label?, hours?, max3d? } → { token, link }   the token ONCE
     DELETE ?id=…                     → { ok }            turn a link off

   READ: session + workspace + tourGate. WRITES: requireWrite + tourGate.
   Rules: src/lib/parking/driverLinks.ts; server: src/server/parking/driverLinks.ts.
   ============================================ */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireUserAndWorkspace, requireWrite } from '@/lib/auth/workspace-check';
import { readJson, tourGate } from '@/server/advance/routeGuard';
import { DriverLinkInputError, parseCreate } from '@/lib/parking/driverLinks';
import { DriverLinkError, createDriverLink, listDriverLinks, revokeDriverLink } from '@/server/parking/driverLinks';
import { loadParkingShow } from '@/server/parking/maps';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };
type Params = { params: Promise<{ id: string; routingId: string }> };

function fail(e: unknown): NextResponse {
  if (e instanceof DriverLinkInputError) return NextResponse.json({ error: e.message }, { status: 400 });
  if (e instanceof DriverLinkError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  console.error('[parking driver links]', e);
  return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
}

export async function GET(_request: Request, { params }: Params) {
  const { id: tourId, routingId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireUserAndWorkspace(supabase as unknown as SupabaseClient);
  if ('error' in auth) return auth.error;
  const gate = await tourGate(supabase, tourId, auth.workspaceId);
  if (gate) return gate;
  return NextResponse.json({ links: await listDriverLinks(supabase as unknown as SupabaseClient, routingId) }, { headers: NO_STORE });
}

export async function POST(request: Request, { params }: Params) {
  const { id: tourId, routingId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const gate = await tourGate(supabase, tourId, auth.workspaceId);
  if (gate) return gate;
  const client = supabase as unknown as SupabaseClient;
  try {
    const input = parseCreate(await readJson(request));
    const show = await loadParkingShow(client, tourId, routingId);
    if (!show) return NextResponse.json({ error: 'Show not found' }, { status: 404 });
    return NextResponse.json(await createDriverLink(client, { show, userId: auth.user.id, input }), { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { id: tourId, routingId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const gate = await tourGate(supabase, tourId, auth.workspaceId);
  if (gate) return gate;
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Send ?id=' }, { status: 400 });
  try {
    await revokeDriverLink(supabase as unknown as SupabaseClient, { routingId, id });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}

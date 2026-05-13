/* ============================================
   LOWPASS — Advance packet manifest + share-link CRUD
   GET    /api/advance-packets/[tourId]/[routingId]
   POST   /api/advance-packets/[tourId]/[routingId]   { password?: string }

   GET returns the packet manifest (riders + channel lists +
   hire jobs for the tour) plus the latest non-revoked share
   link if any.

   POST creates a new share link, optionally with a password.
   If an active (non-revoked) link already exists, it is
   left alone — multiple links per packet are allowed; the
   PATCH/DELETE endpoints on /api/advance-packet-links/[id]
   manage individual links.

   Auth gate: workspace member + tour-belongs-to-workspace.
   Reuses §SAFE's requireUserAndWorkspace + requireTourInWorkspace.

   Routing scope: routingId in the URL refers to a routing
   row (NOT tour_routing — see manifest.ts header). Passed as
   a UUID; the manifest helper validates it belongs to the
   tour.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  requireUserAndWorkspace,
  requireTourInWorkspace,
} from '@/lib/auth/workspace-check';
import { getPacketManifest } from '@/lib/advance-packet/manifest';
import {
  generateToken,
  hashPassword,
  type WebLinkPublic,
} from '@/lib/rider-packs/web-links';

export const dynamic = 'force-dynamic';

interface PacketLinkRow {
  id: string;
  tour_id: string;
  routing_id: string | null;
  token: string;
  password_hash: string | null;
  created_by: string | null;
  created_at: string;
  revoked_at: string | null;
  last_viewed_at: string | null;
}

function toPublic(row: PacketLinkRow): WebLinkPublic & {
  routing_id: string | null;
  last_viewed_at: string | null;
} {
  return {
    id: row.id,
    pack_id: row.tour_id /* compat shape — packet has no pack_id, fill with tour_id */,
    token: row.token,
    has_password: !!row.password_hash,
    created_by: row.created_by,
    created_at: row.created_at,
    revoked_at: row.revoked_at,
    revoked_reason: null,
    routing_id: row.routing_id,
    last_viewed_at: row.last_viewed_at,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tourId: string; routingId: string }> },
): Promise<NextResponse> {
  const { tourId, routingId } = await params;

  const supabase = await createServerSupabaseClient();
  const auth = await requireUserAndWorkspace(supabase);
  if ('error' in auth) return auth.error;
  const tourGate = await requireTourInWorkspace(supabase, tourId, auth.workspaceId);
  if (tourGate) return tourGate;

  const manifest = await getPacketManifest(supabase, tourId, routingId);
  if (!manifest) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  /* Active link = non-revoked, most-recent created. RLS already
     filters to the caller's workspace. */
  const { data: linkRow } = await supabase
    .from('advance_packet_links')
    .select('id, tour_id, routing_id, token, password_hash, created_by, created_at, revoked_at, last_viewed_at')
    .eq('tour_id', tourId)
    .eq('routing_id', routingId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<PacketLinkRow>();

  return NextResponse.json({
    manifest,
    link: linkRow ? toPublic(linkRow) : null,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tourId: string; routingId: string }> },
): Promise<NextResponse> {
  const { tourId, routingId } = await params;

  const supabase = await createServerSupabaseClient();
  const auth = await requireUserAndWorkspace(supabase);
  if ('error' in auth) return auth.error;
  const tourGate = await requireTourInWorkspace(supabase, tourId, auth.workspaceId);
  if (tourGate) return tourGate;

  let body: { password?: unknown } = {};
  try {
    body = (await request.json()) as { password?: unknown };
  } catch {
    /* empty body ok — create a passwordless link */
  }
  const password = typeof body.password === 'string' && body.password.length > 0
    ? body.password
    : null;

  const token = generateToken();
  const password_hash = password ? await hashPassword(password) : null;

  const { data: inserted, error } = await supabase
    .from('advance_packet_links')
    .insert({
      workspace_id: auth.workspaceId,
      tour_id: tourId,
      routing_id: routingId,
      token,
      password_hash,
      created_by: auth.user.id,
    })
    .select('id, tour_id, routing_id, token, password_hash, created_by, created_at, revoked_at, last_viewed_at')
    .single<PacketLinkRow>();

  if (error || !inserted) {
    return NextResponse.json(
      { error: error?.message ?? 'Could not create share link' },
      { status: 500 },
    );
  }

  return NextResponse.json({ link: toPublic(inserted) }, { status: 201 });
}

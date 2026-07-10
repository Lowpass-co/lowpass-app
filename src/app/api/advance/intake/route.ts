/* ============================================
   LOWPASS — Advance intake links · create + list (T3)

   POST /api/advance/intake
     { tourId, routingId, recipientName?, recipientEmail?, expiresInDays? }
     → generates a venue-intake token for the show and returns it. The
       caller builds the shareable URL (/intake/<token>) client-side.

   GET  /api/advance/intake?tourId=…&routingId=…
     → lists this show's intake links (most recent first) for the UI.

   Auth gate: workspace member + tour-belongs-to-workspace (same
   requireUserAndWorkspace / requireTourInWorkspace used by the packet
   share route). The public venue routes live under /api/public/… and
   use the service-role client instead.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  requireUserAndWorkspace,
  requireTourInWorkspace,
} from '@/lib/auth/workspace-check';
import { generateToken } from '@/lib/rider-packs/web-links';
import { seedShowReminders } from '@/lib/intake/reminders-server';

export const dynamic = 'force-dynamic';

interface IntakeLinkRow {
  id: string;
  tour_id: string;
  routing_id: string;
  token: string;
  status: string;
  recipient_name: string | null;
  recipient_email: string | null;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  submitted_at: string | null;
  submitted_by_name: string | null;
  last_viewed_at: string | null;
}

const LINK_COLUMNS =
  'id, tour_id, routing_id, token, status, recipient_name, recipient_email, created_at, expires_at, revoked_at, submitted_at, submitted_by_name, last_viewed_at';

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const tourId = url.searchParams.get('tourId');
  const routingId = url.searchParams.get('routingId');
  if (!tourId || !routingId) {
    return NextResponse.json(
      { error: 'tourId and routingId are required' },
      { status: 400 },
    );
  }

  const supabase = await createServerSupabaseClient();
  const auth = await requireUserAndWorkspace(supabase);
  if ('error' in auth) return auth.error;
  const tourGate = await requireTourInWorkspace(supabase, tourId, auth.workspaceId);
  if (tourGate) return tourGate;

  const { data, error } = await supabase
    .from('advance_intake_links')
    .select(LINK_COLUMNS)
    .eq('tour_id', tourId)
    .eq('routing_id', routingId)
    .order('created_at', { ascending: false })
    .returns<IntakeLinkRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ links: data ?? [] });
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: {
    tourId?: unknown;
    routingId?: unknown;
    recipientName?: unknown;
    recipientEmail?: unknown;
    expiresInDays?: unknown;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const tourId = typeof body.tourId === 'string' ? body.tourId : null;
  const routingId = typeof body.routingId === 'string' ? body.routingId : null;
  if (!tourId || !routingId) {
    return NextResponse.json(
      { error: 'tourId and routingId are required' },
      { status: 400 },
    );
  }
  const recipientName =
    typeof body.recipientName === 'string' && body.recipientName.trim()
      ? body.recipientName.trim()
      : null;
  const recipientEmail =
    typeof body.recipientEmail === 'string' && body.recipientEmail.trim()
      ? body.recipientEmail.trim()
      : null;
  const expiresInDays =
    typeof body.expiresInDays === 'number' && Number.isFinite(body.expiresInDays)
      ? Math.max(1, Math.min(365, Math.round(body.expiresInDays)))
      : null;

  const supabase = await createServerSupabaseClient();
  const auth = await requireUserAndWorkspace(supabase);
  if ('error' in auth) return auth.error;
  const tourGate = await requireTourInWorkspace(supabase, tourId, auth.workspaceId);
  if (tourGate) return tourGate;

  // Resolve the write-back target instance for this show (may be null if
  // the advance hasn't been initialised yet; the submit route re-resolves
  // by routing_id as a fallback).
  const { data: instanceRow } = await supabase
    .from('advance_instances')
    .select('id')
    .eq('routing_id', routingId)
    .maybeSingle<{ id: string }>();

  // Show date drives the T-14/7/3 reminder schedule (seeded below).
  const { data: routingRow } = await supabase
    .from('routing')
    .select('date')
    .eq('id', routingId)
    .maybeSingle<{ date: string | null }>();

  const token = generateToken();
  const expires_at = expiresInDays
    ? new Date(Date.now() + expiresInDays * 86_400_000).toISOString()
    : null;

  const { data: inserted, error } = await supabase
    .from('advance_intake_links')
    .insert({
      workspace_id: auth.workspaceId,
      tour_id: tourId,
      routing_id: routingId,
      advance_instance_id: instanceRow?.id ?? null,
      token,
      recipient_name: recipientName,
      recipient_email: recipientEmail,
      expires_at,
      created_by: auth.user.id,
    })
    .select(LINK_COLUMNS)
    .single<IntakeLinkRow>();

  if (error || !inserted) {
    return NextResponse.json(
      { error: error?.message ?? 'Could not create intake link' },
      { status: 500 },
    );
  }

  // Seed the T-14/7/3 venue reminders (future dates only). Best-effort —
  // a seeding failure must not fail link creation.
  await seedShowReminders(supabase, {
    linkId: inserted.id,
    workspaceId: auth.workspaceId,
    showDate: routingRow?.date ?? null,
  });

  return NextResponse.json({ link: inserted }, { status: 201 });
}

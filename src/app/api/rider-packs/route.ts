/* ============================================
   LOWPASS — Rider/Pack collection

   GET  /api/rider-packs?scope=artist|tour|show
                        &artist_id=...
                        &tour_id=...
                        &routing_id=...
   POST /api/rider-packs   body: { scope, artist_id,
                                   tour_id?, routing_id?, title? }
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { appendHistory } from '@/lib/rider-packs/history';
import type { PackScope } from '@/lib/rider-packs/types';

const SCOPES: PackScope[] = ['artist', 'tour', 'show'];

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get('scope');
  const artistId = searchParams.get('artist_id');
  const tourId = searchParams.get('tour_id');
  const routingId = searchParams.get('routing_id');

  let query = supabase.from('rider_packs').select('*');

  if (scope) {
    if (!SCOPES.includes(scope as PackScope)) {
      return NextResponse.json({ error: 'Invalid scope' }, { status: 400 });
    }
    query = query.eq('scope', scope);
  }
  if (artistId) query = query.eq('artist_id', artistId);
  if (tourId) query = query.eq('tour_id', tourId);
  if (routingId) query = query.eq('routing_id', routingId);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ packs: data ?? [] });
}

function userFacingUniqueViolationMessage(postgresMessage: string): string {
  if (postgresMessage.includes('rider_packs_artist_unique')) {
    return 'This artist already has a rider pack at the artist level. There can only be one per artist; open the existing pack in the list to edit it.';
  }
  if (postgresMessage.includes('rider_packs_tour_unique')) {
    return 'A rider pack for this tour already exists. Open that pack in the list to edit it.';
  }
  if (postgresMessage.includes('rider_packs_show_unique')) {
    return 'A rider pack for this show already exists. Open that pack in the list to edit it.';
  }
  return 'A pack already exists for this scope. There can only be one pack per artist, one per tour, or one per show.';
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const scope = body.scope as PackScope | undefined;
  const artistId = body.artist_id as string | undefined;
  const tourId = (body.tour_id as string | undefined) ?? null;
  const routingId = (body.routing_id as string | undefined) ?? null;
  const title = (body.title as string | undefined) ?? null;

  if (!scope || !SCOPES.includes(scope)) {
    return NextResponse.json({ error: 'scope must be artist|tour|show' }, { status: 400 });
  }
  if (!artistId) {
    return NextResponse.json({ error: 'artist_id is required' }, { status: 400 });
  }

  // Shape checks mirror the DB CHECK constraint — fail fast with a clear message.
  if (scope === 'artist' && (tourId || routingId)) {
    return NextResponse.json(
      { error: 'artist scope cannot have tour_id or routing_id' },
      { status: 400 },
    );
  }
  if (scope === 'tour' && (!tourId || routingId)) {
    return NextResponse.json(
      { error: 'tour scope requires tour_id and no routing_id' },
      { status: 400 },
    );
  }
  if (scope === 'show' && (!tourId || !routingId)) {
    return NextResponse.json(
      { error: 'show scope requires both tour_id and routing_id' },
      { status: 400 },
    );
  }

  // Workspace lookup for the row.
  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  // Verify artist belongs to workspace.
  const { data: artist } = await supabase
    .from('artists')
    .select('id')
    .eq('id', artistId)
    .eq('workspace_id', profile.workspace_id)
    .maybeSingle();
  if (!artist) {
    return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
  }

  // One artist-scoped pack per artist (unique partial index rider_packs_artist_unique).
  if (scope === 'artist') {
    const { data: dupe, error: dupeError } = await supabase
      .from('rider_packs')
      .select('id')
      .eq('artist_id', artistId)
      .eq('scope', 'artist')
      .maybeSingle();
    if (dupeError) {
      return NextResponse.json({ error: dupeError.message }, { status: 500 });
    }
    if (dupe) {
      return NextResponse.json(
        {
          error: userFacingUniqueViolationMessage('rider_packs_artist_unique'),
          code: 'DUPLICATE_PACK',
        },
        { status: 409 },
      );
    }
  }

  const { data: inserted, error } = await supabase
    .from('rider_packs')
    .insert({
      workspace_id: profile.workspace_id,
      scope,
      artist_id: artistId,
      tour_id: tourId,
      routing_id: routingId,
      title,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    // One pack per (artist | tour+artist | show+artist) — see partial unique indexes in migration 034.
    if (error.code === '23505') {
      const message = userFacingUniqueViolationMessage(error.message);
      return NextResponse.json({ error: message, code: 'DUPLICATE_PACK' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await appendHistory(supabase, {
    packId: inserted.id,
    changedBy: user.id,
    changeType: 'pack.created',
    newValue: inserted,
  });

  return NextResponse.json(inserted, { status: 201 });
}

/* ============================================
   LOWPASS — Rider/Pack collection

   GET  /api/rider-packs?scope=artist|tour|show
                        &artist_id=...
                        &tour_id=...
                        &routing_id=...
   POST /api/rider-packs   body: { scope, artist_id,
                                   tour_id?, routing_id?, title?,
                                   inherit_from_folder_id? } — creates
                                   a rider_folders row + one rider_packs row.

   See migration 039: many folders (and thus riders) per artist / tour / show;
   one pack per folder.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { appendHistory } from '@/lib/rider-packs/history';
import { isRiderFoldersMissingError, RIDER_FOLDERS_SETUP_MESSAGE } from '@/lib/rider-packs/schema-errors';
import type { PackScope } from '@/lib/rider-packs/types';
import { computeRiderProgress, type SectionLike } from '@/lib/rider-packs/progress';

const SCOPES: PackScope[] = ['artist', 'tour', 'show'];

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  const packs = data ?? [];

  // §RA11 — attach a per-pack completion summary so the sidebar can show
  // a progress bar without an N+1 fetch. One extra query for all packs'
  // sections; RLS scopes them. Failure here degrades gracefully (no
  // progress field) rather than failing the list.
  if (packs.length > 0) {
    const ids = packs.map((p) => p.id);
    const { data: secRows } = await supabase
      .from('rider_sections')
      .select('pack_id, fields, section_type, status')
      .in('pack_id', ids);
    if (secRows) {
      const byPack = new Map<string, SectionLike[]>();
      for (const row of secRows as Array<SectionLike & { pack_id: string }>) {
        const list = byPack.get(row.pack_id) ?? [];
        list.push(row);
        byPack.set(row.pack_id, list);
      }
      for (const p of packs) {
        p.progress = computeRiderProgress(byPack.get(p.id) ?? []);
      }
    }
  }

  return NextResponse.json({ packs });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
  const inheritFromClient = (body.inherit_from_folder_id as string | null | undefined) ?? undefined;
  /* Sprint 12 §7 — kind discriminator. Optional; defaults to
     'rider' so legacy callers continue working unchanged.
     Channel-list templates from the artist library pass
     'channel_list' explicitly. */
  const kindClient = body.kind as string | undefined;
  if (kindClient !== undefined && kindClient !== 'rider' && kindClient !== 'channel_list') {
    return NextResponse.json(
      { error: "kind must be 'rider' or 'channel_list'" },
      { status: 400 },
    );
  }
  const kind: 'rider' | 'channel_list' = (kindClient as 'rider' | 'channel_list' | undefined) ?? 'rider';

  if (!scope || !SCOPES.includes(scope)) {
    return NextResponse.json({ error: 'scope must be artist|tour|show' }, { status: 400 });
  }
  if (!artistId) {
    return NextResponse.json({ error: 'artist_id is required' }, { status: 400 });
  }

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

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  const { data: artist } = await supabase
    .from('artists')
    .select('id')
    .eq('id', artistId)
    .eq('workspace_id', profile.workspace_id)
    .maybeSingle();
  if (!artist) {
    return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
  }

  let resolvedInherit: string | null = null;
  if (inheritFromClient !== undefined) {
    if (inheritFromClient === null || inheritFromClient === '') {
      resolvedInherit = null;
    } else {
      const { data: pFolder, error: pErr } = await supabase
        .from('rider_folders')
        .select('id, artist_id, workspace_id')
        .eq('id', inheritFromClient)
        .maybeSingle();
      if (pErr) {
        if (isRiderFoldersMissingError(pErr.message)) {
          return NextResponse.json(
            { error: RIDER_FOLDERS_SETUP_MESSAGE, code: 'MIGRATION_REQUIRED' },
            { status: 503 },
          );
        }
        return NextResponse.json({ error: pErr.message }, { status: 500 });
      }
      if (!pFolder || pFolder.artist_id !== artistId || pFolder.workspace_id !== profile.workspace_id) {
        return NextResponse.json(
          { error: 'inherit_from_folder_id is invalid for this artist' },
          { status: 400 },
        );
      }
      resolvedInherit = inheritFromClient;
    }
  } else {
    if (scope === 'tour') {
      const { data: artFolder, error: artFolderErr } = await supabase
        .from('rider_folders')
        .select('id')
        .eq('artist_id', artistId)
        .eq('scope', 'artist')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (artFolderErr && isRiderFoldersMissingError(artFolderErr.message)) {
        return NextResponse.json(
          { error: RIDER_FOLDERS_SETUP_MESSAGE, code: 'MIGRATION_REQUIRED' },
          { status: 503 },
        );
      }
      resolvedInherit = artFolder?.id ?? null;
    } else if (scope === 'show') {
      const { data: tourFolder, error: tourFolderErr } = await supabase
        .from('rider_folders')
        .select('id')
        .eq('artist_id', artistId)
        .eq('tour_id', tourId)
        .eq('scope', 'tour')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (tourFolderErr && isRiderFoldersMissingError(tourFolderErr.message)) {
        return NextResponse.json(
          { error: RIDER_FOLDERS_SETUP_MESSAGE, code: 'MIGRATION_REQUIRED' },
          { status: 503 },
        );
      }
      resolvedInherit = tourFolder?.id ?? null;
    }
  }

  const { data: folder, error: folderError } = await supabase
    .from('rider_folders')
    .insert({
      workspace_id: profile.workspace_id,
      artist_id: artistId,
      scope,
      tour_id: tourId,
      routing_id: routingId,
      title,
      inherit_from_folder_id: resolvedInherit,
    })
    .select()
    .single();
  if (folderError) {
    if (isRiderFoldersMissingError(folderError.message)) {
      return NextResponse.json(
        { error: RIDER_FOLDERS_SETUP_MESSAGE, code: 'MIGRATION_REQUIRED' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: folderError.message }, { status: 400 });
  }

  const { data: inserted, error } = await supabase
    .from('rider_packs')
    .insert({
      workspace_id: profile.workspace_id,
      folder_id: folder.id,
      scope,
      artist_id: artistId,
      tour_id: tourId,
      routing_id: routingId,
      title,
      kind,
      created_by: user.id,
    })
    .select('*')
    .single();

  if (error) {
    await supabase.from('rider_folders').delete().eq('id', folder.id);
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'A pack with this link already exists.', code: 'DUPLICATE_PACK' },
        { status: 409 },
      );
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

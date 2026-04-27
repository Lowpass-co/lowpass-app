/* POST /api/rider-packs/[id]/reassign  { artist_id } — move pack (and folder) to another act in the workspace. */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: packId } = await params;
  let body: { artist_id?: string };
  try {
    body = (await request.json()) as { artist_id?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const artistId = body.artist_id?.trim();
  if (!artistId) {
    return NextResponse.json({ error: 'artist_id is required' }, { status: 400 });
  }

  const { data: pack, error: packErr } = await supabase
    .from('rider_packs')
    .select('id, folder_id, workspace_id, artist_id')
    .eq('id', packId)
    .maybeSingle();
  if (packErr || !pack) {
    return NextResponse.json({ error: 'Pack not found' }, { status: 404 });
  }

  const { data: artist, error: artErr } = await supabase
    .from('artists')
    .select('id')
    .eq('id', artistId)
    .eq('workspace_id', pack.workspace_id)
    .maybeSingle();
  if (artErr || !artist) {
    return NextResponse.json({ error: 'Artist not in this workspace' }, { status: 400 });
  }

  if (pack.artist_id === artistId) {
    return NextResponse.json({ ok: true, message: 'Already on that artist' });
  }

  const { error: updPack } = await supabase
    .from('rider_packs')
    .update({ artist_id: artistId })
    .eq('id', packId);
  if (updPack) {
    return NextResponse.json({ error: updPack.message }, { status: 400 });
  }

  if (pack.folder_id) {
    const { error: updFolder } = await supabase
      .from('rider_folders')
      .update({ artist_id: artistId })
      .eq('id', pack.folder_id);
    if (updFolder) {
      return NextResponse.json({ error: updFolder.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}

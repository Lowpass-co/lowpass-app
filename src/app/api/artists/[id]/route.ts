/* ============================================
   LOWPASS — Single Artist API

   GET: Artist by id
   PATCH: Update artist (name, Spotify, branding)
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { data, error } = await supabase
    .from('artists')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? 'Not found' },
      { status: error?.code === 'PGRST116' ? 404 : 500 }
    );
  }
  return NextResponse.json(data);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  const branding = body.branding ?? {};
  if (body.logo_url !== undefined) branding.logo_url = body.logo_url;
  if (body.banner_url !== undefined) branding.banner_url = body.banner_url;

  const updates: Record<string, unknown> = {};
  if (body.name != null && typeof body.name === 'string') updates.name = body.name.trim();
  if (body.spotify_id !== undefined) updates.spotify_id = body.spotify_id ?? null;
  if (body.spotify_image_url !== undefined) updates.spotify_image_url = body.spotify_image_url ?? null;
  if (body.spotify_banner_url !== undefined) updates.spotify_banner_url = body.spotify_banner_url ?? null;
  if (Object.keys(branding).length) updates.branding = branding;

  if (Object.keys(updates).length === 0) {
    const { data } = await supabase.from('artists').select('*').eq('id', id).single();
    return NextResponse.json(data);
  }

  const { data, error } = await supabase
    .from('artists')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const { count, error: countErr } = await supabase
    .from('tours')
    .select('*', { count: 'exact', head: true })
    .eq('artist_id', id);

  if (countErr) {
    return NextResponse.json({ error: countErr.message }, { status: 500 });
  }
  if (count != null && count > 0) {
    return NextResponse.json(
      { error: 'Cannot delete artist while tours are linked. Remove or reassign tours first.' },
      { status: 409 }
    );
  }

  const { error } = await supabase.from('artists').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}

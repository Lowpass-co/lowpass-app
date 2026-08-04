/* ============================================
   LOWPASS — Artists API

   GET: List artists in current user's workspace
   POST: Create artist (name → slug auto)
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { slugify } from '@/lib/utils';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('artists')
    .select('*')
    .eq('workspace_id', profile.workspace_id)
    .order('name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  const body = await request.json();
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const slug = slugify(name);
  const branding = {
    ...(body.branding ?? {}),
    ...(body.logo_url != null && { logo_url: body.logo_url }),
    ...(body.banner_url != null && { banner_url: body.banner_url }),
  };
  const insert: Record<string, unknown> = {
    workspace_id: profile.workspace_id,
    name,
    slug: slug || 'artist',
    branding,
  };
  if (body.spotify_id != null) insert.spotify_id = body.spotify_id;
  if (body.spotify_image_url != null) insert.spotify_image_url = body.spotify_image_url;
  if (body.spotify_banner_url != null) insert.spotify_banner_url = body.spotify_banner_url;

  const { data, error } = await supabase
    .from('artists')
    .insert(insert)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'An artist with this name already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

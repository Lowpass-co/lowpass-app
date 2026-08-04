/* ============================================
   LOWPASS — Tours API

   GET: List tours in workspace (with artist)
   POST: Create tour
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await supabase
    .from('tours')
    .select('*, artist:artists(*)', { count: 'exact' })
    .eq('workspace_id', profile.workspace_id)
    .order('start_date', { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    tours: data ?? [],
    total: count ?? 0,
    page,
    limit,
  });
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
  const {
    artist_id,
    name,
    start_date,
    end_date,
    continent = 'UK',
    currency = 'GBP',
    principal_count = 0,
    band_count = 0,
    crew_count = 0,
  } = body;

  if (!artist_id || !name?.trim() || !start_date || !end_date) {
    return NextResponse.json(
      { error: 'artist_id, name, start_date, and end_date are required' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('tours')
    .insert({
      workspace_id: profile.workspace_id,
      artist_id,
      name: name.trim(),
      start_date,
      end_date,
      continent: continent || 'UK',
      currency: currency || 'GBP',
      principal_count: Number(principal_count) || 0,
      band_count: Number(band_count) || 0,
      crew_count: Number(crew_count) || 0,
      status: 'planning',
    })
    .select(`
      *,
      artist:artists(*)
    `)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

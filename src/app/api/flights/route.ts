import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const tourId = searchParams.get('tour_id');
  const query = searchParams.get('q')?.trim() ?? '';
  const limit = Number(searchParams.get('limit') ?? '50');

  let dbQuery = supabase
    .from('flights')
    .select('*')
    .order('depart_at', { ascending: true })
    .limit(Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50);

  if (tourId) dbQuery = dbQuery.eq('tour_id', tourId);
  if (query) {
    dbQuery = dbQuery.or(
      `airline.ilike.%${query}%,flight_number.ilike.%${query}%,origin_airport.ilike.%${query}%,destination_airport.ilike.%${query}%,pnr.ilike.%${query}%`
    );
  }

  const { data, error } = await dbQuery;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ flights: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const { data, error } = await supabase
    .from('flights')
    .insert({
      ...body,
      workspace_id: (body.workspace_id as string | undefined) ?? profile.workspace_id,
      created_by: user.id,
      updated_by: user.id,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

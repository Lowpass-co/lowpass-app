import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim();
  const tourId = searchParams.get('tour_id');
  const limit = Number(searchParams.get('limit') ?? 50);
  const group = searchParams.get('group');

  if (group === 'hotel') {
    let hotelQuery = supabase
      .from('hotels')
      .select('*')
      .eq('workspace_id', profile.workspace_id)
      .order('check_in_at', { ascending: true, nullsFirst: true })
      .limit(Math.max(1, Math.min(limit, 200)));
    if (tourId) hotelQuery = hotelQuery.eq('tour_id', tourId);
    if (q) hotelQuery = hotelQuery.or(`name.ilike.%${q}%,city.ilike.%${q}%`);
    const { data, error } = await hotelQuery;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ hotels: data ?? [] });
  }

  let query = supabase
    .from('rooms')
    .select(`
      *,
      hotels(id, name, address, city, phone, confirmation_number, tour_id)
    `)
    .eq('workspace_id', profile.workspace_id)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 200)));

  if (tourId) query = query.eq('hotels.tour_id', tourId);
  if (q) query = query.or(`room_number.ilike.%${q}%,room_type.ilike.%${q}%,hotels.name.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rooms: data ?? [] });
}

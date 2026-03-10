/* ============================================
   LOWPASS — Calendar Events API

   GET: All show/festival dates across workspace tours
   for the global calendar view.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const SHOW_DAY_TYPES = ['show', 'festival'];

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
    return NextResponse.json({ events: [], tours: [], artists: [] });
  }

  const { data: tours, error: toursError } = await supabase
    .from('tours')
    .select('id, name, artist_id, artist:artists(id, name)')
    .eq('workspace_id', profile.workspace_id)
    .in('status', ['planning', 'active'])
    .order('start_date', { ascending: false });

  if (toursError || !tours?.length) {
    return NextResponse.json({ events: [], tours: [], artists: [] });
  }

  const tourIds = tours.map((t) => t.id);
  const tourById = new Map(tours.map((t) => [t.id, t]));
  const artists = Array.from(
    new Map(
      tours.map((t) => {
        const a = Array.isArray(t.artist) ? t.artist[0] : t.artist;
        return [a?.id ?? t.artist_id, { id: a?.id ?? t.artist_id, name: (a as { name?: string })?.name ?? '—' }];
      })
    ).values()
  );

  const { data: routingRows } = await supabase
    .from('routing')
    .select('id, tour_id, date, day_type, venue_name, city')
    .in('tour_id', tourIds)
    .order('date');

  const events = (routingRows ?? [])
    .filter((r) => {
      const types = (r.day_type ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
      return SHOW_DAY_TYPES.some((t) => types.includes(t));
    })
    .map((r) => {
      const tour = tourById.get(r.tour_id);
      const artist = tour && (Array.isArray(tour.artist) ? tour.artist[0] : tour.artist);
      return {
        date: r.date,
        tour_id: r.tour_id,
        tour_name: (tour as { name?: string })?.name ?? '—',
        artist_id: (artist as { id?: string })?.id,
        artist_name: (artist as { name?: string })?.name ?? '—',
        routing_id: r.id,
        venue_name: r.venue_name ?? null,
        city: r.city ?? '',
      };
    });

  return NextResponse.json({
    events,
    tours: tours.map((t) => ({ id: t.id, name: (t as { name?: string }).name ?? '—', artist_name: (Array.isArray(t.artist) ? t.artist[0] : t.artist) as { name?: string } | null })),
    artists,
  });
}

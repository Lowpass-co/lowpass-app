/* ============================================
   LOWPASS — Routing API (for Day View tab)

   GET: List routing dates for a tour (?tour_id=uuid), joined with venues when available.
   ============================================ */

import { NextResponse } from 'next/server';
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
  const tourId = searchParams.get('tour_id');
  if (!tourId) {
    return NextResponse.json({ error: 'tour_id is required' }, { status: 400 });
  }

  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('workspace_id', profile.workspace_id)
    .single();

  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('routing')
    .select('id, date, day_type, venue_id, venue_name, city, country, venues(name, city, country)')
    .eq('tour_id', tourId)
    .order('date', { ascending: true });

  if (error) {
    // Fallback if join columns differ
    const fallback = await supabase
      .from('routing')
      .select('id, date, day_type, venue_id, venue_name, city, country')
      .eq('tour_id', tourId)
      .order('date', { ascending: true });
    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message }, { status: 500 });
    }
    return NextResponse.json({ routing: fallback.data ?? [] });
  }

  const rows = (data ?? []).map((r) => {
    const venue = Array.isArray((r as { venues?: unknown }).venues) ? (r as { venues?: unknown[] }).venues?.[0] : (r as { venues?: unknown }).venues;
    return {
      ...r,
      venue: venue
        ? {
            name: (venue as { name?: string | null }).name ?? (r as { venue_name?: string | null }).venue_name ?? null,
            city: (venue as { city?: string | null }).city ?? (r as { city?: string | null }).city ?? null,
            country: (venue as { country?: string | null }).country ?? (r as { country?: string | null }).country ?? null,
          }
        : {
            name: (r as { venue_name?: string | null }).venue_name ?? null,
            city: (r as { city?: string | null }).city ?? null,
            country: (r as { country?: string | null }).country ?? null,
          },
    };
  });

  return NextResponse.json({ routing: rows });
}


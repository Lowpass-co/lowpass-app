/* ============================================
   LOWPASS — Tours-by-artist API (Sprint 6 §2)

   GET /api/artists/[id]/tours — returns the workspace's tours
   for one artist with the lean projection the
   <ArtistTourSwitcher> needs (id, name, start_date, end_date).
   Sorted by start_date desc.

   Used when the user clicks a different artist in the switcher
   so the dropdown can replace the previous artist's tours
   immediately rather than waiting on the bigger ?limit=200
   filter-on-client fetch the context does.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: artistId } = await params;
  if (!artistId) {
    return NextResponse.json(
      { error: 'artist id required' },
      { status: 400 },
    );
  }

  // RLS handles workspace scoping — the policy on `tours` already
  // restricts to the caller's workspace. No need to fetch
  // workspace_id from profiles before the query.
  const { data, error } = await supabase
    .from('tours')
    .select('id, name, start_date, end_date')
    .eq('artist_id', artistId)
    .order('start_date', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ tours: data ?? [] });
}

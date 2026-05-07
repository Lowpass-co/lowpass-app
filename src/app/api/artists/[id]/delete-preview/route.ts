/* ============================================
   LOWPASS — Sprint 8.4 §3 — Artist delete preview API

   GET /api/artists/[id]/delete-preview

   Returns counts of tour-scoped + artist-scoped rows that will
   be cascade-deleted when DELETE /api/artists/[id] runs. Used
   by <ArtistDeleteConfirmationModal> to populate the head-line
   counts before the user types DELETE.

   Cascade scope: artist → ALL their tours → all 22 tour-scoped
   tables (transitive cascade per Sprint 8.1 §5 audit). Plus
   artist-scoped tables (rider_packs, rider_assets, rider_folders
   that reference artists.id directly).

   Auth-gated; RLS-scoped — counts reflect what the caller can
   actually see.
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

  // Confirm the artist exists + the caller can see it.
  const { data: artist, error: artistErr } = await supabase
    .from('artists')
    .select('id, name')
    .eq('id', artistId)
    .maybeSingle();

  if (artistErr || !artist) {
    return NextResponse.json(
      { error: 'Artist not found' },
      { status: 404 },
    );
  }

  // First fetch the tour ids under this artist so we can scope
  // the tour-cascaded counts. RLS-filtered.
  const { data: tourRows } = await supabase
    .from('tours')
    .select('id')
    .eq('artist_id', artistId);

  const tourIds = (
    (tourRows ?? []) as Array<{ id: string }>
  ).map((t) => t.id);

  // Run all counts in parallel. count: 'exact' / head: true is
  // cheap (no row data hauled).
  const noTourCounts = tourIds.length === 0;
  const [
    showsRes,
    budgetRes,
    riderPacksRes,
    dealMemosRes,
    flightsRes,
    hotelsRes,
    gearRes,
  ] = await Promise.all([
    noTourCounts
      ? Promise.resolve({ count: 0 })
      : supabase
          .from('routing')
          .select('id', { count: 'exact', head: true })
          .in('tour_id', tourIds),
    noTourCounts
      ? Promise.resolve({ count: 0 })
      : supabase
          .from('budget_line_items')
          .select('id', { count: 'exact', head: true })
          .in('tour_id', tourIds),
    // rider_packs reference artist_id directly, so we can scope
    // by artistId — covers tour-scoped + tour-wide packs.
    supabase
      .from('rider_packs')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', artistId),
    noTourCounts
      ? Promise.resolve({ count: 0 })
      : supabase
          .from('deal_memos')
          .select('id', { count: 'exact', head: true })
          .in('tour_id', tourIds),
    noTourCounts
      ? Promise.resolve({ count: 0 })
      : supabase
          .from('flights')
          .select('id', { count: 'exact', head: true })
          .in('tour_id', tourIds),
    noTourCounts
      ? Promise.resolve({ count: 0 })
      : supabase
          .from('hotels')
          .select('id', { count: 'exact', head: true })
          .in('tour_id', tourIds),
    noTourCounts
      ? Promise.resolve({ count: 0 })
      : supabase
          .from('tour_gear')
          .select('id', { count: 'exact', head: true })
          .in('tour_id', tourIds),
  ]);

  return NextResponse.json({
    artist: { id: artist.id, name: artist.name },
    counts: {
      tours: tourIds.length,
      shows: showsRes.count ?? 0,
      budgetRows: budgetRes.count ?? 0,
      riderPacks: riderPacksRes.count ?? 0,
      dealMemos: dealMemosRes.count ?? 0,
      flights: flightsRes.count ?? 0,
      hotels: hotelsRes.count ?? 0,
      gear: gearRes.count ?? 0,
    },
  });
}

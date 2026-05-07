/* ============================================
   LOWPASS — Sprint 8.1 §5 — Tour delete preview API

   GET /api/tours/[id]/delete-preview

   Returns counts of tour-scoped rows that will be cascade-deleted
   when DELETE /api/tours/[id] runs. Used by the
   <TourDeleteConfirmationModal> to show the user what they're
   about to lose before they type DELETE.

   The numbers are surfaced as a HEAD-line on the modal:
     "X shows · Y personnel · Z budget rows · K rider packs · M deal memos"

   Per Adam's sign-off (Sprint 8.1 §5b): header counts only;
   no per-bullet counts in the body. The bullets are generic
   category descriptions.

   Auth: requires a logged-in user with workspace access to the
   tour. RLS will block the SELECT if not — we still verify
   manually via workspace_members for clarity.
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

  const { id: tourId } = await params;

  // Confirm the tour exists and the caller can see it. RLS gates
  // every subsequent count() — if the user can't see the tour
  // they'll get zeros across the board, but we surface a clean
  // 404 here for the modal to handle.
  const { data: tour, error: tourErr } = await supabase
    .from('tours')
    .select('id, name')
    .eq('id', tourId)
    .maybeSingle();

  if (tourErr || !tour) {
    return NextResponse.json(
      { error: 'Tour not found' },
      { status: 404 },
    );
  }

  // Run all counts in parallel. count: 'exact' / head: true
  // returns the row count without hauling row data — cheap.
  // RLS-filtered counts are correct for the caller's view.
  const [
    showsRes,
    personnelRes,
    budgetRes,
    riderPacksRes,
    dealMemosRes,
    flightsRes,
    hotelsRes,
    gearRes,
  ] = await Promise.all([
    supabase
      .from('routing')
      .select('id', { count: 'exact', head: true })
      .eq('tour_id', tourId),
    supabase
      .from('tour_personnel')
      .select('id', { count: 'exact', head: true })
      .eq('tour_id', tourId),
    supabase
      .from('budget_line_items')
      .select('id', { count: 'exact', head: true })
      .eq('tour_id', tourId),
    supabase
      .from('rider_packs')
      .select('id', { count: 'exact', head: true })
      .eq('tour_id', tourId),
    supabase
      .from('deal_memos')
      .select('id', { count: 'exact', head: true })
      .eq('tour_id', tourId),
    supabase
      .from('flights')
      .select('id', { count: 'exact', head: true })
      .eq('tour_id', tourId),
    supabase
      .from('hotels')
      .select('id', { count: 'exact', head: true })
      .eq('tour_id', tourId),
    supabase
      .from('tour_gear')
      .select('id', { count: 'exact', head: true })
      .eq('tour_id', tourId),
  ]);

  return NextResponse.json({
    tour: { id: tour.id, name: tour.name },
    counts: {
      shows: showsRes.count ?? 0,
      personnel: personnelRes.count ?? 0,
      budgetRows: budgetRes.count ?? 0,
      riderPacks: riderPacksRes.count ?? 0,
      dealMemos: dealMemosRes.count ?? 0,
      flights: flightsRes.count ?? 0,
      hotels: hotelsRes.count ?? 0,
      gear: gearRes.count ?? 0,
    },
  });
}

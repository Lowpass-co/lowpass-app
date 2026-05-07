/* ============================================
   LOWPASS — Sprint 8.2 §6 — Tour visit tracker

   POST /api/tours/[id]/touch

   Bumps tours.last_visited_at = now() so the workspace
   landing's Pick Up Where You Left Off card can surface the
   tour the user actually worked on most recently (rather than
   whatever was last written to by any workspace member, which
   was the Sprint 7 §6.2 fallback).

   Called from the per-product layouts on every tour-scoped
   page load (operations, budget, advance — see the
   <TourVisitTracker> client island).

   Workspace-shared scope per Sprint 8.2 §6 sign-off: any
   member's visit bumps the column. A per-user tour_visits
   table can replace this later if per-user precision becomes
   needed.

   No body. Returns 204 on success. RLS guards the UPDATE so
   we don't need an explicit workspace membership check —
   if the user can't see the tour, the UPDATE silently
   matches zero rows.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function POST(
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

  const { id } = await params;

  const { error } = await supabase
    .from('tours')
    .update({ last_visited_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    // Log but don't fail the page. The tracker is best-effort —
    // a 500 here shouldn't block the user from seeing the tour.
    console.error(`[tour-touch ${id}] update failed:`, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}

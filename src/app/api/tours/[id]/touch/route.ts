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
  // Best-effort telemetry: the <TourVisitTracker> island fires this and ignores
  // the result, so this handler must be INCAPABLE of erroring the function —
  // ALWAYS return 204, even on auth failure / DB error / thrown exception. (It
  // was returning 401/500 and, when something inside threw or timed out, the
  // platform surfaced a 503 on every tour load — log noise, never gating the UI.)
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { id } = await params;
      const { error } = await supabase
        .from('tours')
        .update({ last_visited_at: new Date().toISOString() })
        .eq('id', id);
      // RLS scopes the UPDATE; a user who can't see the tour matches zero rows.
      if (error) console.error(`[tour-touch ${id}] update failed:`, error.message);
    }
  } catch (err) {
    console.error('[tour-touch] ping failed (ignored):', err);
  }
  return new NextResponse(null, { status: 204 });
}

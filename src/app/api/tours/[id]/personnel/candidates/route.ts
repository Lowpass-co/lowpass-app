/* ============================================
   GET /api/tours/[id]/personnel/candidates — who the Add crew panel offers
   (Nov 2026, Adam)

   Everyone in the tour's workspace People who isn't on this tour, each with
   their usual role, last tour and whether they've toured with this artist —
   ranked by rankCandidates (src/lib/personnel/crew.ts). The panel loads the
   whole list once and filters as you type (no round trip per keystroke).
   Admin / manager (the same as adding). `canGiveAccess` says whether the
   panel may offer app access (workspace admins only).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getActiveMembership } from '@/lib/permissions/server';
import { getViewerAccess } from '@/lib/permissions/tourAccess';
import { rankCandidates } from '@/lib/personnel/crew';

export const dynamic = 'force-dynamic';

const CAP = 2000;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: tourId } = await params;
  const membership = await getActiveMembership(supabase, user.id);
  if (!membership) {
    return NextResponse.json({ error: 'No active workspace' }, { status: 403 });
  }
  if (!(await getViewerAccess(supabase, user.id, tourId))?.manager) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: tour } = await supabase.from('tours').select('workspace_id, artist_id').eq('id', tourId).maybeSingle();
  if (!tour) return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  const { workspace_id: workspaceId, artist_id: artistId } = tour as { workspace_id: string; artist_id: string | null };

  const [peopleRes, assignRes, toursRes, artistRes] = await Promise.all([
    supabase
      .from('personnel')
      .select('id, name, email, phone, role, user_id')
      .eq('workspace_id', workspaceId)
      .order('name')
      .limit(CAP),
    supabase.from('tour_personnel').select('person_id, tour_id').eq('workspace_id', workspaceId),
    supabase.from('tours').select('id, name, artist_id, start_date').eq('workspace_id', workspaceId),
    artistId ? supabase.from('artists').select('name').eq('id', artistId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (peopleRes.error) return NextResponse.json({ error: peopleRes.error.message }, { status: 500 });

  const people = rankCandidates({
    people: (peopleRes.data ?? []) as Array<{ id: string; name: string; email: string | null; phone: string | null; role: string | null; user_id: string | null }>,
    assignments: (assignRes.data ?? []) as Array<{ person_id: string; tour_id: string }>,
    tours: (toursRes.data ?? []) as Array<{ id: string; name: string | null; artist_id: string | null; start_date: string | null }>,
    tourId,
    artistId,
  });
  return NextResponse.json({
    people,
    artistName: (artistRes.data as { name?: string } | null)?.name ?? null,
    capped: (peopleRes.data ?? []).length >= CAP,
    // App access is admin-only in the database (invites + tour_access RLS).
    canGiveAccess: membership.role === 'admin' && membership.workspace_id === workspaceId,
  });
}

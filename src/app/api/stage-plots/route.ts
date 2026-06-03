/* ============================================
   LOWPASS — Stage Plots API: create (§SP0 wiring)

   POST /api/stage-plots  body: { artist_id, name? }
   Creates an artist-scope rider_pack (kind='stage_plot') + its
   1:1 stage_plots config row. Requires migration 109.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireUserAndWorkspace } from '@/lib/auth/workspace-check';
import { createStagePlot } from '@/lib/stage-plot/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireUserAndWorkspace(supabase);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const artistId = (body as { artist_id?: string }).artist_id;
  if (!artistId) return NextResponse.json({ error: 'artist_id is required' }, { status: 400 });
  // Optional: tour-scope the plot (Operations surface). Omitted → artist scope.
  const tourId = (body as { tour_id?: string }).tour_id || undefined;

  const created = await createStagePlot(
    supabase,
    auth.workspaceId,
    artistId,
    (body as { name?: string }).name || 'Untitled stage plot',
    tourId,
    auth.user.id,
  );
  if ('error' in created) return NextResponse.json({ error: created.error }, { status: 500 });
  return NextResponse.json(created, { status: 201 });
}

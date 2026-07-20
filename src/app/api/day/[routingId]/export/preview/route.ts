/* ============================================
   LOWPASS — POST /api/day/[routingId]/export/preview  (D1-2 · DAY-03)

   Returns { html } for the Day Sheet composer preview — byte-identical to the
   PDF body (same buildDaySheetExport). Body: { config? }. Mirrors the settlement
   export preview (per-show, routingId in the path).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { exportErrorResponse } from '@/lib/export/render';
import { buildDaySheetExport } from '@/lib/export/build';
import { normalizeConfig } from '@/lib/export/template-config';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ routingId: string }> }): Promise<NextResponse> {
  try {
    const { routingId } = await params;
    if (!routingId) return NextResponse.json({ error: 'routingId is required' }, { status: 400 });
    const body = (await request.json().catch(() => ({}))) as { config?: unknown };
    const config = normalizeConfig('daysheet', body.config);

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
    if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

    const { data: routing } = await supabase.from('routing').select('tour_id').eq('id', routingId).maybeSingle();
    if (!routing) return NextResponse.json({ error: 'Show not found' }, { status: 404 });

    const { data: tour } = await supabase
      .from('tours')
      .select('id, name, currency, artist_id, start_date, end_date, workspace_id')
      .eq('id', routing.tour_id)
      .eq('workspace_id', profile.workspace_id)
      .maybeSingle();
    if (!tour) return NextResponse.json({ error: 'Tour not found' }, { status: 404 });

    const { html } = await buildDaySheetExport(
      supabase,
      { id: tour.id as string, name: (tour.name as string) || 'Tour', currency: tour.currency as string | null, start_date: tour.start_date as string | null, end_date: tour.end_date as string | null, artist_id: tour.artist_id as string | null },
      profile.workspace_id as string,
      config,
      routingId,
    );
    return NextResponse.json({ html });
  } catch (err) {
    return exportErrorResponse('daysheet-preview', err);
  }
}

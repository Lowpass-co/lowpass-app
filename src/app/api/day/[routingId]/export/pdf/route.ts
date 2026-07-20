/* ============================================
   LOWPASS — POST /api/day/[routingId]/export/pdf  (D1-2 · DAY-03)

   Streams a branded Day Sheet PDF for one routing row. READ-ONLY; workspace-RLS
   scoped. Body: { config? } (the audience template). Mirrors the settlement PDF
   route (per-show, routingId in the path).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { exportPdfResponse, exportErrorResponse } from '@/lib/export/render';
import { lowpassMarkDataUri } from '@/lib/export/logo';
import { buildDaySheetExport } from '@/lib/export/build';
import { normalizeConfig } from '@/lib/export/template-config';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ routingId: string }> }): Promise<NextResponse | Response> {
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

    return exportPdfResponse('daysheet', async () => {
      const { html, footerNote, filename, footer, runningHeader } = await buildDaySheetExport(
        supabase,
        { id: tour.id as string, name: (tour.name as string) || 'Tour', currency: tour.currency as string | null, start_date: tour.start_date as string | null, end_date: tour.end_date as string | null, artist_id: tour.artist_id as string | null },
        profile.workspace_id as string,
        config,
        routingId,
      );
      const markDataUri = await lowpassMarkDataUri();
      return { html, footerNote, markDataUri, filename, footer, runningHeader };
    });
  } catch (err) {
    return exportErrorResponse('daysheet', err);
  }
}

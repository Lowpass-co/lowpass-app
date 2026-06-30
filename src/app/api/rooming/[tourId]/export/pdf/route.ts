/* ============================================
   LOWPASS — POST /api/rooming/[tourId]/export/pdf  (#8 Document Export)

   Streams a branded hotel rooming-list PDF, driven by the TemplateConfig (P1).
   READ-ONLY, workspace-RLS scoped (rooming is PII — a foreign tour 404s).
   Body: { config?: TemplateConfig }.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { exportPdfResponse, exportErrorResponse } from '@/lib/export/render';
import { lowpassMarkDataUri } from '@/lib/export/logo';
import { buildRoomingExport } from '@/lib/export/build';
import { normalizeConfig } from '@/lib/export/template-config';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tourId: string }> },
): Promise<NextResponse | Response> {
  // TOTAL guard — every step inside the try → always JSON on failure.
  try {
    const { tourId } = await params;
    const body = (await request.json().catch(() => ({}))) as { config?: unknown };
    const config = normalizeConfig('rooming', body.config);

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
    if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

    const { data: tour } = await supabase
      .from('tours')
      .select('id, name, artist_id, start_date, end_date, workspace_id')
      .eq('id', tourId)
      .eq('workspace_id', profile.workspace_id)
      .maybeSingle();
    if (!tour) return NextResponse.json({ error: 'Tour not found' }, { status: 404 });

    return exportPdfResponse('rooming', async () => {
      const { html, footerNote, filename, footer, runningHeader } = await buildRoomingExport(
        supabase,
        { id: tour.id as string, name: (tour.name as string) || 'Tour', start_date: tour.start_date as string | null, end_date: tour.end_date as string | null, artist_id: tour.artist_id as string | null },
        profile.workspace_id as string,
        config,
      );
      const markDataUri = await lowpassMarkDataUri();
      return { html, footerNote, markDataUri, filename, footer, runningHeader };
    });
  } catch (err) {
    return exportErrorResponse('rooming', err);
  }
}

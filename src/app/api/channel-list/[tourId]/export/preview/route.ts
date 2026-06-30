/* ============================================
   LOWPASS — POST /api/channel-list/[tourId]/export/preview  (#8, 5th surface)

   Returns the SAME document HTML the PDF route prints (buildChannelListExport), as
   { html } — NO puppeteer — for the editor's live <iframe srcDoc> preview.
   READ-ONLY, workspace-RLS scoped. Body: { config?: TemplateConfig }.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { exportErrorResponse } from '@/lib/export/render';
import { buildChannelListExport } from '@/lib/export/build';
import { normalizeConfig } from '@/lib/export/template-config';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tourId: string }> },
): Promise<NextResponse> {
  try {
    const { tourId } = await params;
    const body = (await request.json().catch(() => ({}))) as { config?: unknown };
    const config = normalizeConfig('channel-list', body.config);

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
    if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

    const { data: tour } = await supabase
      .from('tours')
      .select('id, name, artist_id, workspace_id')
      .eq('id', tourId)
      .eq('workspace_id', profile.workspace_id)
      .maybeSingle();
    if (!tour) return NextResponse.json({ error: 'Tour not found' }, { status: 404 });

    const { html } = await buildChannelListExport(
      supabase,
      { id: tour.id as string, name: (tour.name as string) || 'Tour', artist_id: tour.artist_id as string | null },
      profile.workspace_id as string,
      config,
    );
    return NextResponse.json({ html });
  } catch (err) {
    return exportErrorResponse('channel-list-preview', err);
  }
}

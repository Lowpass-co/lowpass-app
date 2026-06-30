/* ============================================
   LOWPASS — POST /api/budget/[tourId]/export/preview  (#8 Template Builder P1)

   Returns the SAME document HTML the PDF route prints (buildBudgetExport), as
   { html } — NO puppeteer. The editor renders this in an <iframe srcDoc> so the
   live preview is byte-identical to the downloaded PDF (WYSIWYG by construction).
   READ-ONLY, workspace-RLS scoped. Body: { config?: TemplateConfig, versionId? }.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { exportErrorResponse } from '@/lib/export/render';
import { buildBudgetExport } from '@/lib/export/build';
import { normalizeConfig, type BudgetScope } from '@/lib/export/template-config';

export const dynamic = 'force-dynamic';

const SCOPES: BudgetScope[] = ['projected', 'actual', 'both'];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tourId: string }> },
): Promise<NextResponse> {
  try {
    const { tourId } = await params;
    const url = new URL(request.url);
    const body = (await request.json().catch(() => ({}))) as { config?: unknown; versionId?: string | null };

    const config = normalizeConfig('budget', body.config);
    const scopeParam = url.searchParams.get('scope');
    if (!body.config && scopeParam && SCOPES.includes(scopeParam as BudgetScope)) config.scope = scopeParam as BudgetScope;
    const versionId = body.versionId ?? url.searchParams.get('version');

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
    if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

    const { data: tour } = await supabase
      .from('tours')
      .select('id, name, currency, artist_id, start_date, end_date, workspace_id')
      .eq('id', tourId)
      .eq('workspace_id', profile.workspace_id)
      .maybeSingle();
    if (!tour) return NextResponse.json({ error: 'Tour not found' }, { status: 404 });

    const { html } = await buildBudgetExport(
      supabase,
      { id: tour.id as string, name: (tour.name as string) || 'Tour', currency: tour.currency as string | null, start_date: tour.start_date as string | null, end_date: tour.end_date as string | null, artist_id: tour.artist_id as string | null },
      profile.workspace_id as string,
      config,
      versionId,
    );
    return NextResponse.json({ html });
  } catch (err) {
    return exportErrorResponse('budget-preview', err);
  }
}

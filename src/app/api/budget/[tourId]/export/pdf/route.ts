/* ============================================
   LOWPASS — POST /api/budget/[tourId]/export/pdf  (#8 Document Export)

   Streams a branded Budget PDF. READ-ONLY: loads the tour's budget (workspace-RLS
   scoped — a foreign-workspace tour 404s), renders the shared shell + budget body
   driven by the TemplateConfig (P1), and prints via the existing puppeteer pipeline.

   Body: { config?: TemplateConfig, versionId?: string }. Back-compat: ?scope= and
   ?version= query params still work (→ folded into the config). Per-export config
   in P1 (no persistence yet).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { exportPdfResponse, exportErrorResponse } from '@/lib/export/render';
import { lowpassMarkDataUri } from '@/lib/export/logo';
import { buildBudgetExport } from '@/lib/export/build';
import { normalizeConfig, type BudgetScope } from '@/lib/export/template-config';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SCOPES: BudgetScope[] = ['projected', 'actual', 'both'];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tourId: string }> },
): Promise<NextResponse | Response> {
  // TOTAL guard — auth, params, RLS, loaders, build, render all inside this try, so
  // a failing export ALWAYS returns JSON { error, detail, stack }, never a bare 500.
  try {
    const { tourId } = await params;
    const url = new URL(request.url);
    const body = (await request.json().catch(() => ({}))) as { config?: unknown; versionId?: string | null };

    const config = normalizeConfig('budget', body.config);
    // Back-compat: ?scope= query overrides when no config body provided one.
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

    return exportPdfResponse('budget', async () => {
      const { html, footerNote, filename, footer } = await buildBudgetExport(
        supabase,
        { id: tour.id as string, name: (tour.name as string) || 'Tour', currency: tour.currency as string | null, start_date: tour.start_date as string | null, end_date: tour.end_date as string | null, artist_id: tour.artist_id as string | null },
        profile.workspace_id as string,
        config,
        versionId,
      );
      const markDataUri = await lowpassMarkDataUri();
      return { html, footerNote, markDataUri, filename, footer };
    });
  } catch (err) {
    return exportErrorResponse('budget', err);
  }
}

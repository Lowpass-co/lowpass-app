/* ============================================
   LOWPASS — POST /api/stage-plots/[id]/export/pdf  (#8 Document Export, 6th)

   Streams a branded Stage-plot PDF (the reconstructed diagram, optionally + the
   paired input list). READ-ONLY, workspace-RLS scoped (loadStagePlot 404s a foreign
   plot). Keyed on plotId (NOT tourId — a plot lives in the artist library / a rider
   pack). Body: { config?: TemplateConfig }.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireUserAndWorkspace } from '@/lib/auth/workspace-check';
import { exportPdfResponse, exportErrorResponse } from '@/lib/export/render';
import { lowpassMarkDataUri } from '@/lib/export/logo';
import { buildStagePlotExport } from '@/lib/export/build';
import { normalizeConfig } from '@/lib/export/template-config';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse | Response> {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { config?: unknown };
    const config = normalizeConfig('stage-plot', body.config);

    const supabase = await createServerSupabaseClient();
    const auth = await requireUserAndWorkspace(supabase);
    if ('error' in auth) return auth.error;

    return exportPdfResponse('stage-plot', async () => {
      const { html, footerNote, filename, footer, runningHeader } = await buildStagePlotExport(
        supabase,
        id,
        auth.workspaceId,
        config,
      );
      const markDataUri = await lowpassMarkDataUri();
      return { html, footerNote, markDataUri, filename, footer, runningHeader };
    });
  } catch (err) {
    return exportErrorResponse('stage-plot', err);
  }
}

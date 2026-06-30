/* ============================================
   LOWPASS — POST /api/stage-plots/[id]/export/preview  (#8, 6th surface)

   Returns the SAME document HTML the PDF route prints (buildStagePlotExport), as
   { html } — NO puppeteer — for the editor's live <iframe srcDoc> preview.
   READ-ONLY, workspace-RLS scoped. Body: { config?: TemplateConfig }.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireUserAndWorkspace } from '@/lib/auth/workspace-check';
import { exportErrorResponse } from '@/lib/export/render';
import { buildStagePlotExport } from '@/lib/export/build';
import { normalizeConfig } from '@/lib/export/template-config';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { config?: unknown };
    const config = normalizeConfig('stage-plot', body.config);

    const supabase = await createServerSupabaseClient();
    const auth = await requireUserAndWorkspace(supabase);
    if ('error' in auth) return auth.error;

    const { html } = await buildStagePlotExport(supabase, id, auth.workspaceId, config);
    return NextResponse.json({ html });
  } catch (err) {
    return exportErrorResponse('stage-plot-preview', err);
  }
}

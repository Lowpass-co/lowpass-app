/* ============================================
   LOWPASS — POST /api/gear/export/manifest/pdf  (S1 D-1)

   Streams the internal gear manifest: space -> container -> item, with
   weight subtotals rolling up to a grand total.

   READ-ONLY. Writes nothing; POST only because the body carries the
   TemplateConfig and the scope selector. Authorization is the READ check
   below: an authenticated session, then every row is loaded .eq(workspace_id,
   profile.workspace_id), so a foreign workspace yields nothing. Deliberately
   NOT requireWrite — that would refuse a readonly member a document they are
   entitled to read (fourth ratchet category).

   Body: { config?: TemplateConfig, scope?: { kind, spaceId?, tourId? } }.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { exportPdfResponse, exportErrorResponse } from '@/lib/export/render';
import { buildGearManifestExport } from '@/lib/export/build';
import { normalizeConfig } from '@/lib/export/template-config';
import { lowpassMarkDataUri } from '@/lib/export/logo';
import type { GearExportScope } from '@/lib/export/gear-data';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Caller-supplied scope is narrowed here — an unrecognised shape falls back to
 *  the whole workspace rather than throwing, and every branch is still
 *  workspace-scoped by the loader. */
function readScope(raw: unknown): GearExportScope {
  const s = raw as { kind?: unknown; spaceId?: unknown; tourId?: unknown } | null;
  if (s && s.kind === 'space' && typeof s.spaceId === 'string') return { kind: 'space', spaceId: s.spaceId };
  if (s && s.kind === 'tour' && typeof s.tourId === 'string') return { kind: 'tour', tourId: s.tourId };
  return { kind: 'workspace' };
}

export async function POST(request: Request): Promise<NextResponse | Response> {
  // TOTAL guard — every step inside the try → always JSON on failure.
  try {
    const body = (await request.json().catch(() => ({}))) as { config?: unknown; scope?: unknown };
    const config = normalizeConfig('gear-manifest', body.config);
    const scope = readScope(body.scope);

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
    if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

    return exportPdfResponse('gear-manifest', async () => {
      const { html, footerNote, filename, footer, runningHeader } = await buildGearManifestExport(
        supabase,
        profile.workspace_id as string,
        scope,
        config,
      );
      const markDataUri = await lowpassMarkDataUri();
      return { html, footerNote, markDataUri, filename, footer, runningHeader };
    });
  } catch (err) {
    return exportErrorResponse('gear-manifest', err);
  }
}

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

/** D1-L4 — THIS USED TO FAIL OPEN. Anything unrecognised returned
 *  {kind:'workspace'}, so a typo'd, stale or future scope kind silently
 *  produced THE LARGEST POSSIBLE DOCUMENT — every item in the workspace when
 *  the caller asked for one space. No exception, no log line, and the wrong
 *  answer is the plausible-looking one. Workspace scope is now only what the
 *  caller explicitly asked for, or an omitted scope; anything else is a 400
 *  naming the offending value. */
function readScope(raw: unknown): GearExportScope | { error: string } {
  if (raw == null) return { kind: 'workspace' };
  if (typeof raw !== 'object') return { error: `scope must be an object, got ${typeof raw}` };
  const s = raw as { kind?: unknown; spaceId?: unknown; tourId?: unknown };
  if (s.kind === 'workspace') return { kind: 'workspace' };
  if (s.kind === 'space') {
    return typeof s.spaceId === 'string' && s.spaceId
      ? { kind: 'space', spaceId: s.spaceId }
      : { error: 'scope.kind "space" requires a spaceId' };
  }
  if (s.kind === 'tour') {
    return typeof s.tourId === 'string' && s.tourId
      ? { kind: 'tour', tourId: s.tourId }
      : { error: 'scope.kind "tour" requires a tourId' };
  }
  return { error: `unknown scope.kind ${JSON.stringify(s.kind)}` };
}

export async function POST(request: Request): Promise<NextResponse | Response> {
  // TOTAL guard — every step inside the try → always JSON on failure.
  try {
    const body = (await request.json().catch(() => ({}))) as { config?: unknown; scope?: unknown };
    const config = normalizeConfig('gear-manifest', body.config);
    const scope = readScope(body.scope);
    if ('error' in scope) return NextResponse.json({ error: scope.error }, { status: 400 });

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

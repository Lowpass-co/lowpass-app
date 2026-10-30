/* ============================================
   The advance export routes (Oct 2026) — one show's filled advance
   ('sheet') and the venue question sheet ('questions'), each with a live
   preview (HTML for the editor's iframe) and the PDF.

   Read-only POSTs: the body carries only the presentation config (and, for
   the question sheet, which request it belongs to). Tenancy: signed-in member
   of a workspace, the tour must be in it (tourGate), and every read below is
   the caller's own RLS-scoped client — a show outside the tour 404s.
   ============================================ */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireUserAndWorkspace } from '@/lib/auth/workspace-check';
import { exportErrorResponse, exportPdfResponse } from '@/lib/export/render';
import { lowpassMarkDataUri } from '@/lib/export/logo';
import { buildAdvanceExport, buildAdvanceQuestionsExport } from '@/lib/export/build';
import { normalizeConfig } from '@/lib/export/template-config';
import { tourGate } from './routeGuard';

type Kind = 'sheet' | 'questions';
type Params = { params: Promise<{ id: string; routingId: string }> };

// An id, not a URL or anything else (it only selects a row, scoped to this show).
const ID = /^[\w-]{1,64}$/;

async function build(request: Request, { params }: Params, kind: Kind) {
  const { id: tourId, routingId } = await params;
  const body = (await request.json().catch(() => ({}))) as { config?: unknown; linkId?: unknown };
  const config = normalizeConfig(kind === 'sheet' ? 'advance' : 'advance-questions', body.config);
  const supabase = await createServerSupabaseClient();
  const auth = await requireUserAndWorkspace(supabase);
  if ('error' in auth) return { error: auth.error };
  const gate = await tourGate(supabase, tourId, auth.workspaceId);
  if (gate) return { error: gate };
  const client = supabase as unknown as SupabaseClient;
  const linkId = typeof body.linkId === 'string' && ID.test(body.linkId) ? body.linkId : null;
  const doc =
    kind === 'sheet'
      ? await buildAdvanceExport(client, tourId, routingId, auth.workspaceId, config)
      : await buildAdvanceQuestionsExport(client, tourId, routingId, auth.workspaceId, config, { linkId, origin: new URL(request.url).origin });
  if (!doc) return { error: NextResponse.json({ error: 'Show not found' }, { status: 404 }) };
  return { doc };
}

export async function advanceExportPreview(request: Request, ctx: Params, kind: Kind): Promise<NextResponse> {
  try {
    const r = await build(request, ctx, kind);
    if ('error' in r) return r.error as NextResponse;
    return NextResponse.json({ html: r.doc.html });
  } catch (err) {
    return exportErrorResponse(`advance-${kind}-preview`, err);
  }
}

export async function advanceExportPdf(request: Request, ctx: Params, kind: Kind): Promise<Response> {
  try {
    const r = await build(request, ctx, kind);
    if ('error' in r) return r.error as NextResponse;
    const doc = r.doc;
    return exportPdfResponse(`advance-${kind}`, async () => ({ ...doc, markDataUri: await lowpassMarkDataUri() }));
  } catch (err) {
    return exportErrorResponse(`advance-${kind}`, err);
  }
}

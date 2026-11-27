/* ============================================
   POST /api/tours/[id]/advance/[routingId]/files — upload questions (Nov 2026)

     { action: 'urls', paths }               signed links for this show's files
                                             — Advance VIEW
     { action: 'upload-url', type, size }    a one-time upload into the show's
                                             own folder (storage grant, 282)
     { action: 'complete', path, name }      the bytes are there and ARE a PDF
                                             or an image → the answer to save
                                             — the last two: Advance EDIT
   The answer itself is saved through /answers like any other (which keeps
   only paths inside this show's folder — lib/advance/fileAnswers.ts).
   ============================================ */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server';
import { requireUserAndWorkspace, requireWrite } from '@/lib/auth/workspace-check';
import { getViewerAccess, viewerAllows } from '@/lib/permissions/tourAccess';
import { readJson, tourGate } from '@/server/advance/routeGuard';
import { finishAdvanceUpload, signAdvanceFiles, startAdvanceUpload, type ShowKey } from '@/server/advance/files';
import { uploadErrorResponse } from '@/server/uploads/uploadResponse';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; routingId: string }> };

async function showInTour(service: SupabaseClient, tourId: string, routingId: string): Promise<boolean> {
  const { data } = await service.from('routing').select('id').eq('id', routingId).eq('tour_id', tourId).maybeSingle();
  return !!data;
}

export async function POST(request: Request, { params }: Params) {
  const { id: tourId, routingId } = await params;
  const supabase = await createServerSupabaseClient();
  const body = (await readJson<Record<string, unknown>>(request)) ?? {};
  const service = createServiceSupabaseClient() as unknown as SupabaseClient;

  if (body.action === 'urls') {
    const auth = await requireUserAndWorkspace(supabase);
    if ('error' in auth) return auth.error;
    const gate = await tourGate(supabase, tourId, auth.workspaceId);
    if (gate) return gate;
    const access = await getViewerAccess(supabase as unknown as SupabaseClient, auth.user.id, tourId);
    if (!viewerAllows(access, 'advance', 'view')) return NextResponse.json({ error: 'You can’t see this tour’s advance.' }, { status: 403 });
    if (!(await showInTour(service, tourId, routingId))) return NextResponse.json({ error: 'Show not found' }, { status: 404 });
    const show: ShowKey = { ws: auth.workspaceId, tourId, routingId };
    const paths = Array.isArray(body.paths) ? body.paths : [];
    return NextResponse.json({ urls: await signAdvanceFiles(service, show, paths) }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const auth = await requireWrite(supabase, { area: 'advance', tourId });
  if ('error' in auth) return auth.error;
  const gate = await tourGate(supabase, tourId, auth.workspaceId);
  if (gate) return gate;
  if (!(await showInTour(service, tourId, routingId))) return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  const show: ShowKey = { ws: auth.workspaceId, tourId, routingId };

  try {
    if (body.action === 'upload-url') {
      const grant = await startAdvanceUpload(service, show, { type: body.type, size: body.size, userId: auth.user.id });
      return NextResponse.json(grant, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (body.action === 'complete') {
      const file = await finishAdvanceUpload(service, show, { path: body.path, name: body.name });
      const urls = await signAdvanceFiles(service, show, [file.path]);
      return NextResponse.json({ file, url: urls[file.path] ?? null });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return uploadErrorResponse(e);
  }
}

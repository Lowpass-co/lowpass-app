/* ============================================
   POST /api/public/advance-intake/[token]/files — a venue's uploads for an
   upload question on its advance form (Nov 2026, Adam: lighting patch).

     { action: 'upload-url', type, size }  a one-time upload into THIS show's
                                           folder — the server picks the path
     { action: 'complete', path, name }    bytes checked (PDF / image) → the
                                           answer + a 10-minute link
     { action: 'urls', paths }             links for files this link already
                                           submitted (nothing else)
   Token-gated, service role, scoped to the link's show. Live links only;
   40 uploads per show per hour (issued grants).
   ============================================ */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import { parseFileAnswer } from '@/lib/advance/fileAnswers';
import { finishAdvanceUpload, signAdvanceFiles, startAdvanceUpload, VENUE_UPLOADS_PER_HOUR, venueUploadsLastHour, type ShowKey } from '@/server/advance/files';
import { uploadErrorResponse } from '@/server/uploads/uploadResponse';

export const dynamic = 'force-dynamic';

interface LinkRow {
  workspace_id: string;
  tour_id: string;
  routing_id: string;
  status: string;
  expires_at: string | null;
  revoked_at: string | null;
  submitted_data: Record<string, Record<string, unknown>> | null;
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length > 200) return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  const service = createServiceSupabaseClient() as unknown as SupabaseClient;
  const { data } = await service
    .from('advance_intake_links')
    .select('workspace_id, tour_id, routing_id, status, expires_at, revoked_at, submitted_data')
    .eq('token', token)
    .maybeSingle();
  const link = data as LinkRow | null;
  if (!link || link.revoked_at || link.status === 'revoked') return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) return NextResponse.json({ error: 'This link has expired.' }, { status: 410 });

  const show: ShowKey = { ws: link.workspace_id, tourId: link.tour_id, routingId: link.routing_id };
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    if (body.action === 'urls') {
      const own = new Set<string>();
      for (const fields of Object.values(link.submitted_data ?? {})) {
        for (const v of Object.values(fields ?? {})) for (const f of parseFileAnswer(v, show.ws, show.tourId, show.routingId)) own.add(f.path);
      }
      const asked = (Array.isArray(body.paths) ? body.paths : []).filter((p): p is string => typeof p === 'string' && own.has(p));
      return NextResponse.json({ urls: await signAdvanceFiles(service, show, asked) }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (body.action === 'upload-url') {
      if ((await venueUploadsLastHour(service, show)) >= VENUE_UPLOADS_PER_HOUR) {
        return NextResponse.json({ error: 'Too many uploads for this show in the last hour — try again later.' }, { status: 429 });
      }
      const grant = await startAdvanceUpload(service, show, { type: body.type, size: body.size, userId: null });
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

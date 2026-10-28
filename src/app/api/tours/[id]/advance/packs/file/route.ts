/* GET /api/tours/[id]/advance/packs/file?path=… | ?doc=<advance_documents id>
   A short-lived signed URL so the browser can render a pack (and highlight
   where an answer came from). Paths are fenced to this workspace + tour;
   documents are read through RLS first. */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server';
import { requireUserAndWorkspace } from '@/lib/auth/workspace-check';
import { PACK_BUCKET, isOwnPackPath } from '@/server/advance/packReader';
import { tourGate } from '@/server/advance/routeGuard';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireUserAndWorkspace(supabase);
  if ('error' in auth) return auth.error;
  const gate = await tourGate(supabase, tourId, auth.workspaceId);
  if (gate) return gate;
  const url = new URL(request.url);
  let path = url.searchParams.get('path');
  const doc = url.searchParams.get('doc');
  if (doc) {
    const { data } = await (supabase as unknown as SupabaseClient)
      .from('advance_documents')
      .select('storage_path, tour_id')
      .eq('id', doc)
      .maybeSingle<{ storage_path: string; tour_id: string }>();
    if (!data || data.tour_id !== tourId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    path = data.storage_path;
  }
  if (!isOwnPackPath(path, auth.workspaceId, tourId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data, error } = await createServiceSupabaseClient().storage.from(PACK_BUCKET).createSignedUrl(path, 60 * 60);
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ url: data.signedUrl });
}

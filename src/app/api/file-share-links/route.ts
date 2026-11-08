/* ============================================
   /api/file-share-links — the owner's side of file & folder links

     GET   ?tourId=…&fileId=…  |  ?tourId=…&folder=…  → { links, events }
     POST  { tourId, fileId | folder, access, expiresAt?, password?, label? } → { link }
     PATCH { id, revoke: true } → { ok }

   READ CHECK (GET): session + active membership; scoped to that workspace.
   WRITES: requireWrite with the Files resource — the same gate as the Files
   page. Password hashes never leave the server.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { getActiveMembership } from '@/lib/permissions/server';
import { parseCreate, sanitizeFolder } from '@/lib/files/shareLinks';
import { createLink, listLinks, revokeLink } from '@/server/files/shareLinks';
import { NO_STORE, readJson, shareErrorResponse, str } from '@/server/files/shareResponse';

const RESOURCE = 'operations.files';

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const m = await getActiveMembership(supabase, user.id);
  if (!m) return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  const u = new URL(request.url);
  const tourId = u.searchParams.get('tourId');
  if (!tourId) return NextResponse.json({ error: 'tourId is required' }, { status: 400 });
  try {
    const out = await listLinks(supabase, {
      workspaceId: m.workspace_id,
      tourId,
      fileId: u.searchParams.get('fileId'),
      folder: sanitizeFolder(u.searchParams.get('folder')),
    });
    return NextResponse.json(out, { headers: NO_STORE });
  } catch (e) {
    return shareErrorResponse(e);
  }
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase, { resource: RESOURCE });
  if ('error' in auth) return auth.error;
  const parsed = parseCreate(await readJson(request));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const link = await createLink(supabase, { workspaceId: auth.workspaceId, userId: auth.user.id, input: parsed.value });
    return NextResponse.json({ link }, { headers: NO_STORE });
  } catch (e) {
    return shareErrorResponse(e);
  }
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase, { resource: RESOURCE });
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  const id = str(body.id);
  if (!id || body.revoke !== true) return NextResponse.json({ error: 'Send { id, revoke: true }' }, { status: 400 });
  try {
    await revokeLink(supabase, { workspaceId: auth.workspaceId, id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return shareErrorResponse(e);
  }
}

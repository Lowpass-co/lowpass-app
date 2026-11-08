/* ============================================
   POST /api/file-share-links/repoint   { tourId, from, to } → { moved }

   Called by the Files canvas right after it renames a folder, so folder links
   (and links to its subfolders) follow the rename instead of going empty.
   WRITE: requireWrite with the Files resource; scoped to the caller's workspace.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { sanitizeFolder } from '@/lib/files/shareLinks';
import { repointFolderLinks } from '@/server/files/shareLinks';
import { readJson, shareErrorResponse, str } from '@/server/files/shareResponse';

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase, { resource: 'operations.files' });
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  const tourId = str(body.tourId);
  const from = sanitizeFolder(body.from);
  const to = sanitizeFolder(body.to);
  if (!tourId || !from || !to) return NextResponse.json({ error: 'Send { tourId, from, to }' }, { status: 400 });
  try {
    const moved = await repointFolderLinks(supabase, { workspaceId: auth.workspaceId, tourId, from, to });
    return NextResponse.json({ moved });
  } catch (e) {
    return shareErrorResponse(e);
  }
}

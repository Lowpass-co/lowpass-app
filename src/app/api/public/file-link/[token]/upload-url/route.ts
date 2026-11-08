/* ============================================
   POST /api/public/file-link/[token]/upload-url
   body: { password?, name, file: { name, size }, folder?, replaceFileId? }
   → { path, token, bucket }

   PUBLIC — EDIT links only. Token (+ password) is the grant. Step 1 of an
   upload through a link: prepareLinkUpload() checks access, scope, name,
   100 MB and the hourly cap (counted from issued grants), then issues a
   one-time signed upload for a path the server chose. The browser uploads
   straight to Storage, then calls ./complete.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import { openLink, prepareLinkUpload } from '@/server/files/shareLinks';
import { supabaseGrantStorage } from '@/server/uploads/grants';
import { NO_STORE, readJson, shareErrorResponse, str } from '@/server/files/shareResponse';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await readJson(request);
  const file = (body.file && typeof body.file === 'object' ? body.file : {}) as Record<string, unknown>;
  try {
    const service = createServiceSupabaseClient();
    const link = await openLink(service, token, str(body.password));
    const grant = await prepareLinkUpload(service, supabaseGrantStorage(service), link, {
      fileName: file.name,
      size: file.size,
      actor: body.name,
      folder: body.folder,
      replaceFileId: str(body.replaceFileId),
    });
    return NextResponse.json(grant, { headers: NO_STORE });
  } catch (e) {
    return shareErrorResponse(e);
  }
}

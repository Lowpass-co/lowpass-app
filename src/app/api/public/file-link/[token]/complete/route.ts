/* ============================================
   POST /api/public/file-link/[token]/complete
   body: { password?, name, path, fileName, folder?, replaceFileId? }
   → { action: 'upload' | 'new_version', file }

   PUBLIC — EDIT links only. Token (+ password) is the grant. Step 2:
   completeLinkUpload() accepts only a path granted to THIS link, reads the
   real size/type from Storage, then records the new file (or new version,
   old one kept) and logs it. Never renames, moves or deletes.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import { completeLinkUpload, openLink } from '@/server/files/shareLinks';
import { supabaseGrantStorage } from '@/server/uploads/grants';
import { NO_STORE, readJson, shareErrorResponse, str } from '@/server/files/shareResponse';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await readJson(request);
  try {
    const service = createServiceSupabaseClient();
    const link = await openLink(service, token, str(body.password));
    const result = await completeLinkUpload(service, supabaseGrantStorage(service), link, {
      path: body.path,
      fileName: body.fileName,
      actor: body.name,
      folder: body.folder,
      replaceFileId: str(body.replaceFileId),
    });
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (e) {
    return shareErrorResponse(e);
  }
}

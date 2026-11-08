/* ============================================
   POST /api/public/file-link/[token]/upload
   multipart: { file, name, password?, folder?, replaceFileId? }
   → { action: 'upload' | 'new_version', file }

   PUBLIC — EDIT links only. The token (+ password) is the grant; the link's
   access, scope, 25MB cap and hourly upload cap are all enforced in
   uploadViaLink(). Never renames, moves or deletes anything.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import { SHARE_MAX_BYTES } from '@/lib/files/shareLinks';
import { openLink, supabaseShareStorage, uploadViaLink } from '@/server/files/shareLinks';
import { NO_STORE, shareErrorResponse, str } from '@/server/files/shareResponse';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Refuse an oversized body before reading it into memory.
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > SHARE_MAX_BYTES + 64 * 1024) {
    return NextResponse.json({ error: 'That file is over 25MB.', code: 'too_large' }, { status: 413, headers: NO_STORE });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'No file received.', code: 'bad_request' }, { status: 400, headers: NO_STORE });
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file received.', code: 'bad_request' }, { status: 400, headers: NO_STORE });
  }
  try {
    const service = createServiceSupabaseClient();
    const link = await openLink(service, token, str(form.get('password')));
    const result = await uploadViaLink(service, supabaseShareStorage(service), link, {
      fileName: file.name,
      contentType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
      actor: form.get('name'),
      folder: form.get('folder'),
      replaceFileId: str(form.get('replaceFileId')),
    });
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (e) {
    return shareErrorResponse(e);
  }
}

/* ============================================
   POST /api/files/upload-url   { scope: 'tour'|'artist', scopeId, name, size }
   → { path, token, bucket }

   Step 1 of a Files upload. The browser then uploads straight to Storage
   (resumable above 6 MB) and calls /api/files/complete. Checks: write access;
   the tour/artist is in the caller's workspace; size ≤ 100 MB. The server
   picks the path; the grant is recorded (migration 282) so an unfinished
   upload is swept and the finish step only accepts this path.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { FILE_SCOPES, startFileUpload, type FileScope } from '@/server/files/ownerUpload';
import { supabaseGrantStorage } from '@/server/uploads/grants';
import { NO_STORE, uploadErrorResponse } from '@/server/uploads/uploadResponse';
import { readJson, str } from '@/server/files/shareResponse';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  const scope = str(body.scope) as FileScope | null;
  const scopeId = str(body.scopeId);
  if (!scope || !FILE_SCOPES.includes(scope) || !scopeId) {
    return NextResponse.json({ error: 'Send { scope: tour|artist, scopeId, name, size }' }, { status: 400 });
  }
  try {
    const service = createServiceSupabaseClient();
    const grant = await startFileUpload(supabase, service, supabaseGrantStorage(service), {
      workspaceId: auth.workspaceId,
      userId: auth.user.id,
      scope,
      scopeId,
      name: body.name,
      size: body.size,
    });
    return NextResponse.json(grant, { headers: NO_STORE });
  } catch (e) {
    return uploadErrorResponse(e);
  }
}

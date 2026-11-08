/* ============================================
   POST /api/files/complete   { scope, scopeId, path, name, folder? } → { file }

   Step 2 of a Files upload: the object at `path` exists (size/type read from
   Storage, not the browser), the path is one this workspace was granted in
   this scope, and the file row is recorded exactly once (a retried finish
   returns the same file). Write access required.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { TOUR_FILES_BUCKET } from '@/lib/uploads/limits';
import { completeFileUpload, FILE_SCOPES, type FileScope } from '@/server/files/ownerUpload';
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
    return NextResponse.json({ error: 'Send { scope: tour|artist, scopeId, path, name }' }, { status: 400 });
  }
  try {
    const service = createServiceSupabaseClient();
    const r = await completeFileUpload(supabase, service, supabaseGrantStorage(service), {
      workspaceId: auth.workspaceId,
      scope,
      scopeId,
      path: body.path,
      name: body.name,
      folder: body.folder,
    });
    // Shape mirrors FileVm so the canvas can prepend it without a refetch.
    return NextResponse.json(
      {
        file: {
          id: `ref:${r.id}`,
          source: 'other',
          filename: r.file_name,
          mimeType: r.file_type,
          size: r.file_size,
          uploadedAt: r.created_at,
          uploadedByName: null,
          showId: null,
          personId: null,
          riderPackId: null,
          storageBucket: TOUR_FILES_BUCKET,
          storagePath: r.provider_file_id,
          externalUrl: null,
          previewUrl: null,
          linkedSummary: r.linked_to_type === 'artist' ? 'Artist file' : 'Tour file',
          linkedHref: null,
        },
      },
      { headers: NO_STORE },
    );
  } catch (e) {
    return uploadErrorResponse(e);
  }
}

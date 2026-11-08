/* ============================================
   LOWPASS — Files uploads, owner side (Nov 2026)

   Tour / artist Files upload straight to Storage:
     startFileUpload     the scope (tour or artist) is in YOUR workspace; the
                         app picks the path and issues a one-time signed upload
     completeFileUpload  the path is one we granted, in that scope; size and type
                         are read from Storage; the file row is recorded once
   Replaces the old multipart POST /api/files, which went through a Vercel
   function and so could never take more than ~4.5 MB.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { cleanFileName, isScopePath, sanitizeFolder, storagePath } from '@/lib/files/shareLinks';
import { TOUR_FILES_BUCKET } from '@/lib/uploads/limits';
import { completeGrant, issueGrant, UploadError, type Grant, type GrantStorage } from '@/server/uploads/grants';

export type FileScope = 'tour' | 'artist';
export const FILE_SCOPES: readonly FileScope[] = ['tour', 'artist'];

const REF_COLS = 'id, file_name, file_type, file_size, storage_provider, provider_file_id, linked_to_type, linked_to_id, created_at';

async function assertScope(client: SupabaseClient, workspaceId: string, scope: FileScope, scopeId: string): Promise<void> {
  const table = scope === 'tour' ? 'tours' : 'artists';
  const { data } = await client.from(table).select('id').eq('id', scopeId).eq('workspace_id', workspaceId).maybeSingle();
  if (!data) throw new UploadError(404, 'not_found', scope === 'tour' ? 'Tour not found.' : 'Artist not found.');
}

export async function startFileUpload(
  session: SupabaseClient,
  service: SupabaseClient,
  storage: GrantStorage,
  args: { workspaceId: string; userId: string; scope: FileScope; scopeId: string; name: unknown; size: unknown; now?: Date },
): Promise<Grant> {
  await assertScope(session, args.workspaceId, args.scope, args.scopeId);
  const size = typeof args.size === 'number' ? args.size : NaN;
  return issueGrant(service, storage, {
    workspaceId: args.workspaceId,
    bucket: TOUR_FILES_BUCKET,
    path: storagePath(args.workspaceId, args.scopeId, cleanFileName(args.name), (args.now ?? new Date()).getTime(), args.scope),
    declaredSize: size,
    userId: args.userId,
    now: args.now,
  });
}

export interface UploadedRef {
  id: string;
  file_name: string;
  file_type: string | null;
  file_size: number;
  provider_file_id: string;
  linked_to_type: string;
  created_at: string;
}

export async function completeFileUpload(
  session: SupabaseClient,
  service: SupabaseClient,
  storage: GrantStorage,
  args: { workspaceId: string; scope: FileScope; scopeId: string; path: unknown; name: unknown; folder?: unknown; now?: Date },
): Promise<UploadedRef> {
  if (!isScopePath(args.path, args.workspaceId, args.scope, args.scopeId)) throw new UploadError(400, 'bad_request', 'That upload isn’t from here.');
  const path = args.path;
  await assertScope(session, args.workspaceId, args.scope, args.scopeId);
  const done = await completeGrant(service, storage, { workspaceId: args.workspaceId, path, now: args.now });

  if (done.alreadyDone) {
    const { data } = await session.from('file_references').select(REF_COLS).eq('workspace_id', args.workspaceId).eq('provider_file_id', path).maybeSingle();
    if (!data) throw new UploadError(409, 'conflict', 'This upload is still being saved. Refresh in a moment.');
    return data as UploadedRef;
  }

  const folder = sanitizeFolder(args.folder);
  const { data: ref, error } = await session
    .from('file_references')
    .insert({
      workspace_id: args.workspaceId,
      file_name: cleanFileName(args.name),
      file_type: done.contentType,
      file_size: done.size,
      storage_provider: TOUR_FILES_BUCKET,
      provider_file_id: path,
      linked_to_type: args.scope,
      linked_to_id: args.scopeId,
      ...(folder ? { metadata: { folder } } : {}),
    })
    .select(REF_COLS)
    .single();
  if (error || !ref) {
    // Don't leave an object nobody can see.
    await storage.remove(TOUR_FILES_BUCKET, [path]);
    throw new UploadError(500, 'error', error?.message ?? 'Couldn’t record the file.');
  }
  return ref as UploadedRef;
}

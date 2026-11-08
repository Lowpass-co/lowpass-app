/* ============================================
   LOWPASS — upload grants (Nov 2026)

   The server half of a direct upload:
     issueGrant     record the grant, mint a one-time signed upload token
     completeGrant  the object exists, at its real size, for THIS grant → mark done
     sweepStale     delete objects whose grant never completed (cron)
   The caller has already decided the upload is allowed and chosen the path.
   Storage goes through GrantStorage so the tests can see what happened.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { MAX_UPLOAD_BYTES, UPLOAD_GRANT_TTL_HOURS, tooLargeMessage } from '@/lib/uploads/limits';

export interface GrantStorage {
  signUpload(bucket: string, path: string): Promise<string | null>;
  /** Real size + type of an uploaded object, or null if it isn't there. */
  info(bucket: string, path: string): Promise<{ size: number; contentType: string | null } | null>;
  remove(bucket: string, paths: string[]): Promise<void>;
}

export function supabaseGrantStorage(service: SupabaseClient): GrantStorage {
  return {
    async signUpload(bucket, path) {
      const { data, error } = await service.storage.from(bucket).createSignedUploadUrl(path);
      return error || !data ? null : data.token;
    },
    async info(bucket, path) {
      const slash = path.lastIndexOf('/');
      const dir = path.slice(0, slash);
      const name = path.slice(slash + 1);
      const { data, error } = await service.storage.from(bucket).list(dir, { search: name, limit: 100 });
      if (error || !data) return null;
      const hit = data.find((o) => o.name === name);
      if (!hit) return null;
      const meta = (hit.metadata ?? {}) as { size?: number; mimetype?: string };
      return typeof meta.size === 'number' ? { size: meta.size, contentType: meta.mimetype ?? null } : null;
    },
    async remove(bucket, paths) {
      if (paths.length) await service.storage.from(bucket).remove(paths);
    },
  };
}

export class UploadError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export interface Grant {
  path: string;
  token: string;
  bucket: string;
}

export async function issueGrant(
  service: SupabaseClient,
  storage: GrantStorage,
  args: { workspaceId: string; bucket: string; path: string; declaredSize: number; linkId?: string | null; userId?: string | null; now?: Date },
): Promise<Grant> {
  if (!Number.isFinite(args.declaredSize) || args.declaredSize <= 0) throw new UploadError(400, 'empty', 'That file is empty.');
  if (args.declaredSize > MAX_UPLOAD_BYTES) throw new UploadError(413, 'too_large', tooLargeMessage());
  const { error } = await service.from('storage_upload_grants').insert({
    workspace_id: args.workspaceId,
    bucket: args.bucket,
    path: args.path,
    declared_size: Math.round(args.declaredSize),
    link_id: args.linkId ?? null,
    created_by: args.userId ?? null,
    // Server clock, explicitly: the hourly cap compares against it.
    created_at: (args.now ?? new Date()).toISOString(),
  });
  if (error) throw new UploadError(500, 'error', 'Couldn’t prepare the upload.');
  const token = await storage.signUpload(args.bucket, args.path);
  if (!token) {
    await service.from('storage_upload_grants').delete().eq('path', args.path);
    throw new UploadError(500, 'error', 'Couldn’t prepare the upload.');
  }
  return { path: args.path, token, bucket: args.bucket };
}

/** The finish step. Only a path this app granted, to this workspace (and
 *  link, if any), and only once the object really exists. Size and type come
 *  from Storage, never from the browser. Re-running it after success returns
 *  the same facts (a retried "finish" is harmless). */
export async function completeGrant(
  service: SupabaseClient,
  storage: GrantStorage,
  args: { workspaceId: string; path: string; linkId?: string | null; now?: Date },
): Promise<{ size: number; contentType: string | null; alreadyDone: boolean }> {
  let q = service.from('storage_upload_grants').select('id, bucket, completed_at, link_id').eq('path', args.path).eq('workspace_id', args.workspaceId);
  q = args.linkId ? q.eq('link_id', args.linkId) : q.is('link_id', null);
  const { data, error } = await q.maybeSingle();
  if (error) throw new UploadError(500, 'error', 'Couldn’t check the upload.');
  const g = data as { id: string; bucket: string; completed_at: string | null } | null;
  if (!g) throw new UploadError(404, 'not_found', 'That upload wasn’t started here.');
  const info = await storage.info(g.bucket, args.path);
  if (!info) throw new UploadError(409, 'not_uploaded', 'The file didn’t finish uploading. Try again.');
  if (info.size > MAX_UPLOAD_BYTES) {
    await storage.remove(g.bucket, [args.path]);
    await service.from('storage_upload_grants').delete().eq('id', g.id);
    throw new UploadError(413, 'too_large', tooLargeMessage());
  }
  if (g.completed_at) return { ...info, alreadyDone: true };
  // Conditional: of two concurrent finishes, exactly one claims the grant —
  // the other is told it's already done, so only one file row is ever made.
  const { data: won, error: uErr } = await service
    .from('storage_upload_grants')
    .update({ completed_at: (args.now ?? new Date()).toISOString() })
    .eq('id', g.id)
    .is('completed_at', null)
    .select('id');
  if (uErr) throw new UploadError(500, 'error', 'Couldn’t record the upload.');
  return { ...info, alreadyDone: !won || (won as unknown[]).length === 0 };
}

/** Grants issued in the last hour through one share link — finished or not. */
export async function grantsInLastHour(service: SupabaseClient, linkId: string, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 3_600_000).toISOString();
  const { count, error } = await service
    .from('storage_upload_grants')
    .select('id', { count: 'exact', head: true })
    .eq('link_id', linkId)
    .gte('created_at', since);
  if (error) throw new UploadError(500, 'error', 'Couldn’t check the upload limit.');
  return count ?? 0;
}

/** Delete objects (and grants) whose upload never finished. Returns how many. */
export async function sweepStale(service: SupabaseClient, storage: GrantStorage, now = new Date(), batch = 200): Promise<number> {
  const before = new Date(now.getTime() - UPLOAD_GRANT_TTL_HOURS * 3_600_000).toISOString();
  const { data, error } = await service
    .from('storage_upload_grants')
    .select('id, bucket, path, created_at')
    .is('completed_at', null)
    .order('created_at', { ascending: true })
    .limit(batch);
  if (error) throw new UploadError(500, 'error', error.message);
  const stale = ((data ?? []) as Array<{ id: string; bucket: string; path: string; created_at: string }>).filter((g) => g.created_at < before);
  const byBucket = new Map<string, string[]>();
  for (const g of stale) byBucket.set(g.bucket, [...(byBucket.get(g.bucket) ?? []), g.path]);
  for (const [bucket, paths] of byBucket) await storage.remove(bucket, paths);
  if (stale.length) {
    const { error: dErr } = await service.from('storage_upload_grants').delete().in('id', stale.map((g) => g.id));
    if (dErr) throw new UploadError(500, 'error', dErr.message);
  }
  return stale.length;
}

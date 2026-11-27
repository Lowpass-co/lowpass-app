/* ============================================
   LOWPASS — Advance upload questions, server side (Nov 2026)

   Uploads go straight to Storage (storage grants, 282): the server picks the
   path inside the show's own folder, the browser sends the bytes, the finish
   step checks the bytes really are a PDF / image (the stored type must equal
   what they are), and only paths inside the show's folder are ever signed.
   Used by the tour's route (Advance edit) and the venue's link route (token).
   ============================================ */

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { completeGrant, issueGrant, supabaseGrantStorage, UploadError, type Grant } from '@/server/uploads/grants';
import { sniffImage } from '@/lib/riders/photos';
import {
  ADVANCE_FILE_BUCKET,
  ADVANCE_FILE_MAX_BYTES,
  advanceFilePath,
  fileBelongs,
  isAdvanceFileType,
  showFolder,
  type FileAnswer,
} from '@/lib/advance/fileAnswers';

export interface ShowKey {
  ws: string;
  tourId: string;
  routingId: string;
}

/** Venue uploads per show per hour (counted from issued grants). */
export const VENUE_UPLOADS_PER_HOUR = 40;

export async function startAdvanceUpload(
  service: SupabaseClient,
  show: ShowKey,
  args: { type: unknown; size: unknown; userId?: string | null },
): Promise<Grant> {
  if (!isAdvanceFileType(args.type)) throw new UploadError(415, 'type', 'A PDF or an image (JPEG, PNG, WebP, GIF), please.');
  const size = Number(args.size);
  if (!Number.isFinite(size) || size <= 0) throw new UploadError(400, 'empty', 'That file is empty.');
  if (size > ADVANCE_FILE_MAX_BYTES) throw new UploadError(413, 'too_large', 'That file is too big (25 MB at most).');
  const path = advanceFilePath(show.ws, show.tourId, show.routingId, randomUUID(), args.type);
  return issueGrant(service, supabaseGrantStorage(service), {
    workspaceId: show.ws,
    bucket: ADVANCE_FILE_BUCKET,
    path,
    declaredSize: size,
    userId: args.userId ?? null,
  });
}

/** What the first bytes are: a PDF or one of the image types — else null. */
export function sniffAdvanceFile(bytes: Uint8Array): string | null {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return 'application/pdf';
  return sniffImage(bytes);
}

async function headBytes(service: SupabaseClient, path: string): Promise<Uint8Array> {
  const { data } = await service.storage.from(ADVANCE_FILE_BUCKET).createSignedUrl(path, 60);
  if (data?.signedUrl) {
    try {
      const res = await fetch(data.signedUrl, { headers: { Range: 'bytes=0-31' } });
      const head = new Uint8Array(await res.arrayBuffer()).slice(0, 32);
      if (res.ok && head.length >= 5) return head;
    } catch {
      /* fall through */
    }
  }
  const { data: blob } = await service.storage.from(ADVANCE_FILE_BUCKET).download(path);
  return blob ? new Uint8Array(await blob.slice(0, 32).arrayBuffer()) : new Uint8Array();
}

export async function finishAdvanceUpload(
  service: SupabaseClient,
  show: ShowKey,
  args: { path: unknown; name: unknown },
): Promise<FileAnswer> {
  if (!fileBelongs(args.path, show.ws, show.tourId, show.routingId)) throw new UploadError(400, 'path', 'That upload isn’t for this show.');
  const storage = supabaseGrantStorage(service);
  const done = await completeGrant(service, storage, { workspaceId: show.ws, path: args.path });
  const real = sniffAdvanceFile(await headBytes(service, args.path));
  // The stored type must BE what the bytes are — a page labelled as an image
  // would be served as a page.
  if (!real || done.contentType !== real || done.size > ADVANCE_FILE_MAX_BYTES) {
    await storage.remove(ADVANCE_FILE_BUCKET, [args.path]);
    throw new UploadError(415, 'type', 'That file isn’t a PDF or an image we can show.');
  }
  const name = typeof args.name === 'string' && args.name.trim() ? args.name.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 160) : 'File';
  return { path: args.path, name, size: done.size, type: real };
}

/** Signed links (10 min) for paths inside this show's folder; others ignored. */
export async function signAdvanceFiles(service: SupabaseClient, show: ShowKey, paths: unknown[]): Promise<Record<string, string>> {
  const mine = [...new Set(paths.filter((p): p is string => fileBelongs(p, show.ws, show.tourId, show.routingId)))].slice(0, 100);
  if (!mine.length) return {};
  const { data } = await service.storage.from(ADVANCE_FILE_BUCKET).createSignedUrls(mine, 600);
  const out: Record<string, string> = {};
  for (const row of data ?? []) if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  return out;
}

/** Venue uploads started for this show in the last hour. */
export async function venueUploadsLastHour(service: SupabaseClient, show: ShowKey, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 3_600_000).toISOString();
  const { count, error } = await service
    .from('storage_upload_grants')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', show.ws)
    .like('path', `${showFolder(show.ws, show.tourId, show.routingId)}%`)
    .is('created_by', null)
    .gte('created_at', since);
  if (error) throw new UploadError(500, 'error', 'Couldn’t check the upload limit.');
  return count ?? 0;
}

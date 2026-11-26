/* ============================================
   LOWPASS — Riders: item photos on the server (Nov 2026)

   Photos of the exact item live in the private tour-files bucket under
   rider-photos/<workspace>/<tour>/. Nothing here signs a path that isn't
   THIS tour's (`photoBelongs`) — the promoter routes run as the service role,
   so that check is the only thing between a crafted block and another
   tour's file.
   ============================================ */

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PHOTO_BUCKET, PHOTO_MAX_BYTES, photoBelongs, photoPath, sniffImage, type PhotoType } from '@/lib/riders/photos';
import { RiderError } from './errors';

/** Signed URLs (path → URL) for this tour's photos; anything else is skipped. */
export async function signPhotos(service: SupabaseClient, workspaceId: string, tourId: string, paths: readonly unknown[], ttlSeconds = 3600): Promise<Record<string, string>> {
  const ok = [...new Set(paths.filter((p): p is string => photoBelongs(p, workspaceId, tourId)))].slice(0, 500);
  if (!ok.length) return {};
  const { data, error } = await service.storage.from(PHOTO_BUCKET).createSignedUrls(ok, ttlSeconds);
  if (error || !data) return {};
  const out: Record<string, string> = {};
  for (const d of data) if (d.path && d.signedUrl && !d.error) out[d.path] = d.signedUrl;
  return out;
}

/** Store image bytes the SERVER fetched (a shop's product photo) as a new
 *  photo of this tour. The type comes from the bytes, never the shop. */
export async function storePhotoBytes(service: SupabaseClient, workspaceId: string, tourId: string, bytes: Uint8Array): Promise<{ path: string; type: PhotoType }> {
  if (bytes.byteLength > PHOTO_MAX_BYTES) throw new RiderError(413, 'That photo is too big (8 MB at most).');
  const type = sniffImage(bytes);
  if (!type) throw new RiderError(415, 'That isn’t a photo Lowpass can use (JPEG, PNG, WebP or GIF).');
  const path = photoPath(workspaceId, tourId, randomUUID(), type);
  const { error } = await service.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType: type, upsert: false });
  if (error) throw new RiderError(500, 'Couldn’t save the photo.');
  return { path, type };
}

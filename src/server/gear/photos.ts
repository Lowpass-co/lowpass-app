/* Gear photos on the server: store bytes the server fetched or a browser
   uploaded (through a storage grant), and copy a shop's product photo.
   See src/lib/gear/photos.ts for where they live. */
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sniffImage } from '@/lib/riders/photos';
import { productFromHtml } from '@/lib/riders/linkPreview';
import { GEAR_PHOTO_BUCKET, GEAR_PHOTO_MAX_BYTES, gearPhotoPath } from '@/lib/gear/photos';
import { safeFetch } from '@/server/net/safeFetch';

export class GearPhotoError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function gearPhotoUrl(service: SupabaseClient, path: string): string {
  return service.storage.from(GEAR_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Bytes → a stored photo. The type comes from the bytes, never the source. */
export async function storeGearPhoto(service: SupabaseClient, workspaceId: string, bytes: Uint8Array): Promise<{ path: string; url: string }> {
  if (bytes.byteLength > GEAR_PHOTO_MAX_BYTES) throw new GearPhotoError(413, 'That photo is too big (8 MB at most).');
  const type = sniffImage(bytes);
  if (!type) throw new GearPhotoError(415, 'That isn’t a photo Lowpass can use (JPEG, PNG, WebP or GIF).');
  const path = gearPhotoPath(workspaceId, randomUUID(), type);
  const { error } = await service.storage.from(GEAR_PHOTO_BUCKET).upload(path, bytes, { contentType: type, upsert: false });
  if (error) throw new GearPhotoError(500, 'Couldn’t save the photo.');
  return { path, url: gearPhotoUrl(service, path) };
}

const HTML_MAX = 1_500_000;

/** A link to a photo, or to a product page with one (og:image …) → the
 *  image's bytes. Every fetch goes through safeFetch (public addresses
 *  only, redirects re-checked, size and time capped). */
export async function photoBytesFromLink(url: string): Promise<Uint8Array> {
  const page = await safeFetch(url, { maxBytes: HTML_MAX, accept: 'image/webp,image/png,image/jpeg,image/gif,text/html;q=0.8,*/*;q=0.5' });
  if (sniffImage(page.body)) return page.body;
  const found = productFromHtml(new TextDecoder('utf-8', { fatal: false }).decode(page.body), page.url);
  if (!found.image) throw new GearPhotoError(422, 'That page doesn’t offer a product photo.');
  const img = await safeFetch(found.image, { maxBytes: GEAR_PHOTO_MAX_BYTES, accept: 'image/webp,image/png,image/jpeg,image/gif;q=0.9' });
  if (!sniffImage(img.body)) throw new GearPhotoError(415, 'That page’s photo isn’t one Lowpass can use.');
  return img.body;
}

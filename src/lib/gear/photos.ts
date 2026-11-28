/* ============================================
   LOWPASS — gear photos (Nov 2026)

   Stored in the public-read `artist-assets` bucket (like artist logos), so
   the photo's URL works anywhere it's shown — the stock list, the job
   builder, the quote — without signing. Paths are chosen by the server:
   gear-photos/<workspace>/<uuid>.<ext>. Product photos only; nothing private.
   ============================================ */

import { PHOTO_TYPES, type PhotoType } from '@/lib/riders/photos';

export const GEAR_PHOTO_BUCKET = 'artist-assets';
export const GEAR_PHOTO_ROOT = 'gear-photos';
export const GEAR_PHOTO_MAX_BYTES = 8 * 1024 * 1024;

const ID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const RE = new RegExp(`^${GEAR_PHOTO_ROOT}/${ID}/${ID}\\.(?:jpg|png|webp|gif)$`);

export function gearPhotoPath(workspaceId: string, id: string, type: PhotoType): string {
  return `${GEAR_PHOTO_ROOT}/${workspaceId}/${id}.${PHOTO_TYPES[type]}`;
}

/** Is this one of THIS workspace's gear photos? */
export function gearPhotoBelongs(path: unknown, workspaceId: string): path is string {
  return typeof path === 'string' && RE.test(path) && path.startsWith(`${GEAR_PHOTO_ROOT}/${workspaceId}/`);
}

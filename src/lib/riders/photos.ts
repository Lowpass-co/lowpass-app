/* ============================================
   LOWPASS — Riders: the exact item — photos + links, pure (Nov 2026)

   A request line can point at the exact item: a shop / product page (`link`)
   and a photo (`photo`). The photo lives in tour storage, never at the shop —
   shop images move and die, and a published version must keep showing what
   was asked for. A photo path is ONE shape:

     rider-photos/<workspace id>/<tour id>/<random id>.<jpg|png|webp|gif>

   and is only ever signed for a reader of THAT tour (`photoBelongs`) — the
   public routes use the service role, so the path check is what stops a
   crafted block pointing a promoter at another tour's file.
   ============================================ */

import type { RiderBlock, SnapBlock } from './types';

export const PHOTO_ROOT = 'rider-photos';
export const PHOTO_BUCKET = 'tour-files';
/** Photos are resized in the browser first; this is the ceiling either way. */
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;

export const PHOTO_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
} as const;
export type PhotoType = keyof typeof PHOTO_TYPES;

const ID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PHOTO_RE = new RegExp(`^${PHOTO_ROOT}/${ID}/${ID}/${ID}\\.(?:jpg|png|webp|gif)$`);

export const isPhotoPath = (v: unknown): v is string => typeof v === 'string' && PHOTO_RE.test(v);
export const photoPrefix = (workspaceId: string, tourId: string): string => `${PHOTO_ROOT}/${workspaceId}/${tourId}/`;
/** Is this a photo of THIS tour? (The only paths any route will sign.) */
export const photoBelongs = (path: unknown, workspaceId: string, tourId: string): path is string =>
  isPhotoPath(path) && path.startsWith(photoPrefix(workspaceId, tourId));

export const isPhotoType = (t: unknown): t is PhotoType => typeof t === 'string' && t in PHOTO_TYPES;

export function photoPath(workspaceId: string, tourId: string, id: string, type: PhotoType): string {
  return `${photoPrefix(workspaceId, tourId)}${id}.${PHOTO_TYPES[type]}`;
}

/** The image type from its first bytes — never trust a server's word for it.
 *  SVG is deliberately not an image here (it can carry script). */
export function sniffImage(b: Uint8Array): PhotoType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return 'image/gif';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

/** A shop / product link: http(s) only, no credentials, ≤ 500 chars. '' = none. */
export function cleanLink(v: unknown): string {
  if (typeof v !== 'string') return '';
  const t = v.trim();
  if (!t || t.length > 500) return '';
  try {
    const u = new URL(t);
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password || !u.hostname.includes('.')) return '';
    return u.toString();
  } catch {
    return '';
  }
}

/** What someone typed or pasted → a link ('' = not one). A bare
 *  "thomann.de/…" gets https:// — nobody types the scheme. */
export function typedLink(v: unknown): string {
  if (typeof v !== 'string') return '';
  const t = v.trim();
  if (!t) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return cleanLink(t);
  return /^[\w-]+(\.[\w-]+)+(:\d+)?([/?#]|$)/i.test(t) ? cleanLink(`https://${t}`) : '';
}

/** "tesco.com" — what a link reads as. */
export function linkHost(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Every photo path the blocks use (to sign in one call). */
export function photoPathsIn(blocks: readonly (Pick<RiderBlock, 'kind' | 'content'> | Pick<SnapBlock, 'kind' | 'content'>)[]): string[] {
  const out = new Set<string>();
  for (const b of blocks) {
    if (b.kind !== 'request') continue;
    const p = (b.content as { photo?: unknown }).photo;
    if (isPhotoPath(p)) out.add(p);
  }
  return [...out];
}

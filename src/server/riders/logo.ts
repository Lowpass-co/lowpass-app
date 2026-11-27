/* ============================================
   LOWPASS — Riders: the artist's logo for the PDF (Nov 2026)

   Adam's riders open with the artist's logo and carry it on every page; the
   PDF does the same. The logo is the one set on the artist (Edit profile →
   Logo), which the uploader stores in the public artist-assets bucket at
   {workspace}/{artist}/logo.{ext} and records in artists.branding.logo_url.

     · our own upload → read from Storage (no web fetch at all);
     · any other URL (an artist from before the uploader) → safeFetch, which
       only reaches public addresses — never a raw fetch of a stored string.

   Either way the bytes must BE a JPEG / PNG / WebP / GIF (sniffed), ≤ 3 MB.
   Anything else → null, and the PDF sets the artist's name instead.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sniffImage } from '@/lib/riders/photos';
import { safeFetch } from '@/server/net/safeFetch';

const MAX_LOGO_BYTES = 3_000_000;
const OUR_UPLOAD = /\/storage\/v1\/object\/public\/artist-assets\/([^?#]+)/;

function dataUri(bytes: Uint8Array | null): string | null {
  if (!bytes || !bytes.length || bytes.length > MAX_LOGO_BYTES) return null;
  const type = sniffImage(bytes.subarray(0, 32));
  return type ? `data:${type};base64,${Buffer.from(bytes).toString('base64')}` : null;
}

/** The tour's artist's logo as a data URI, or null. Service role, pinned to
 *  this tour; never throws. */
export async function loadRiderLogo(service: SupabaseClient, tourId: string): Promise<string | null> {
  try {
    const { data: tour } = await service.from('tours').select('artist_id').eq('id', tourId).maybeSingle();
    const artistId = (tour as { artist_id: string | null } | null)?.artist_id;
    if (!artistId) return null;
    const { data: artist } = await service.from('artists').select('id, workspace_id, branding').eq('id', artistId).maybeSingle();
    const a = artist as { id: string; workspace_id: string; branding: unknown } | null;
    const url = a?.branding && typeof a.branding === 'object' ? (a.branding as { logo_url?: unknown }).logo_url : null;
    if (!a || typeof url !== 'string' || !url.trim()) return null;

    const ours = OUR_UPLOAD.exec(url);
    if (ours) {
      const objectPath = decodeURIComponent(ours[1]);
      // Only this artist's own folder — a hand-typed URL can't point us at
      // another workspace's file.
      if (!objectPath.startsWith(`${a.workspace_id}/${a.id}/`) || objectPath.includes('..')) return null;
      const { data } = await service.storage.from('artist-assets').download(objectPath);
      return data ? dataUri(new Uint8Array(await data.arrayBuffer())) : null;
    }
    const got = await safeFetch(url, { maxBytes: MAX_LOGO_BYTES, accept: 'image/png,image/jpeg,image/webp,image/gif', timeoutMs: 6000 });
    return dataUri(got.body);
  } catch {
    return null;
  }
}

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
import { fetchLogoDataUri, logoBytesDataUri } from '@/lib/export/logo';

const OUR_UPLOAD = /\/storage\/v1\/object\/public\/artist-assets\/([^?#]+)/;

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
      return data ? logoBytesDataUri(new Uint8Array(await data.arrayBuffer())) : null;
    }
    return await fetchLogoDataUri(url);
  } catch {
    return null;
  }
}

/** A data URI from `loadRiderLogo` → an image response (404 when none). The
 *  screen surfaces load the logo from a same-origin route that sends this, so
 *  the page shows exactly what the PDF prints and no outside host is ever
 *  asked for it from a page whose URL is a grant. */
export function logoResponse(dataUri: string | null, cacheControl: string): Response {
  const m = dataUri ? /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/.exec(dataUri) : null;
  if (!m) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return new Response(new Uint8Array(Buffer.from(m[2], 'base64')), {
    status: 200,
    headers: { 'Content-Type': m[1], 'Cache-Control': cacheControl, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" },
  });
}

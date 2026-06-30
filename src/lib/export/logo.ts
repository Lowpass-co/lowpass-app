/* ============================================
   LOWPASS — Export logo helpers (#8 Document Export)

   The branded PDF shell needs images INLINED as base64 data URIs, not network
   URLs: (1) it's private-bucket-safe (don't hand Chromium a URL it must fetch —
   a signed/expired URL or a future private bucket would silently break the
   logo), and (2) page.pdf's footer template can't load app-relative assets.

   Pure server-side (fetch + fs). Every failure degrades to null so a logo issue
   never breaks the export.
   ============================================ */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';

const MAX_LOGO_BYTES = 3_000_000; // 3MB — a letterhead logo is never larger.
const EXPORT_ASSETS_BUCKET = 'export-assets';

/** Fetch a remote (artist) logo URL and inline it as a base64 data URI. Returns
 *  null for a non-http URL, a non-image response, an oversized asset, or any
 *  network error — the caller renders the initials fallback instead. */
export async function fetchLogoDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  // Hard timeout — a slow/blocked logo host must never hold the whole export
  // function open (it has no business pushing a PDF render toward maxDuration).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_LOGO_BYTES) return null;
    return `data:${contentType};base64,${buf.toString('base64')}`;
  } catch {
    return null; // abort / network / parse → initials fallback, never throws
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve a header/background image (config `header.bgAssetPath`, or an uploaded
 *  header logo) from the private `export-assets` bucket → a base64 data URI for the
 *  render. SECURITY: the path MUST live under the caller's workspace prefix
 *  (`{workspaceId}/…`) — a path outside it is rejected so a hostile config can't
 *  read another workspace's asset. Every failure degrades to null (no image), never
 *  throws — a missing asset must not break the export. */
export async function fetchExportAssetDataUri(
  supabase: SupabaseClient,
  workspaceId: string,
  assetPath: string | null | undefined,
): Promise<string | null> {
  if (!assetPath || typeof assetPath !== 'string') return null;
  // Workspace-prefix guard (defence-in-depth on top of bucket RLS).
  if (!assetPath.startsWith(`${workspaceId}/`) || assetPath.includes('..')) return null;
  try {
    const { data, error } = await supabase.storage.from(EXPORT_ASSETS_BUCKET).download(assetPath);
    if (error || !data) return null;
    const buf = Buffer.from(await data.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_LOGO_BYTES) return null;
    const contentType = data.type && data.type.startsWith('image/') ? data.type : 'image/png';
    return `data:${contentType};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

let lowpassMarkCache: string | null | undefined;

/** The static Lowpass wordmark (public/lowpass-logo.png) as a data URI, cached
 *  per server instance. Used as the footer mark. null if the file can't be read. */
export async function lowpassMarkDataUri(): Promise<string | null> {
  if (lowpassMarkCache !== undefined) return lowpassMarkCache;
  try {
    const buf = await readFile(path.join(process.cwd(), 'public', 'lowpass-logo.png'));
    lowpassMarkCache = `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    lowpassMarkCache = null;
  }
  return lowpassMarkCache;
}

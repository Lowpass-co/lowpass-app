/* ============================================
   POST /api/tours/[id]/riders/photos — photos of the exact item (Nov 2026)

     { action: 'urls', paths }          signed URLs (this tour's photos only)
                                        — Production VIEW
     { action: 'upload-url', type, size } a one-time upload for a path the
                                        server picks (storage grant, 282)
     { action: 'complete', path }       the object is there and IS an image
     { action: 'from-link', url }       fetch the shop page, take its product
                                        photo (og:image …), store a copy
                                        — the last three: Production EDIT

   Photos go straight to Storage (no upload passes through a function). The
   link fetch runs behind safeFetch (public addresses only, size + time
   capped, no redirects to private ones) and keeps a COPY: shop images move.
   ============================================ */

import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server';
import { requireUserAndWorkspace, requireWrite } from '@/lib/auth/workspace-check';
import { getViewerAccess, viewerAllows } from '@/lib/permissions/tourAccess';
import { readJson, tourGate } from '@/server/advance/routeGuard';
import { completeGrant, issueGrant, supabaseGrantStorage, UploadError } from '@/server/uploads/grants';
import { PHOTO_BUCKET, PHOTO_MAX_BYTES, cleanLink, isPhotoType, photoBelongs, photoPath, sniffImage } from '@/lib/riders/photos';
import { productFromHtml } from '@/lib/riders/linkPreview';
import { RiderError } from '@/server/riders/errors';
import { riderErrorResponse } from '@/server/riders/http';
import { signPhotos, storePhotoBytes } from '@/server/riders/photos';
import { FetchRefused, safeFetch } from '@/server/net/safeFetch';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const HTML_MAX = 1_500_000;

type Params = { params: Promise<{ id: string }> };

/** The first bytes of an object in our own bucket: a ranged read, else the
 *  whole object (≤ 8 MB — the grant capped it). */
async function firstBytes(service: SupabaseClient, path: string): Promise<Uint8Array> {
  const { data } = await service.storage.from(PHOTO_BUCKET).createSignedUrl(path, 60);
  if (data?.signedUrl) {
    try {
      const res = await fetch(data.signedUrl, { headers: { Range: 'bytes=0-31' } });
      const head = new Uint8Array(await res.arrayBuffer()).slice(0, 32);
      if (res.ok && head.length >= 12) return head;
    } catch {
      /* fall through to a full read */
    }
  }
  const { data: blob } = await service.storage.from(PHOTO_BUCKET).download(path);
  return blob ? new Uint8Array(await blob.slice(0, 32).arrayBuffer()) : new Uint8Array();
}

/** Link reads per user: an outbound fetch on our dime, so a soft cap — in
 *  memory (a cold start resets it; it is a brake, not a boundary). */
const LINK_READS = new Map<string, number[]>();
const LINK_READS_MAX = 30;
const LINK_READS_WINDOW_MS = 10 * 60_000;
function linkReadAllowed(userId: string, now = Date.now()): boolean {
  const recent = (LINK_READS.get(userId) ?? []).filter((t) => now - t < LINK_READS_WINDOW_MS);
  if (recent.length >= LINK_READS_MAX) {
    LINK_READS.set(userId, recent);
    return false;
  }
  recent.push(now);
  LINK_READS.set(userId, recent);
  if (LINK_READS.size > 5000) LINK_READS.clear();
  return true;
}

export async function POST(request: Request, { params }: Params) {
  const { id: tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const body = (await readJson<Record<string, unknown>>(request)) ?? {};
  const action = body.action;
  const service = createServiceSupabaseClient() as unknown as SupabaseClient;

  if (action === 'urls') {
    const auth = await requireUserAndWorkspace(supabase);
    if ('error' in auth) return auth.error;
    const gate = await tourGate(supabase, tourId, auth.workspaceId);
    if (gate) return gate;
    const access = await getViewerAccess(supabase as unknown as SupabaseClient, auth.user.id, tourId);
    if (!viewerAllows(access, 'production', 'view')) return NextResponse.json({ error: 'You can’t see this tour’s riders.' }, { status: 403 });
    const paths = Array.isArray(body.paths) ? body.paths.slice(0, 200) : [];
    return NextResponse.json({ urls: await signPhotos(service, auth.workspaceId, tourId, paths) });
  }

  const auth = await requireWrite(supabase, { area: 'production', tourId });
  if ('error' in auth) return auth.error;
  const gate = await tourGate(supabase, tourId, auth.workspaceId);
  if (gate) return gate;
  const ws = auth.workspaceId;

  try {
    if (action === 'upload-url') {
      if (!isPhotoType(body.type)) throw new RiderError(415, 'JPEG, PNG, WebP or GIF, please.');
      const size = Number(body.size);
      if (!Number.isFinite(size) || size <= 0) throw new RiderError(400, 'That file is empty.');
      if (size > PHOTO_MAX_BYTES) throw new RiderError(413, 'That photo is too big (8 MB at most).');
      const path = photoPath(ws, tourId, randomUUID(), body.type);
      const grant = await issueGrant(service, supabaseGrantStorage(service), { workspaceId: ws, bucket: PHOTO_BUCKET, path, declaredSize: size, userId: auth.user.id });
      return NextResponse.json(grant, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (action === 'complete') {
      const path = body.path;
      if (!photoBelongs(path, ws, tourId)) throw new RiderError(400, 'That isn’t one of this tour’s photos.');
      const storage = supabaseGrantStorage(service);
      const done = await completeGrant(service, storage, { workspaceId: ws, path });
      // The browser said it was an image; check what actually arrived (the
      // first bytes only — a ranged read of our own storage).
      // The stored type must BE what the bytes are: an image with a text/html
      // label would be served as a page.
      const bytes = await firstBytes(service, path);
      const real = sniffImage(bytes);
      if (!real || done.contentType !== real || done.size > PHOTO_MAX_BYTES) {
        await storage.remove(PHOTO_BUCKET, [path]);
        throw new RiderError(415, 'That isn’t a photo Lowpass can use (JPEG, PNG, WebP or GIF).');
      }
      const urls = await signPhotos(service, ws, tourId, [path]);
      return NextResponse.json({ path, url: urls[path] ?? null });
    }

    if (action === 'from-link') {
      const url = cleanLink(body.url);
      if (!url) throw new RiderError(400, 'That doesn’t look like a web link.');
      if (!linkReadAllowed(auth.user.id)) throw new RiderError(429, 'That’s a lot of links at once — wait a few minutes, or add the photo yourself.');
      const page = await safeFetch(url, { maxBytes: HTML_MAX, accept: 'text/html,application/xhtml+xml,image/*;q=0.9,*/*;q=0.5' });
      let imageBytes: Uint8Array | null = null;
      let title: string | null = null;
      if (sniffImage(page.body)) imageBytes = page.body; // a link straight to a photo
      else {
        const found = productFromHtml(new TextDecoder('utf-8', { fatal: false }).decode(page.body), page.url);
        title = found.title;
        if (!found.image) throw new RiderError(422, 'That page doesn’t offer a product photo — add one yourself.', 'NO_IMAGE');
        const img = await safeFetch(found.image, { maxBytes: PHOTO_MAX_BYTES, accept: 'image/webp,image/png,image/jpeg,image/gif;q=0.9' });
        imageBytes = img.body;
      }
      const { path } = await storePhotoBytes(service, ws, tourId, imageBytes);
      const urls = await signPhotos(service, ws, tourId, [path]);
      return NextResponse.json({ path, url: urls[path] ?? null, title });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    if (e instanceof FetchRefused) return NextResponse.json({ error: e.message, code: 'FETCH' }, { status: 422 });
    return riderErrorResponse(e, `photos:${String(action)}`);
  }
}

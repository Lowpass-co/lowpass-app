/* ============================================
   POST /api/gear/photos — a stock item's photo (Nov 2026)
     { action: 'upload-url', type, size }  a one-time upload for a path the
                                           server picks (storage grant, 282)
     { action: 'complete', path }          the object is there and IS an image
                                           → { url } to save as image_url
     { action: 'from-link', url }          a photo or product page link → a
                                           stored COPY (shop images move)
   No upload passes through this function (Uploads — straight to Storage).
   ============================================ */
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server';
import { completeGrant, issueGrant, supabaseGrantStorage, UploadError } from '@/server/uploads/grants';
import { cleanLink, isPhotoType, sniffImage } from '@/lib/riders/photos';
import { GEAR_PHOTO_BUCKET, GEAR_PHOTO_MAX_BYTES, gearPhotoBelongs, gearPhotoPath } from '@/lib/gear/photos';
import { GearPhotoError, gearPhotoUrl, photoBytesFromLink, storeGearPhoto } from '@/server/gear/photos';
import { FetchRefused } from '@/server/net/safeFetch';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const ws = auth.workspaceId;
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const service = createServiceSupabaseClient() as unknown as SupabaseClient;
  const storage = supabaseGrantStorage(service);
  try {
    if (body.action === 'upload-url') {
      if (!isPhotoType(body.type)) return NextResponse.json({ error: 'JPEG, PNG, WebP or GIF, please.' }, { status: 415 });
      const size = Number(body.size);
      if (!Number.isFinite(size) || size <= 0) return NextResponse.json({ error: 'That file is empty.' }, { status: 400 });
      if (size > GEAR_PHOTO_MAX_BYTES) return NextResponse.json({ error: 'That photo is too big (8 MB at most).' }, { status: 413 });
      const grant = await issueGrant(service, storage, {
        workspaceId: ws,
        bucket: GEAR_PHOTO_BUCKET,
        path: gearPhotoPath(ws, randomUUID(), body.type),
        declaredSize: size,
        userId: auth.user.id,
      });
      return NextResponse.json(grant, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (body.action === 'complete') {
      const path = body.path;
      if (!gearPhotoBelongs(path, ws)) return NextResponse.json({ error: 'That isn’t one of your photos.' }, { status: 400 });
      const done = await completeGrant(service, storage, { workspaceId: ws, path });
      // The browser said it was an image; check what actually arrived. The
      // stored type must BE what the bytes are.
      const { data: blob } = await service.storage.from(GEAR_PHOTO_BUCKET).download(path);
      const real = blob ? sniffImage(new Uint8Array(await blob.slice(0, 32).arrayBuffer())) : null;
      if (!real || done.contentType !== real || done.size > GEAR_PHOTO_MAX_BYTES) {
        await storage.remove(GEAR_PHOTO_BUCKET, [path]);
        return NextResponse.json({ error: 'That isn’t a photo Lowpass can use (JPEG, PNG, WebP or GIF).' }, { status: 415 });
      }
      return NextResponse.json({ url: gearPhotoUrl(service, path) });
    }
    if (body.action === 'from-link') {
      const url = cleanLink(body.url);
      if (!url) return NextResponse.json({ error: 'That doesn’t look like a web link.' }, { status: 400 });
      const stored = await storeGearPhoto(service, ws, await photoBytesFromLink(url));
      return NextResponse.json({ url: stored.url });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    if (e instanceof GearPhotoError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof FetchRefused) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error('[gear photos]', e);
    return NextResponse.json({ error: 'Couldn’t save the photo.' }, { status: 500 });
  }
}

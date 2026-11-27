'use client';

/* ============================================
   LOWPASS — Riders: a photo of the exact item, from the browser (Nov 2026)

   The type is read from the file's own bytes (sniffImage — the same rule the
   server checks again after upload). Big photos are shrunk here first (long
   side ≤ 1600 px) so a promoter's phone isn't fed a 12 MB camera original;
   GIFs and small files go as they are. Then the usual three steps: the
   server grants a path, the bytes go straight to Storage, the server checks
   what arrived.
   ============================================ */

import { PHOTO_MAX_BYTES, sniffImage, type PhotoType } from '@/lib/riders/photos';
import { uploadDirect } from '@/lib/uploads/directUpload';

const LONG_SIDE = 1600;
const SHRINK_ABOVE_BYTES = 1_500_000;

async function typeOf(blob: Blob): Promise<PhotoType | null> {
  return sniffImage(new Uint8Array(await blob.slice(0, 32).arrayBuffer()));
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** The file to upload: checked, and shrunk when it's big. */
export async function preparePhoto(file: File): Promise<File> {
  const type = await typeOf(file);
  if (!type) throw new Error('That isn’t a photo Lowpass can use (JPEG, PNG, WebP or GIF).');
  if (type === 'image/gif') {
    if (file.size > PHOTO_MAX_BYTES) throw new Error('That photo is too big (8 MB at most).');
    return new File([file], file.name || 'photo.gif', { type });
  }
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('That photo couldn’t be opened.');
  }
  const long = Math.max(bitmap.width, bitmap.height);
  if (long <= LONG_SIDE && file.size <= SHRINK_ABOVE_BYTES) {
    bitmap.close();
    return new File([file], file.name || 'photo', { type });
  }
  const scale = Math.min(1, LONG_SIDE / long);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  // WebP keeps a PNG's transparency and is small; a browser that can't write
  // WebP hands back PNG — then a photo becomes JPEG, a PNG stays PNG.
  let out = await toBlob(canvas, 'image/webp', 0.86);
  let outType = out ? await typeOf(out) : null;
  if (!out || outType !== 'image/webp') {
    out = type === 'image/png' ? await toBlob(canvas, 'image/png', 1) : await toBlob(canvas, 'image/jpeg', 0.86);
    outType = out ? await typeOf(out) : null;
  }
  if (!out || !outType) throw new Error('That photo couldn’t be resized.');
  if (out.size > PHOTO_MAX_BYTES) throw new Error('That photo is too big (8 MB at most).');
  const ext = outType.split('/')[1];
  return new File([out], `${(file.name || 'photo').replace(/\.[^.]+$/, '')}.${ext}`, { type: outType });
}

export interface PhotoApi {
  photoUpload: (type: string, size: number) => Promise<{ bucket: string; path: string; token: string }>;
  photoDone: (path: string) => Promise<{ path: string; url: string | null }>;
}

/** Check → shrink → grant → upload → finish. Resolves to the stored path + a signed URL. */
export async function uploadPhoto(api: PhotoApi, file: File): Promise<{ path: string; url: string | null }> {
  const ready = await preparePhoto(file);
  const grant = await api.photoUpload(ready.type, ready.size);
  await uploadDirect(grant, ready);
  return api.photoDone(grant.path);
}

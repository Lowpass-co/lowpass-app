'use client';

/* ============================================
   LOWPASS — upload a file straight to Storage (browser, Nov 2026)

   The server has already said yes and handed back { bucket, path, token }
   (a one-time signed upload for a path it chose). This sends the bytes:
     · ≤ 6 MB → one request (uploadToSignedUrl);
     · > 6 MB → resumable (TUS, 6 MB chunks — Supabase's required size) to
       /storage/v1/upload/resumable/sign with the token in `x-signature`.
       A dropped connection retries and resumes from the last chunk.
   Resuming is within this upload only: a new attempt gets a new path from
   the server, so an old half-upload is never continued into the wrong place
   (and is swept after 24 h).
   Nothing here talks to a Vercel function, so there's no 4.5 MB ceiling.
   ============================================ */

import * as tus from 'tus-js-client';
import { createClient } from '@/lib/supabase-client';
import { RESUMABLE_ABOVE_BYTES } from './limits';

export interface DirectTarget {
  bucket: string;
  path: string;
  token: string;
}

const CHUNK = 6 * 1024 * 1024;

export function uploadDirect(
  target: DirectTarget,
  file: File,
  opts: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<void> {
  const report = (f: number) => opts.onProgress?.(Math.max(0, Math.min(1, f)));
  if (file.size <= RESUMABLE_ABOVE_BYTES) {
    return createClient()
      .storage.from(target.bucket)
      .uploadToSignedUrl(target.path, target.token, file, { contentType: file.type || undefined })
      .then(({ error }) => {
        if (error) throw new Error(error.message || 'Upload failed');
        report(1);
      });
  }
  return new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable/sign`,
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
        'x-signature': target.token,
      },
      chunkSize: CHUNK,
      // Back off and resume after a drop: ~1.5 minutes of retries in total.
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000, 30000],
      uploadDataDuringCreation: true,
      storeFingerprintForResuming: false,
      metadata: {
        bucketName: target.bucket,
        objectName: target.path,
        contentType: file.type || 'application/octet-stream',
        cacheControl: '3600',
      },
      onProgress: (sent, total) => report(total ? sent / total : 0),
      onSuccess: () => {
        report(1);
        resolve();
      },
      onError: (err) => reject(err instanceof Error ? err : new Error('Upload failed')),
    });
    opts.signal?.addEventListener('abort', () => {
      void upload.abort(true);
      reject(new Error('Upload cancelled'));
    });
    upload.start();
  });
}

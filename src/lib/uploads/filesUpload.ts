'use client';

/* Upload one file into tour / artist Files: ask → send straight to Storage → finish.
   Resolves with the FileVm the canvas prepends; throws an Error with a
   readable message. Checks the size first so nobody waits for a refusal. */

import type { FileVm } from '@/lib/tour-files/types';
import { MAX_UPLOAD_BYTES, tooLargeMessage } from './limits';
import { uploadDirect, type DirectTarget } from './directUpload';

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? `Upload failed (${r.status})`);
  return j;
}

export async function uploadToFiles(args: {
  scope: 'tour' | 'artist';
  scopeId: string;
  folder: string | null;
  file: File;
  onProgress?: (fraction: number) => void;
}): Promise<FileVm> {
  const { scope, scopeId, folder, file } = args;
  if (file.size === 0) throw new Error(`${file.name} is empty`);
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name}: ${tooLargeMessage()}`);
  const target = await post<DirectTarget>('/api/files/upload-url', { scope, scopeId, name: file.name, size: file.size });
  await uploadDirect(target, file, { onProgress: args.onProgress });
  // A finish lost to a blip is safe to repeat — the server records the file once.
  let lastErr: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const { file: vm } = await post<{ file: FileVm }>('/api/files/complete', { scope, scopeId, path: target.path, name: file.name, folder });
      return vm;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Upload failed');
}

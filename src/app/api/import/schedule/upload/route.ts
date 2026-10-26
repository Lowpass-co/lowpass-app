/* ============================================
   LOWPASS — POST /api/import/schedule/upload — where to put a tour book

   Vercel refuses request bodies over 4.5 MB, and tour books are often
   bigger. So the browser uploads each file STRAIGHT to storage with a
   one-time signed URL from here, then asks /api/import/schedule to read it
   by path. Paths are fenced to this workspace's import folder, and the read
   route deletes each file once it has read it.

   Body: { files: [{ name, size, type }] } → { uploads: [{ name, path, token }] }
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { IMPORT_BUCKET, importPrefix } from '@/lib/import/importStorage';

export const dynamic = 'force-dynamic';

const MAX_FILE = 25 * 1024 * 1024;
const MAX_FILES = 10;

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const { workspaceId } = auth;

  let body: { files?: Array<{ name?: string; size?: number; type?: string }> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const files = Array.isArray(body.files) ? body.files : [];
  if (!files.length) return NextResponse.json({ error: 'No files' }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: `At most ${MAX_FILES} files at once.` }, { status: 400 });
  if (files.some((f) => !Number.isFinite(f.size) || (f.size ?? 0) <= 0 || (f.size ?? 0) > MAX_FILE)) {
    return NextResponse.json({ error: 'Each file must be under 25 MB.' }, { status: 400 });
  }

  const svc = createServiceSupabaseClient();
  const batch = crypto.randomUUID();
  const uploads: Array<{ name: string; path: string; token: string }> = [];
  for (const [i, f] of files.entries()) {
    const name = String(f.name ?? `file-${i + 1}`);
    const safe = name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120) || `file-${i + 1}`;
    const path = `${importPrefix(workspaceId)}${batch}/${i}-${safe}`;
    const { data, error } = await svc.storage.from(IMPORT_BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      return NextResponse.json({ error: `Couldn't prepare the upload (${error?.message ?? 'storage'})` }, { status: 500 });
    }
    uploads.push({ name, path, token: data.token });
  }
  return NextResponse.json({ uploads, bucket: IMPORT_BUCKET });
}

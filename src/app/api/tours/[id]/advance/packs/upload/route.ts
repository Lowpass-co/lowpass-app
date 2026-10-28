/* POST /api/tours/[id]/advance/packs/upload — where to put venue info packs.
   The browser uploads each file straight to storage with a one-time signed
   URL (Vercel refuses bodies over 4.5 MB). Paths are fenced to this
   workspace + tour. Packs are kept (a saved pack is reopened later to show
   where an answer came from).
   Body: { files: [{ name, size, type }] } → { uploads: [{ name, path, token }], bucket } */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { MAX_PACK_FILE, MAX_PACK_FILES, MAX_PACK_MB, PACK_BUCKET, packPrefix, safeFileName } from '@/server/advance/packReader';
import { readJson, tourGate } from '@/server/advance/routeGuard';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const gate = await tourGate(supabase, tourId, auth.workspaceId);
  if (gate) return gate;
  const body = await readJson<{ files?: Array<{ name?: unknown; size?: unknown }> }>(request);
  const files = Array.isArray(body?.files) ? body!.files : [];
  if (!files.length) return NextResponse.json({ error: 'No files' }, { status: 400 });
  if (files.length > MAX_PACK_FILES) return NextResponse.json({ error: `At most ${MAX_PACK_FILES} files at once.` }, { status: 400 });
  if (files.some((f) => typeof f.size !== 'number' || f.size <= 0 || f.size > MAX_PACK_FILE)) {
    return NextResponse.json({ error: `Each file must be under ${MAX_PACK_MB} MB.` }, { status: 400 });
  }
  const svc = createServiceSupabaseClient();
  const batch = crypto.randomUUID();
  const uploads: Array<{ name: string; path: string; token: string }> = [];
  for (const [i, f] of files.entries()) {
    const name = typeof f.name === 'string' && f.name ? f.name.slice(0, 200) : `file-${i + 1}`;
    const path = `${packPrefix(auth.workspaceId, tourId)}${batch}/${i}-${safeFileName(name)}`;
    const { data, error } = await svc.storage.from(PACK_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return NextResponse.json({ error: `Couldn’t prepare the upload (${error?.message ?? 'storage'})` }, { status: 500 });
    uploads.push({ name, path, token: data.token });
  }
  return NextResponse.json({ uploads, bucket: PACK_BUCKET });
}

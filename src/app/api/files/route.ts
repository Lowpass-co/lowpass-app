/* ============================================================
   LOWPASS — /api/files (G1-A #2 · tour + artist file uploads)

   The writable side of the Files surfaces. Uploads a file to the `tour-files`
   Storage bucket and records a `file_references` row (the same model the Files
   DataTables read). Scope is polymorphic: linked_to_type = 'tour' | 'artist',
   linked_to_id = the tour/artist id. RLS scopes every read/write to the caller's
   workspace.

   Bucket to create in Supabase Dashboard → Storage (name: `tour-files`, private)
   with the RLS policy shipped in database/migrations/241_tour_files_bucket.sql.

     POST   multipart { file, linked_to_type, linked_to_id }  → { file }
     DELETE ?refId=…                                          → { ok }
   ============================================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const BUCKET = 'tour-files';
const MAX_SIZE = 25 * 1024 * 1024; // 25MB
const ALLOWED_SCOPES = new Set(['tour', 'artist']);

async function getWorkspaceId(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
): Promise<{ workspaceId: string; userId: string } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).maybeSingle();
  const workspaceId = (profile as { workspace_id?: string } | null)?.workspace_id;
  return workspaceId ? { workspaceId, userId: user.id } : null;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const ctx = await getWorkspaceId(supabase);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const linkedToType = (formData.get('linked_to_type') as string | null)?.trim();
  const linkedToId = (formData.get('linked_to_id') as string | null)?.trim();

  if (!file || !linkedToType || !linkedToId) {
    return NextResponse.json({ error: 'Missing file, linked_to_type, or linked_to_id' }, { status: 400 });
  }
  if (!ALLOWED_SCOPES.has(linkedToType)) {
    return NextResponse.json({ error: 'linked_to_type must be tour or artist' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 25MB)' }, { status: 400 });
  }

  const safeName = (file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'file';
  const dot = safeName.lastIndexOf('.');
  const base = dot > 0 ? safeName.slice(0, dot) : safeName;
  const ext = dot > 0 ? safeName.slice(dot + 1) : 'bin';
  const path = `${ctx.workspaceId}/${linkedToType}/${linkedToId}/${base}-${Date.now()}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const up = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (up.error) {
    if (up.error.message?.includes('Bucket not found')) {
      return NextResponse.json(
        { error: `Storage bucket "${BUCKET}" not found. Create it in Supabase Dashboard → Storage.` },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: up.error.message }, { status: 500 });
  }

  const { data: ref, error: refErr } = await supabase
    .from('file_references')
    .insert({
      workspace_id: ctx.workspaceId,
      file_name: file.name || safeName,
      file_type: file.type || null,
      file_size: file.size,
      storage_provider: BUCKET,
      provider_file_id: up.data.path,
      linked_to_type: linkedToType,
      linked_to_id: linkedToId,
    })
    .select('id, file_name, file_type, file_size, storage_provider, provider_file_id, linked_to_type, linked_to_id, created_at')
    .maybeSingle();

  if (refErr || !ref) {
    // Roll back the orphaned object so a failed insert doesn't leave storage litter.
    await supabase.storage.from(BUCKET).remove([up.data.path]);
    return NextResponse.json({ error: refErr?.message ?? 'Could not record the file' }, { status: 500 });
  }

  const r = ref as {
    id: string;
    file_name: string;
    file_type: string | null;
    file_size: number;
    provider_file_id: string;
    linked_to_type: string;
    created_at: string;
  };
  // Shape mirrors FileVm so the client can prepend it without a refetch.
  return NextResponse.json({
    file: {
      id: `ref:${r.id}`,
      source: 'other',
      filename: r.file_name,
      mimeType: r.file_type,
      size: r.file_size,
      uploadedAt: r.created_at,
      uploadedByName: null,
      showId: null,
      personId: null,
      riderPackId: null,
      storageBucket: BUCKET,
      storagePath: r.provider_file_id,
      externalUrl: null,
      previewUrl: null,
      linkedSummary: r.linked_to_type === 'artist' ? 'Artist file' : 'Tour file',
      linkedHref: null,
    },
  });
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabaseClient();
  const ctx = await getWorkspaceId(supabase);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const refId = searchParams.get('refId');
  if (!refId) return NextResponse.json({ error: 'refId is required' }, { status: 400 });

  const { data: row } = await supabase
    .from('file_references')
    .select('id, provider_file_id, storage_provider')
    .eq('id', refId)
    .eq('workspace_id', ctx.workspaceId)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const r = row as { id: string; provider_file_id: string; storage_provider: string };
  if (r.storage_provider === BUCKET && r.provider_file_id) {
    await supabase.storage.from(BUCKET).remove([r.provider_file_id]);
  }
  const { error } = await supabase.from('file_references').delete().eq('id', r.id).eq('workspace_id', ctx.workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

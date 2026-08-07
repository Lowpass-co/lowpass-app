/* ============================================================
   LOWPASS — /api/files (G1-A #2 · tour + artist file uploads
                Files v2 · Drive-style folder canvas)

   The writable side of the Files surfaces. Uploads a file to the `tour-files`
   Storage bucket and records a `file_references` row (the same model the Files
   surfaces read). Scope is polymorphic: linked_to_type = 'tour' | 'artist',
   linked_to_id = the tour/artist id. RLS scopes every read/write to the caller's
   workspace.

   Folders (zero-migration): metadata.folder on the row is a '/'-joined path
   string ("Contracts/2026"). No folders table — a folder exists if a file
   carries it. POST accepts an optional `folder` form field; PATCH lets the
   canvas rename a file or move it between folders.

   Bucket to create in Supabase Dashboard → Storage (name: `tour-files`, private)
   with the RLS policy shipped in database/migrations/241_tour_files_bucket.sql.

     GET    ?linked_to_type=…&linked_to_id=…    → { files: [{ id, file_name, metadata }] }
     POST   multipart { file, linked_to_type, linked_to_id, folder? } → { file }
     PATCH  { id, file_name?, metadata: { folder? } }                 → { ok, file }
     DELETE ?refId=…                                                  → { ok }
   ============================================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
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

/** Normalise a metadata.folder path: '/'-joined non-empty trimmed segments,
    bounded length. Anything else (null, empty, non-string) → null = root. */
function sanitizeFolder(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const parts = raw
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const joined = parts.join('/');
  return joined.length > 512 ? null : joined;
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const ctx = await getWorkspaceId(supabase);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const linkedToType = searchParams.get('linked_to_type')?.trim();
  const linkedToId = searchParams.get('linked_to_id')?.trim();
  if (!linkedToType || !linkedToId) {
    return NextResponse.json({ error: 'linked_to_type and linked_to_id are required' }, { status: 400 });
  }
  if (!ALLOWED_SCOPES.has(linkedToType)) {
    return NextResponse.json({ error: 'linked_to_type must be tour or artist' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('file_references')
    .select('id, file_name, metadata')
    .eq('workspace_id', ctx.workspaceId)
    .eq('linked_to_type', linkedToType)
    .eq('linked_to_id', linkedToId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ files: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const ctx = await getWorkspaceId(supabase);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const linkedToType = (formData.get('linked_to_type') as string | null)?.trim();
  const linkedToId = (formData.get('linked_to_id') as string | null)?.trim();
  const folder = sanitizeFolder(formData.get('folder'));

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
      // Files v2 — uploads land in the folder that was open on the canvas.
      ...(folder ? { metadata: { folder } } : {}),
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

export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const ctx = await getWorkspaceId(supabase);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { id?: string; file_name?: unknown; metadata?: unknown };
  try {
    body = (await request.json()) as { id?: string; file_name?: unknown; metadata?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { data: row } = await supabase
    .from('file_references')
    .select('id, metadata')
    .eq('id', id)
    .eq('workspace_id', ctx.workspaceId)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const current = ((row as { metadata?: Record<string, unknown> | null }).metadata ?? {}) as Record<string, unknown>;
  const updates: { file_name?: string; metadata?: Record<string, unknown> } = {};

  if (body.file_name !== undefined) {
    if (typeof body.file_name !== 'string' || !body.file_name.trim()) {
      return NextResponse.json({ error: 'file_name must be a non-empty string' }, { status: 400 });
    }
    updates.file_name = body.file_name.trim().slice(0, 255);
  }

  if (body.metadata !== undefined) {
    if (typeof body.metadata !== 'object' || body.metadata === null || Array.isArray(body.metadata)) {
      return NextResponse.json({ error: 'metadata must be an object' }, { status: 400 });
    }
    const patch = body.metadata as Record<string, unknown>;
    // Merge — the canvas only manages metadata.folder; other keys survive.
    const next: Record<string, unknown> = { ...current };
    if ('folder' in patch) {
      const folder = sanitizeFolder(patch.folder);
      if (folder) next.folder = folder;
      else delete next.folder; // null / '' / invalid → back to root
    }
    updates.metadata = next;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update — pass file_name and/or metadata' }, { status: 400 });
  }

  const { data: updated, error } = await supabase
    .from('file_references')
    .update(updates)
    .eq('id', id)
    .eq('workspace_id', ctx.workspaceId)
    .select('id, file_name, metadata')
    .maybeSingle();
  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? 'Could not update the file' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, file: updated });
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
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

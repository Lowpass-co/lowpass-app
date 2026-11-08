/* ============================================================
   LOWPASS — /api/files (G1-A #2 · tour + artist file uploads
                Files v2 · Drive-style folder canvas)

   The writable side of the Files surfaces. Uploads go straight from the
   browser to the `tour-files` bucket (POST /api/files/upload-url, then
   /api/files/complete — Nov 2026); this route lists, renames/moves and
   deletes the `file_references` rows the Files surfaces read. Scope is polymorphic: linked_to_type = 'tour' | 'artist',
   linked_to_id = the tour/artist id. RLS scopes every read/write to the caller's
   workspace.

   Folders (zero-migration): metadata.folder on the row is a '/'-joined path
   string ("Contracts/2026"). No folders table — a folder exists if a file
   carries it. /api/files/complete takes an optional `folder`; PATCH lets the
   canvas rename a file or move it between folders.

   Bucket to create in Supabase Dashboard → Storage (name: `tour-files`, private)
   with the RLS policy shipped in database/migrations/241_tour_files_bucket.sql.

     GET    ?linked_to_type=…&linked_to_id=…    → { files: [{ id, file_name, metadata }] }
     PATCH  { id, file_name?, metadata: { folder? } }                 → { ok, file }
     DELETE ?refId=…                                                  → { ok }
   ============================================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
// One copy of the folder rule, shared with file share links.
import { sanitizeFolder } from '@/lib/files/shareLinks';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const BUCKET = 'tour-files';
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

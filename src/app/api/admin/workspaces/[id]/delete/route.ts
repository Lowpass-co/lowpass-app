/* ============================================
   LOWPASS — POST /api/admin/workspaces/[id]/delete (Nov 2026, Adam)

   PERMANENTLY delete a workspace. Site admin only. Body: { confirm_name }.

   1. The database does the delete in one transaction —
      public.admin_delete_workspace (migration 295): the workspace must be
      ARCHIVED first and the name typed exactly; anyone with it active moves
      to another live workspace (or none); everything under it cascades.
      Member ACCOUNTS are kept (Adam).
   2. Then its stored files go (Adam: "delete the files too"): 295's
      admin_workspace_storage_objects lists every object with the workspace's
      id as a folder in its path, in every bucket — it refuses while the
      workspace still exists, so a live workspace's files are never touched —
      and they're removed through the Storage API, a batch at a time.
   3. An audit row, anchored to the admin's own workspace (the deleted one's
      rows went with it).

   (DELETE on /api/admin/workspaces/[id] is ARCHIVE — the soft delete.)
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { adminErrorResponse, createServiceSupabaseAdminClient, requireSiteAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

/** Postgres error code → HTTP status for admin_delete_workspace. */
const STATUS: Record<string, number> = { P0003: 403, P0002: 404, '55000': 409, '22023': 400 };
/** At most this many storage batches (1,000 files each) per request. */
const MAX_BATCHES = 50;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  let actor: { id: string; email: string | null };
  try {
    actor = await requireSiteAdmin(supabase);
  } catch (err) {
    const r = adminErrorResponse(err);
    return NextResponse.json({ error: r.message }, { status: r.status });
  }
  const { id: workspaceId } = await params;
  let body: { confirm_name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const confirmName = typeof body.confirm_name === 'string' ? body.confirm_name : '';
  if (!confirmName.trim()) return NextResponse.json({ error: "Type the workspace's name to confirm" }, { status: 400 });

  // 1. The delete itself (as the signed-in admin — the function checks).
  const { data, error } = await supabase.rpc('admin_delete_workspace', { p_workspace_id: workspaceId, p_confirm_name: confirmName });
  if (error) return NextResponse.json({ error: error.message }, { status: STATUS[error.code ?? ''] ?? 500 });
  const result = (data ?? {}) as { name?: string; members?: number; tours?: number };

  // 2. Its stored files.
  const admin = createServiceSupabaseAdminClient();
  let removed = 0;
  let left = 0;
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { data: objects, error: listErr } = await supabase.rpc('admin_workspace_storage_objects', { p_workspace_id: workspaceId, p_limit: 1000 });
    if (listErr) {
      left = -1; // unknown — couldn't list
      break;
    }
    const rows = (objects ?? []) as Array<{ bucket_id: string; name: string }>;
    if (!rows.length) break;
    const byBucket = new Map<string, string[]>();
    for (const r of rows) byBucket.set(r.bucket_id, [...(byBucket.get(r.bucket_id) ?? []), r.name]);
    let progress = 0;
    for (const [bucket, names] of byBucket) {
      const { data: gone, error: rmErr } = await admin.storage.from(bucket).remove(names);
      if (!rmErr) progress += gone?.length ?? names.length;
    }
    removed += progress;
    if (progress === 0) {
      left = rows.length; // nothing would go — stop rather than loop
      break;
    }
  }

  // 3. Audit.
  const { data: actorProfile } = await supabase.from('profiles').select('workspace_id').eq('id', actor.id).maybeSingle();
  const anchor = (actorProfile as { workspace_id: string | null } | null)?.workspace_id;
  if (anchor) {
    await supabase.from('audit_log').insert({
      workspace_id: anchor,
      actor_user_id: actor.id,
      action: 'deleted',
      entity_type: 'workspace',
      entity_id: workspaceId,
      field_changes: { name: result.name ?? null, members: result.members ?? 0, tours: result.tours ?? 0, files_removed: removed, files_left: left },
    });
  }

  return NextResponse.json({ ok: true, name: result.name, members: result.members, tours: result.tours, files_removed: removed, files_left: left === -1 ? null : left });
}

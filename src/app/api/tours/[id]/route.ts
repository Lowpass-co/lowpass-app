/* ============================================
   LOWPASS — Single Tour API

   GET: Tour by id (with artist)
   PATCH: Update tour
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { data, error } = await supabase
    .from('tours')
    .select(`
      *,
      artist:artists(*)
    `)
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: error?.code === 'PGRST116' ? 404 : 500 });
  }
  return NextResponse.json(data);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const allowed = [
    'artist_id', 'name', 'start_date', 'end_date', 'continent', 'currency',
    'principal_count', 'band_count', 'crew_count', 'status', 'notes',
    'custom_day_types', 'default_advance_template_id',
  ];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('tours')
    .update(updates)
    .eq('id', id)
    .select(`
      *,
      artist:artists(*)
    `)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  const { id } = await params;
  const workspaceId = profile.workspace_id;

  /* ============================================
     Sprint 8.2 §5 — storage cleanup (closes 8.1 deferred #1)

     The DB CASCADE wipes all 22 tour-scoped tables, but Supabase
     Storage objects don't cascade. Enumerate paths from the
     tables that store storage paths directly, then bulk-remove
     before the DB delete.

     Buckets cleaned:
       - rider-assets   ← rider_assets.storage_path (tour_id FK)
       - deal-memos     ← deal_memos.document_url (tour_id FK;
                          stores the path, not the public URL —
                          see /api/deal-memos/[id]/upload)
       - receipts       ← expenses.receipt_url (tour_id FK;
                          stores the path — see /api/expenses)

     Buckets DEFERRED (more complex extraction; tracked for a
     follow-up):
       - budget-files   ← budget_line_item_attachments.file_url
                          stores a full public URL; needs extraction
                          via the `/storage/v1/object/public/<bucket>/`
                          marker pattern.
       - advance-files  ← URLs embedded in advance_instances.data
                          JSON; would need per-field path extraction.

     Failures here are LOGGED but do NOT block the DB delete.
     Orphaned storage objects are recoverable later via admin
     cleanup; a half-deleted tour (DB delete failed after some
     storage cleanup) is much harder to recover, so the DB
     delete must always proceed.
     ============================================ */
  const [
    riderAssetsRes,
    dealMemosRes,
    expensesRes,
  ] = await Promise.all([
    supabase
      .from('rider_assets')
      .select('storage_path')
      .eq('tour_id', id),
    supabase
      .from('deal_memos')
      .select('document_url')
      .eq('tour_id', id),
    supabase
      .from('expenses')
      .select('receipt_url')
      .eq('tour_id', id),
  ]);

  const riderPaths = ((riderAssetsRes.data ?? []) as Array<{
    storage_path: string | null;
  }>)
    .map((r) => r.storage_path)
    .filter((p): p is string => typeof p === 'string' && p.length > 0);

  const dealMemoPaths = ((dealMemosRes.data ?? []) as Array<{
    document_url: string | null;
  }>)
    .map((d) => d.document_url)
    .filter((p): p is string => typeof p === 'string' && p.length > 0);

  const receiptPaths = ((expensesRes.data ?? []) as Array<{
    receipt_url: string | null;
  }>)
    .map((e) => e.receipt_url)
    .filter((p): p is string => typeof p === 'string' && p.length > 0);

  async function cleanBucket(bucket: string, paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    try {
      const { error: rmErr } = await supabase.storage
        .from(bucket)
        .remove(paths);
      if (rmErr) {
        console.error(
          `[delete-tour ${id}] storage.${bucket}.remove failed:`,
          rmErr.message,
        );
      }
    } catch (err) {
      console.error(
        `[delete-tour ${id}] storage.${bucket}.remove threw:`,
        err,
      );
    }
  }

  await Promise.all([
    cleanBucket('rider-assets', riderPaths),
    cleanBucket('deal-memos', dealMemoPaths),
    cleanBucket('receipts', receiptPaths),
  ]);

  // DB delete — cascades through all 22 tour-scoped tables.
  const { data: deleted, error } = await supabase
    .from('tours')
    .delete()
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .select('id');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!deleted?.length) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}

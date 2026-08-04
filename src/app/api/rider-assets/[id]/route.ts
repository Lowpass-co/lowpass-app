/* ============================================
   LOWPASS — Rider asset single row

   GET    /api/rider-assets/[id]  → asset + signedUrl
   PATCH  /api/rider-assets/[id]  → update metadata (whitelist)
   DELETE /api/rider-assets/[id]  → delete metadata row + storage object
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  RIDER_ASSETS_BUCKET,
  signedUrlForAsset,
} from '@/lib/rider-packs/assets';

const ALLOWED_PATCH_FIELDS = new Set<string>([
  'label',
  'scope',
  'tour_id',
  'routing_id',
  'meta',
  // asset_type, storage_path, external_url intentionally NOT editable
  // (create a new asset rather than mutating payload shape)
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const { data: asset, error } = await supabase
    .from('rider_assets')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!asset) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }

  const signedUrl = await signedUrlForAsset(supabase, asset);
  return NextResponse.json({ asset, signedUrl });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body ?? {})) {
    if (ALLOWED_PATCH_FIELDS.has(k)) updates[k] = v;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updatable fields in body' }, { status: 400 });
  }

  // If scope changed, the shape CHECK must still hold; DB will reject otherwise.
  // We don't pre-validate because we don't have the merged final-state here;
  // trust the DB CHECK.

  const { data: updated, error } = await supabase
    .from('rider_assets')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Fetch first so we know the storage_path (if any) to clean up.
  const { data: before } = await supabase
    .from('rider_assets')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!before) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }

  const { error: delErr } = await supabase
    .from('rider_assets')
    .delete()
    .eq('id', id);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 400 });
  }

  // Best-effort: remove storage object. Failure here shouldn't fail the whole request
  // because the metadata row is already gone; log and continue.
  if (before.storage_path) {
    const { error: storageErr } = await supabase.storage
      .from(RIDER_ASSETS_BUCKET)
      .remove([before.storage_path]);
    if (storageErr) {
      console.warn('[rider-assets] storage cleanup failed', {
        assetId: id,
        storagePath: before.storage_path,
        error: storageErr.message,
      });
    }
  }

  return NextResponse.json({ ok: true });
}

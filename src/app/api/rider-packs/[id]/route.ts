/* ============================================
   LOWPASS — Rider/Pack single pack

   GET    /api/rider-packs/[id]   → pack + raw sections (not resolved)
   PATCH  /api/rider-packs/[id]   → update pack metadata (whitelist)
   DELETE /api/rider-packs/[id]   → cascade delete via DB
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { appendHistory } from '@/lib/rider-packs/history';

const ALLOWED_PATCH_FIELDS = new Set<string>([
  'title',
  'google_doc_id',
  'google_doc_url',
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

  const { data: pack, error: packErr } = await supabase
    .from('rider_packs')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (packErr) {
    return NextResponse.json({ error: packErr.message }, { status: 500 });
  }
  if (!pack) {
    return NextResponse.json({ error: 'Pack not found' }, { status: 404 });
  }

  const { data: sections, error: sectErr } = await supabase
    .from('rider_sections')
    .select('*')
    .eq('pack_id', id)
    .order('sort_order');
  if (sectErr) {
    return NextResponse.json({ error: sectErr.message }, { status: 500 });
  }

  return NextResponse.json({ pack, sections: sections ?? [] });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
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

  const { data: before } = await supabase
    .from('rider_packs')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!before) {
    return NextResponse.json({ error: 'Pack not found' }, { status: 404 });
  }

  const { data: updated, error } = await supabase
    .from('rider_packs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'title') && before.folder_id) {
    await supabase.from('rider_folders').update({ title: updated.title }).eq('id', before.folder_id);
  }

  await appendHistory(supabase, {
    packId: id,
    changedBy: user.id,
    changeType: 'pack.updated',
    oldValue: before,
    newValue: updated,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const { data: before } = await supabase
    .from('rider_packs')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!before) {
    return NextResponse.json({ error: 'Pack not found' }, { status: 404 });
  }

  // History row first (FK has ON DELETE CASCADE; we want the snapshot to survive).
  // NB: cascade WILL delete history rows for this pack. This is the tradeoff we
  // accepted in the design — history is 90-day rolling, not forever. If a pack
  // is deleted, its audit goes with it.
  if (!before.folder_id) {
    return NextResponse.json({ error: 'Pack has no folder' }, { status: 500 });
  }

  const { error } = await supabase.from('rider_folders').delete().eq('id', before.folder_id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

/* ============================================
   LOWPASS — Rider section single row

   PATCH  /api/rider-packs/[id]/sections/[sectionId]
   DELETE /api/rider-packs/[id]/sections/[sectionId]
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { appendHistory } from '@/lib/rider-packs/history';

const ALLOWED_SECTION_FIELDS = new Set<string>([
  'title',
  'sort_order',
  'fields',
  'section_key', // allow rename (e.g. user renames 'technical' -> 'technical_audio')
  'section_type',
  /* Sprint 12 §9a — free-shaped per-section JSONB. Holds
     Tiptap content for rich_text sections, summary rows for
     advance_summary sections, and inventory notes for
     channel_list sections (the latter wired in a follow-up
     after §9 core). */
  'metadata',
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; sectionId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: packId, sectionId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body ?? {})) {
    if (ALLOWED_SECTION_FIELDS.has(k)) updates[k] = v;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updatable fields in body' }, { status: 400 });
  }

  const { data: before } = await supabase
    .from('rider_sections')
    .select('*')
    .eq('id', sectionId)
    .eq('pack_id', packId)
    .maybeSingle();
  if (!before) {
    return NextResponse.json({ error: 'Section not found' }, { status: 404 });
  }

  const { data: updated, error } = await supabase
    .from('rider_sections')
    .update(updates)
    .eq('id', sectionId)
    .eq('pack_id', packId)
    .select()
    .single();
  if (error) {
    const status = error.code === '23505' ? 409 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  await appendHistory(supabase, {
    packId,
    changedBy: user.id,
    changeType: 'section.updated',
    sectionKey: updated.section_key,
    oldValue: before,
    newValue: updated,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; sectionId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: packId, sectionId } = await params;

  const { data: before } = await supabase
    .from('rider_sections')
    .select('*')
    .eq('id', sectionId)
    .eq('pack_id', packId)
    .maybeSingle();
  if (!before) {
    return NextResponse.json({ error: 'Section not found' }, { status: 404 });
  }

  const { error } = await supabase
    .from('rider_sections')
    .delete()
    .eq('id', sectionId)
    .eq('pack_id', packId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await appendHistory(supabase, {
    packId,
    changedBy: user.id,
    changeType: 'section.removed',
    sectionKey: before.section_key,
    oldValue: before,
  });

  return NextResponse.json({ ok: true });
}

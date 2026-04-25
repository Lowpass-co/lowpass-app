/* ============================================
   LOWPASS — Rider sections collection

   GET  /api/rider-packs/[id]/sections    raw (not resolved)
   POST /api/rider-packs/[id]/sections    body: { section_key, title,
                                                  sort_order?, fields? }
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { appendHistory } from '@/lib/rider-packs/history';

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

  // RLS will return [] if the pack isn't visible; 404 the pack explicitly for clarity.
  const { data: pack } = await supabase
    .from('rider_packs')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (!pack) {
    return NextResponse.json({ error: 'Pack not found' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('rider_sections')
    .select('*')
    .eq('pack_id', id)
    .order('sort_order');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ sections: data ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: packId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const sectionKey = body.section_key as string | undefined;
  const title = body.title as string | undefined;
  const sortOrder =
    typeof body.sort_order === 'number' ? (body.sort_order as number) : 0;
  const fields = Array.isArray(body.fields) ? body.fields : [];
  const sectionType =
    body.section_type === 'channel_list'
      ? 'channel_list'
      : 'fields';

  if (!sectionKey || typeof sectionKey !== 'string') {
    return NextResponse.json({ error: 'section_key is required' }, { status: 400 });
  }
  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  const { data: pack } = await supabase
    .from('rider_packs')
    .select('id')
    .eq('id', packId)
    .maybeSingle();
  if (!pack) {
    return NextResponse.json({ error: 'Pack not found' }, { status: 404 });
  }

  const { data: inserted, error } = await supabase
    .from('rider_sections')
    .insert({
      pack_id: packId,
      section_key: sectionKey,
      title,
      sort_order: sortOrder,
      fields,
      section_type: sectionType,
    })
    .select()
    .single();
  if (error) {
    const status = error.code === '23505' ? 409 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  if (sectionType === 'channel_list' && inserted?.id) {
    const sectionId = inserted.id as string;
    const count = 16;
    const batch = Array.from({ length: count }, (_, i) => ({
      pack_id: packId,
      section_id: sectionId,
      row_index: i + 1,
    }));
    const { error: rowErr } = await supabase.from('channel_list_rows').insert(batch);
    if (rowErr) {
      return NextResponse.json(
        { error: `Section created but channel rows failed: ${rowErr.message}` },
        { status: 500 },
      );
    }
  }

  await appendHistory(supabase, {
    packId,
    changedBy: user.id,
    changeType: 'section.added',
    sectionKey: sectionKey,
    newValue: inserted,
  });

  return NextResponse.json(inserted, { status: 201 });
}

/* ============================================
   POST /api/rider-packs/clone

   Deep-clone a pack into a new artist-level rider in the same workspace
   (used for "import" from another band). Copies sections, channel list
   rows, sub-snakes, and stage I/O with remapped references.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { appendHistory } from '@/lib/rider-packs/history';
import { isRiderFoldersMissingError, RIDER_FOLDERS_SETUP_MESSAGE } from '@/lib/rider-packs/schema-errors';

type SectionRow = {
  id: string;
  pack_id: string;
  section_key: string;
  title: string;
  sort_order: number;
  fields: unknown;
  section_type?: string;
};

type SubSnakeRow = {
  id: string;
  pack_id: string;
  section_id: string;
  label: string;
  colour: string;
  capacity?: number;
  position: number;
};

type StageBoxRow = {
  id: string;
  pack_id: string;
  section_id: string;
  label: string;
  colour: string;
  capacity?: number;
  position: number;
};

type ChannelListRow = {
  id: string;
  pack_id: string;
  section_id: string;
  row_index: number;
  channel_name: string;
  sub_snake_id: string | null;
  sub_snake_position: number | null;
  stage_box_id: string | null;
  stage_box_position: number | null;
  position: string;
  mic: string;
  mic_substitute: string;
  di: string;
  stand: string;
  phantom_power: boolean | null;
  provider: string | null;
  notes: string;
  // Clone-bug fix — output-row columns from migrations 098 + 115 that the clone
  // previously dropped (so artist→artist copies lost every output row's data,
  // and row_kind defaulted to 'input' → output rows silently became inputs).
  row_kind: string | null;
  output_item: string | null;
  output_destination: string | null;
  output_qty: number | null;
  output_notes: string | null;
  cable_length: string | null;
  output_description: string | null;
  output_is_stereo: boolean | null;
  output_position: string | null;
};

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { source_pack_id?: string; target_artist_id?: string; title?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const sourcePackId = body.source_pack_id;
  const targetArtistId = body.target_artist_id;
  if (!sourcePackId || !targetArtistId) {
    return NextResponse.json(
      { error: 'source_pack_id and target_artist_id are required' },
      { status: 400 },
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }
  const ws = profile.workspace_id;

  const { data: source, error: srcErr } = await supabase
    .from('rider_packs')
    .select('id, workspace_id, title, scope, artist_id, tour_id, routing_id, folder_id')
    .eq('id', sourcePackId)
    .maybeSingle();
  if (srcErr) {
    return NextResponse.json({ error: srcErr.message }, { status: 500 });
  }
  if (!source || source.workspace_id !== ws) {
    return NextResponse.json({ error: 'Source pack not found' }, { status: 404 });
  }

  const { data: targetArtist, error: artErr } = await supabase
    .from('artists')
    .select('id, name')
    .eq('id', targetArtistId)
    .eq('workspace_id', ws)
    .maybeSingle();
  if (artErr) {
    return NextResponse.json({ error: artErr.message }, { status: 500 });
  }
  if (!targetArtist) {
    return NextResponse.json({ error: 'Target artist not found' }, { status: 404 });
  }

  const newTitle =
    (typeof body.title === 'string' && body.title.trim()
      ? body.title.trim()
      : `${(source.title && String(source.title).trim()) || 'Rider'} (imported)`) as string;

  const { data: folder, error: folderError } = await supabase
    .from('rider_folders')
    .insert({
      workspace_id: ws,
      artist_id: targetArtistId,
      scope: 'artist',
      tour_id: null,
      routing_id: null,
      title: newTitle,
      inherit_from_folder_id: null,
    })
    .select()
    .single();

  if (folderError) {
    if (isRiderFoldersMissingError(folderError.message)) {
      return NextResponse.json(
        { error: RIDER_FOLDERS_SETUP_MESSAGE, code: 'MIGRATION_REQUIRED' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: folderError.message }, { status: 400 });
  }

  const { data: newPack, error: packError } = await supabase
    .from('rider_packs')
    .insert({
      workspace_id: ws,
      folder_id: folder.id,
      scope: 'artist',
      artist_id: targetArtistId,
      tour_id: null,
      routing_id: null,
      title: newTitle,
      created_by: user.id,
    })
    .select('*')
    .single();

  if (packError) {
    await supabase.from('rider_folders').delete().eq('id', folder.id);
    return NextResponse.json({ error: packError.message }, { status: 400 });
  }

  const newPackId = newPack.id;
  const createdFolderId = folder.id;
  let rolledBack = false;

  async function rollback() {
    if (rolledBack) return;
    rolledBack = true;
    await supabase.from('rider_folders').delete().eq('id', createdFolderId);
  }

  const { data: sourceSections, error: secQErr } = await supabase
    .from('rider_sections')
    .select('id, pack_id, section_key, title, sort_order, fields, section_type')
    .eq('pack_id', sourcePackId)
    .order('sort_order');

  if (secQErr) {
    await rollback();
    return NextResponse.json({ error: secQErr.message }, { status: 500 });
  }

  const sectionIdMap = new Map<string, string>();
  for (const s of (sourceSections ?? []) as SectionRow[]) {
    const { data: ins, error: insErr } = await supabase
      .from('rider_sections')
      .insert({
        pack_id: newPackId,
        section_key: s.section_key,
        title: s.title,
        sort_order: s.sort_order,
        fields: s.fields ?? [],
        section_type: s.section_type === 'channel_list' ? 'channel_list' : 'fields',
      })
      .select('id')
      .single();
    if (insErr || !ins) {
      await rollback();
      return NextResponse.json({ error: insErr?.message ?? 'Failed to copy section' }, { status: 500 });
    }
    sectionIdMap.set(s.id, ins.id);
  }

  const { data: oldSnakes, error: snakeQErr } = await supabase
    .from('sub_snakes')
    .select('id, pack_id, section_id, label, colour, position')
    .eq('pack_id', sourcePackId);

  const skipSnakes =
    snakeQErr && /relation|does not exist|schema cache/i.test(snakeQErr.message);
  if (snakeQErr && !skipSnakes) {
    await rollback();
    return NextResponse.json({ error: snakeQErr.message }, { status: 500 });
  }

  const subSnakeIdMap = new Map<string, string>();
  for (const sn of (skipSnakes ? [] : oldSnakes ?? []) as SubSnakeRow[]) {
    const newSec = sectionIdMap.get(sn.section_id);
    if (!newSec) continue;
    const { data: nSn, error: snErr } = await supabase
      .from('sub_snakes')
      .insert({
        pack_id: newPackId,
        section_id: newSec,
        label: sn.label,
        colour: sn.colour,
        position: sn.position,
        capacity: sn.capacity ?? 8,
      })
      .select('id')
      .single();
    if (snErr || !nSn) {
      await rollback();
      return NextResponse.json({ error: snErr?.message ?? 'Failed to copy sub-snake' }, { status: 500 });
    }
    subSnakeIdMap.set(sn.id, nSn.id);
  }

  const stageBoxIdMap = new Map<string, string>();
  const { data: oldStage, error: stQErr } = await supabase
    .from('stage_boxes')
    .select('id, pack_id, section_id, label, colour, capacity, position')
    .eq('pack_id', sourcePackId);

  if (stQErr) {
    if (!/relation|does not exist|schema cache/i.test(stQErr.message)) {
      await rollback();
      return NextResponse.json({ error: stQErr.message }, { status: 500 });
    }
  } else {
    for (const st of (oldStage ?? []) as StageBoxRow[]) {
      const newSec = sectionIdMap.get(st.section_id);
      if (!newSec) continue;
      const { data: nSt, error: stInsErr } = await supabase
        .from('stage_boxes')
        .insert({
          pack_id: newPackId,
          section_id: newSec,
          label: st.label,
          colour: st.colour,
          position: st.position,
          capacity: st.capacity ?? 16,
        })
        .select('id')
        .single();
      if (stInsErr || !nSt) {
        if (stInsErr && /relation|does not exist|schema cache/i.test(stInsErr.message)) {
          break;
        }
        await rollback();
        return NextResponse.json(
          { error: stInsErr?.message ?? 'Failed to copy stage box' },
          { status: 500 },
        );
      }
      stageBoxIdMap.set(st.id, nSt.id);
    }
  }

  const { data: oldRows, error: rowQErr } = await supabase
    .from('channel_list_rows')
    .select(
      'id, pack_id, section_id, row_index, channel_name, sub_snake_id, sub_snake_position, stage_box_id, stage_box_position, position, mic, mic_substitute, di, stand, phantom_power, provider, notes, row_kind, output_item, output_destination, output_qty, output_notes, cable_length, output_description, output_is_stereo, output_position',
    )
    .eq('pack_id', sourcePackId);

  const skipChannelRows = rowQErr && /relation|does not exist|schema cache/i.test(rowQErr.message);
  if (rowQErr && !skipChannelRows) {
    await rollback();
    return NextResponse.json({ error: rowQErr.message }, { status: 500 });
  }

  for (const r of (skipChannelRows ? [] : oldRows ?? []) as ChannelListRow[]) {
    const newSec = sectionIdMap.get(r.section_id);
    if (!newSec) continue;
    const mappedSub =
      r.sub_snake_id == null ? null : subSnakeIdMap.get(r.sub_snake_id) ?? null;
    const mappedBox =
      r.stage_box_id == null ? null : stageBoxIdMap.get(r.stage_box_id) ?? null;
    const { error: rowIns } = await supabase.from('channel_list_rows').insert({
      pack_id: newPackId,
      section_id: newSec,
      row_index: r.row_index,
      channel_name: r.channel_name,
      sub_snake_id: mappedSub,
      sub_snake_position: mappedSub ? r.sub_snake_position : null,
      stage_box_id: mappedBox,
      stage_box_position: mappedBox ? r.stage_box_position : null,
      position: r.position,
      mic: r.mic,
      mic_substitute: r.mic_substitute,
      di: r.di,
      stand: r.stand,
      phantom_power: r.phantom_power,
      provider: r.provider,
      notes: r.notes,
      // Clone-bug fix — carry the output-row columns (098 + 115) so an
      // artist→artist copy keeps its output rows, cable lengths, and stereo
      // flags instead of dropping them / demoting outputs to inputs.
      row_kind: r.row_kind ?? 'input',
      output_item: r.output_item,
      output_destination: r.output_destination,
      output_qty: r.output_qty,
      output_notes: r.output_notes,
      cable_length: r.cable_length,
      output_description: r.output_description,
      output_is_stereo: r.output_is_stereo ?? false,
      output_position: r.output_position,
    });
    if (rowIns) {
      if (/relation|does not exist|schema cache/i.test(rowIns.message)) {
        break;
      }
      await rollback();
      return NextResponse.json({ error: rowIns.message }, { status: 500 });
    }
  }

  await appendHistory(supabase, {
    packId: newPackId,
    changedBy: user.id,
    changeType: 'pack.created',
    newValue: { imported_from_pack_id: sourcePackId, target_artist_id: targetArtistId },
  });

  return NextResponse.json({ pack: newPack, artist: targetArtist }, { status: 201 });
}

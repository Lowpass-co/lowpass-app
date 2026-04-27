import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChannelListRow, StageBox, SubSnake } from './types';

type RowPatch = Partial<
  Pick<
    ChannelListRow,
    | 'channel_name'
    | 'sub_snake_id'
    | 'sub_snake_position'
    | 'stage_box_id'
    | 'stage_box_position'
    | 'position'
    | 'gear_id'
    | 'mic'
    | 'mic_substitute'
    | 'di'
    | 'stand'
    | 'phantom_power'
    | 'provider'
    | 'notes'
  >
>;

export async function listSubSnakes(supabase: SupabaseClient, sectionId: string): Promise<SubSnake[]> {
  const { data, error } = await supabase
    .from('sub_snakes')
    .select('*')
    .eq('section_id', sectionId)
    .order('position', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SubSnake[];
}

export async function createSubSnake(
  supabase: SupabaseClient,
  args: { packId: string; sectionId: string; label: string; colour: string; capacity?: number },
): Promise<SubSnake> {
  const { data: existing } = await supabase
    .from('sub_snakes')
    .select('position')
    .eq('section_id', args.sectionId);
  const nextPos = existing?.length ? Math.max(...existing.map((r) => r.position)) + 1 : 0;
  const { data, error } = await supabase
    .from('sub_snakes')
    .insert({
      pack_id: args.packId,
      section_id: args.sectionId,
      label: args.label,
      colour: args.colour,
      position: nextPos,
      capacity: args.capacity ?? 8,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as SubSnake;
}

type SubSnakePatch = Partial<Pick<SubSnake, 'label' | 'colour' | 'position' | 'capacity'>>;

export async function updateSubSnake(
  supabase: SupabaseClient,
  id: string,
  patch: SubSnakePatch,
): Promise<void> {
  const { error } = await supabase.from('sub_snakes').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteSubSnake(supabase: SupabaseClient, id: string): Promise<void> {
  const { error: e2 } = await supabase.from('sub_snakes').delete().eq('id', id);
  if (e2) throw new Error(e2.message);
}

export async function listStageBoxes(supabase: SupabaseClient, sectionId: string): Promise<StageBox[]> {
  const { data, error } = await supabase
    .from('stage_boxes')
    .select('*')
    .eq('section_id', sectionId)
    .order('position', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as StageBox[];
}

export async function createStageBox(
  supabase: SupabaseClient,
  args: { packId: string; sectionId: string; label: string; colour: string; capacity?: number },
): Promise<StageBox> {
  const { data: existing } = await supabase
    .from('stage_boxes')
    .select('position')
    .eq('section_id', args.sectionId);
  const nextPos = existing?.length ? Math.max(...existing.map((r) => r.position)) + 1 : 0;
  const { data, error } = await supabase
    .from('stage_boxes')
    .insert({
      pack_id: args.packId,
      section_id: args.sectionId,
      label: args.label,
      colour: args.colour,
      position: nextPos,
      capacity: args.capacity ?? 16,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as StageBox;
}

type StageBoxPatch = Partial<Pick<StageBox, 'label' | 'colour' | 'position' | 'capacity'>>;

export async function updateStageBox(
  supabase: SupabaseClient,
  id: string,
  patch: StageBoxPatch,
): Promise<void> {
  const { error } = await supabase.from('stage_boxes').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteStageBox(supabase: SupabaseClient, id: string): Promise<void> {
  const { error: e2 } = await supabase.from('stage_boxes').delete().eq('id', id);
  if (e2) throw new Error(e2.message);
}

/** Rows using this sub-snake with position strictly greater than `maxPosition`. */
export async function listChannelRowsSubSnakeAbovePosition(
  supabase: SupabaseClient,
  subSnakeId: string,
  maxPosition: number,
): Promise<Pick<ChannelListRow, 'id' | 'row_index' | 'channel_name' | 'sub_snake_position'>[]> {
  const { data, error } = await supabase
    .from('channel_list_rows')
    .select('id, row_index, channel_name, sub_snake_position')
    .eq('sub_snake_id', subSnakeId)
    .not('sub_snake_position', 'is', null)
    .gt('sub_snake_position', maxPosition);
  if (error) throw new Error(error.message);
  return (data ?? []) as Pick<ChannelListRow, 'id' | 'row_index' | 'channel_name' | 'sub_snake_position'>[];
}

export async function clearSubSnakePositionsAbove(
  supabase: SupabaseClient,
  subSnakeId: string,
  maxPosition: number,
): Promise<void> {
  const { error } = await supabase
    .from('channel_list_rows')
    .update({ sub_snake_id: null, sub_snake_position: null })
    .eq('sub_snake_id', subSnakeId)
    .not('sub_snake_position', 'is', null)
    .gt('sub_snake_position', maxPosition);
  if (error) throw new Error(error.message);
}

export async function listChannelRowsStageBoxAbovePosition(
  supabase: SupabaseClient,
  stageBoxId: string,
  maxPosition: number,
): Promise<Pick<ChannelListRow, 'id' | 'row_index' | 'channel_name' | 'stage_box_position'>[]> {
  const { data, error } = await supabase
    .from('channel_list_rows')
    .select('id, row_index, channel_name, stage_box_position')
    .eq('stage_box_id', stageBoxId)
    .not('stage_box_position', 'is', null)
    .gt('stage_box_position', maxPosition);
  if (error) throw new Error(error.message);
  return (data ?? []) as Pick<ChannelListRow, 'id' | 'row_index' | 'channel_name' | 'stage_box_position'>[];
}

export async function clearStageBoxPositionsAbove(
  supabase: SupabaseClient,
  stageBoxId: string,
  maxPosition: number,
): Promise<void> {
  const { error } = await supabase
    .from('channel_list_rows')
    .update({ stage_box_id: null, stage_box_position: null })
    .eq('stage_box_id', stageBoxId)
    .not('stage_box_position', 'is', null)
    .gt('stage_box_position', maxPosition);
  if (error) throw new Error(error.message);
}

export async function listRows(supabase: SupabaseClient, sectionId: string): Promise<ChannelListRow[]> {
  const { data, error } = await supabase
    .from('channel_list_rows')
    .select('*')
    .eq('section_id', sectionId)
    .order('row_index', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ChannelListRow[];
}

export async function appendRow(
  supabase: SupabaseClient,
  args: { packId: string; sectionId: string },
): Promise<ChannelListRow> {
  const { data: existing } = await supabase
    .from('channel_list_rows')
    .select('row_index')
    .eq('section_id', args.sectionId);
  const next =
    existing && existing.length > 0 ? Math.max(...existing.map((r) => r.row_index)) + 1 : 1;
  const { data, error } = await supabase
    .from('channel_list_rows')
    .insert({
      pack_id: args.packId,
      section_id: args.sectionId,
      row_index: next,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as ChannelListRow;
}

export async function updateRow(
  supabase: SupabaseClient,
  id: string,
  patch: RowPatch,
): Promise<void> {
  const { error } = await supabase.from('channel_list_rows').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteRow(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('channel_list_rows').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Reassigns row_index to 1..N in one round-trip. Implemented via Postgres RPC
 * `reorder_channel_list_rows` (see migration 040) so the reorder is atomic.
 */
export async function reorderRows(
  supabase: SupabaseClient,
  sectionId: string,
  orderedIds: string[],
): Promise<void> {
  const { error } = await supabase.rpc('reorder_channel_list_rows', {
    p_section_id: sectionId,
    p_ordered_ids: orderedIds,
  });
  if (error) throw new Error(error.message);
}

export async function duplicateRow(
  supabase: SupabaseClient,
  sourceId: string,
  sectionId: string,
  packId: string,
): Promise<ChannelListRow> {
  const { data: src, error: e0 } = await supabase
    .from('channel_list_rows')
    .select('*')
    .eq('id', sourceId)
    .maybeSingle();
  if (e0) throw new Error(e0.message);
  if (!src) throw new Error('Row not found');
  const all = await listRows(supabase, sectionId);
  const idx = all.findIndex((r) => r.id === sourceId);
  if (idx === -1) throw new Error('Row not in section');
  const nextIdx = all.length > 0 ? Math.max(...all.map((r) => r.row_index)) + 1 : 1;
  const s = src as ChannelListRow;
  const { data: inserted, error: e1 } = await supabase
    .from('channel_list_rows')
    .insert({
      pack_id: packId,
      section_id: sectionId,
      row_index: nextIdx,
      channel_name: s.channel_name,
      sub_snake_id: null,
      sub_snake_position: null,
      stage_box_id: null,
      stage_box_position: null,
      position: s.position,
      gear_id: s.gear_id,
      mic: s.mic,
      mic_substitute: s.mic_substitute,
      di: s.di,
      stand: s.stand,
      phantom_power: s.phantom_power,
      provider: s.provider,
      notes: s.notes,
    })
    .select('*')
    .single();
  if (e1) throw new Error(e1.message);
  const newId = (inserted as ChannelListRow).id;
  const order = [...all.slice(0, idx + 1).map((r) => r.id), newId, ...all.slice(idx + 1).map((r) => r.id)];
  await reorderRows(supabase, sectionId, order);
  const { data: out, error: e2 } = await supabase
    .from('channel_list_rows')
    .select('*')
    .eq('id', newId)
    .single();
  if (e2) throw new Error(e2.message);
  return out as ChannelListRow;
}

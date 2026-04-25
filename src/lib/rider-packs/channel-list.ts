import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChannelListRow, SectionStageIO, SubSnake } from './types';

type RowPatch = Partial<
  Pick<
    ChannelListRow,
    | 'channel_name'
    | 'sub_snake_id'
    | 'stage_io_id'
    | 'stage_box'
    | 'position'
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
  args: { packId: string; sectionId: string; label: string; colour: string },
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
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as SubSnake;
}

type SubSnakePatch = Partial<Pick<SubSnake, 'label' | 'colour' | 'position'>>;

export async function updateSubSnake(
  supabase: SupabaseClient,
  id: string,
  patch: SubSnakePatch,
): Promise<void> {
  const { error } = await supabase.from('sub_snakes').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteSubSnake(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('sub_snakes').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function listStageIO(supabase: SupabaseClient, sectionId: string): Promise<SectionStageIO[]> {
  const { data, error } = await supabase
    .from('section_stage_io')
    .select('*')
    .eq('section_id', sectionId)
    .order('position', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SectionStageIO[];
}

export async function createStageIO(
  supabase: SupabaseClient,
  args: { packId: string; sectionId: string; label: string; colour: string },
): Promise<SectionStageIO> {
  const { data: existing } = await supabase
    .from('section_stage_io')
    .select('position')
    .eq('section_id', args.sectionId);
  const nextPos = existing?.length ? Math.max(...existing.map((r) => r.position)) + 1 : 0;
  const { data, error } = await supabase
    .from('section_stage_io')
    .insert({
      pack_id: args.packId,
      section_id: args.sectionId,
      label: args.label,
      colour: args.colour,
      position: nextPos,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as SectionStageIO;
}

type StageIoPatch = Partial<Pick<SectionStageIO, 'label' | 'colour' | 'position'>>;

export async function updateStageIO(
  supabase: SupabaseClient,
  id: string,
  patch: StageIoPatch,
): Promise<void> {
  const { error } = await supabase.from('section_stage_io').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteStageIO(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('section_stage_io').delete().eq('id', id);
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
  const { data: inserted, error: e1 } = await supabase
    .from('channel_list_rows')
    .insert({
      pack_id: packId,
      section_id: sectionId,
      row_index: nextIdx,
      channel_name: src.channel_name,
      sub_snake_id: src.sub_snake_id,
      stage_box: src.stage_box,
      position: src.position,
      mic: src.mic,
      mic_substitute: src.mic_substitute,
      di: src.di,
      stand: src.stand,
      stage_io_id: src.stage_io_id ?? null,
      phantom_power: src.phantom_power,
      provider: src.provider,
      notes: src.notes,
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

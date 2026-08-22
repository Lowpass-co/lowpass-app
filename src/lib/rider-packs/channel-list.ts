import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChannelListRow, StageBox, SubSnake } from './types';
import { nextFreeRowIndex, rowKindOf } from '@/lib/channel-list/rowNumbering';

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
    | 'gain'
    | 'stand'
    | 'phantom_power'
    | 'provider'
    | 'notes'
    /* Sprint 12 §8 — input rows can now carry a cable_length
       (feeds the Cables inventory aggregate). Output rows use
       the output_* fields below. row_kind is settable when
       converting a row's type but defaults at the schema
       level so most callers ignore it. */
    | 'cable_length'
    | 'row_kind'
    | 'output_item'
    | 'output_destination'
    | 'output_qty'
    | 'output_notes'
    /* §CL-FIX-7 — outputs v2: DESCRIPTION + stereo + POSITION. */
    | 'output_description'
    | 'output_is_stereo'
    | 'output_position'
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

/* §CL-1 — the numbering invariant, server-side.
   `normalise_channel_list_indexes` (migration 267) renumbers a
   section so input rows read 1..N and output rows read 1..M, and it
   is the ONLY thing allowed to decide a row_index. Every writer
   below calls it after its structural change; the optimistic local
   copy is computed by normaliseRowIndexes() in
   src/lib/channel-list/rowNumbering.ts, which implements the same
   ordering rule. Two implementations, one rule, kept in step by
   rowNumbering.test.tsx and the comment at the top of both files.

   `orderedIds` is an explicit ordering (the drag result); rows not
   named in it keep their relative order and follow. Ids of the
   wrong kind, or of rows that are not in the section, are ignored —
   so a stale drag payload can renumber nothing it should not. */
export async function normaliseSectionIndexes(
  supabase: SupabaseClient,
  sectionId: string,
  orderedIds: string[] = [],
): Promise<void> {
  const { error } = await supabase.rpc('normalise_channel_list_indexes', {
    p_section_id: sectionId,
    p_ordered_ids: orderedIds,
  });
  if (error) throw new Error(error.message);
}

/* §CL-1 — what an append hands back.

   `rows` is the WHOLE section, re-read after normalise. It is not a
   convenience: normalising can renumber rows the caller never
   touched (that is the point — it closes pre-existing gaps), so a
   caller that merged only `created` into its local state would show
   the operator numbers the database no longer holds. Returning the
   section makes the correct local update the only available one. */
export type AppendResult = {
  created: ChannelListRow[];
  rows: ChannelListRow[];
};

/** row_index values already taken by `kind` in this section. */
async function kindRowIndexes(
  supabase: SupabaseClient,
  sectionId: string,
  kind: 'input' | 'output',
): Promise<{ row_index: number; row_kind: string | null }[]> {
  const q = supabase.from('channel_list_rows').select('row_index, row_kind').eq('section_id', sectionId);
  const { data, error } =
    kind === 'output' ? await q.eq('row_kind', 'output') : await q.or('row_kind.is.null,row_kind.eq.input');
  if (error) throw new Error(error.message);
  return (data ?? []) as { row_index: number; row_kind: string | null }[];
}

export async function appendRow(
  supabase: SupabaseClient,
  args: { packId: string; sectionId: string },
): Promise<AppendResult> {
  /* §CL-1 — insert at a guaranteed-free index, then normalise. The
     old MAX(row_index)+1 was the whole append story, so a section
     that already read 1,2,5,6 grew to 1,2,5,6,7 and the gap became
     permanent. Now the max is only a collision-free landing spot;
     normaliseSectionIndexes decides the real number. */
  const taken = await kindRowIndexes(supabase, args.sectionId, 'input');
  const { data, error } = await supabase
    .from('channel_list_rows')
    .insert({
      pack_id: args.packId,
      section_id: args.sectionId,
      row_index: nextFreeRowIndex(taken.map((r) => ({ id: '', ...r })), 'input'),
      row_kind: 'input',
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  const id = (data as ChannelListRow).id;
  await normaliseSectionIndexes(supabase, args.sectionId);
  const rows = await listRows(supabase, args.sectionId);
  return { created: rows.filter((r) => r.id === id), rows };
}

/* §CL-FIX-4 — bulk-append N blank INPUT rows in ONE round-trip.
   Supabase .insert() takes an array, so a 32-channel festival
   list is a single network call instead of 32. row_index
   continues sequentially after the section's current max
   (UNIQUE (section_id, row_index) holds for a single editor).
   Count is clamped to 1..64. */
export async function appendRows(
  supabase: SupabaseClient,
  args: { packId: string; sectionId: string; count: number },
): Promise<AppendResult> {
  const count = Math.max(1, Math.min(64, Math.floor(args.count)));
  const taken = await kindRowIndexes(supabase, args.sectionId, 'input');
  const start = nextFreeRowIndex(taken.map((r) => ({ id: '', ...r })), 'input');
  const payload = Array.from({ length: count }, (_, i) => ({
    pack_id: args.packId,
    section_id: args.sectionId,
    row_index: start + i,
    row_kind: 'input',
  }));
  const { data, error } = await supabase.from('channel_list_rows').insert(payload).select('*');
  if (error) throw new Error(error.message);
  /* §CL-1 — as appendRow: the insert indexes are only collision-free
     landing spots, normalise assigns the numbers the operator sees. */
  const ids = new Set(((data ?? []) as ChannelListRow[]).map((r) => r.id));
  await normaliseSectionIndexes(supabase, args.sectionId);
  const rows = await listRows(supabase, args.sectionId);
  return { created: rows.filter((r) => ids.has(r.id)), rows };
}

/* Sprint 12 §8 — append an OUTPUT row. row_kind='output' so
   the editor renders it in the outputs sub-grid alongside
   IEM mixes / drive lines / send loops. Input-only columns
   stay at their defaults (mic='', stand='', etc.) and are
   ignored by the output UI.

   row_index is shared across the section (inputs and outputs
   compete for the same sequence) so the UNIQUE (section_id,
   row_index) constraint still holds. The editor renders the
   two kinds in stacked sub-tables but the underlying ordering
   is one stream. */
export async function appendOutputRow(
  supabase: SupabaseClient,
  args: { packId: string; sectionId: string },
): Promise<AppendResult> {
  /* §CL-FIX-7 — outputs number from 1 independently of inputs.
     §CL-1 — free landing spot, then normalise. */
  const taken = await kindRowIndexes(supabase, args.sectionId, 'output');
  const { data, error } = await supabase
    .from('channel_list_rows')
    .insert({
      pack_id: args.packId,
      section_id: args.sectionId,
      row_index: nextFreeRowIndex(taken.map((r) => ({ id: '', ...r })), 'output'),
      row_kind: 'output',
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  const id = (data as ChannelListRow).id;
  await normaliseSectionIndexes(supabase, args.sectionId);
  const rows = await listRows(supabase, args.sectionId);
  return { created: rows.filter((r) => r.id === id), rows };
}

export async function updateRow(
  supabase: SupabaseClient,
  id: string,
  patch: RowPatch,
): Promise<void> {
  const { error } = await supabase.from('channel_list_rows').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

/* §CL-1 — deleting row 4 of 10 used to leave a hole at 4 that
   nothing anywhere closed, and the next append landed at 11.
   Pass the sectionId and the sequence closes up behind the delete.
   The parameter is optional only because deleteRow predates the
   invariant; every call site in the app supplies it. */
export async function deleteRow(
  supabase: SupabaseClient,
  id: string,
  sectionId?: string,
): Promise<void> {
  const { error } = await supabase.from('channel_list_rows').delete().eq('id', id);
  if (error) throw new Error(error.message);
  if (sectionId) await normaliseSectionIndexes(supabase, sectionId);
}

/**
 * Applies a new order and leaves the section normalised — inputs
 * 1..N, outputs 1..M — in one atomic round-trip.
 *
 * §CL-1: this used to call `reorder_channel_list_rows`, which
 * renumbered 1..N across the WHOLE section regardless of row_kind
 * (043 never caught up with 115's per-kind model) and bumped every
 * row by +1000000 for collision avoidance while bringing only the
 * listed ids back down — so reordering inputs stranded the outputs.
 * It now delegates to normalise_channel_list_indexes, which does the
 * bump and the renumber per kind. `reorder_channel_list_rows` still
 * exists and migration 267 re-points it at the same function, so an
 * older client cannot reintroduce the interleaving.
 */
export async function reorderRows(
  supabase: SupabaseClient,
  sectionId: string,
  orderedIds: string[],
): Promise<void> {
  await normaliseSectionIndexes(supabase, sectionId, orderedIds);
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
  const s = src as ChannelListRow;
  /* §CL-1 — Copy used to re-scramble the numbering on every click:
     it listed the section UNFILTERED, took the max across both
     kinds, and then ran the kind-blind reorder over that flat list.
     Everything here is now scoped to the source row's own kind, and
     the copy carries row_kind (it previously fell back to the column
     default, so duplicating an output silently produced an input). */
  const kind = rowKindOf(s);
  const all = await listRows(supabase, sectionId);
  const sameKind = all.filter((r) => rowKindOf(r) === kind);
  const idx = sameKind.findIndex((r) => r.id === sourceId);
  if (idx === -1) throw new Error('Row not in section');
  const { data: inserted, error: e1 } = await supabase
    .from('channel_list_rows')
    .insert({
      pack_id: packId,
      section_id: sectionId,
      row_index: nextFreeRowIndex(all, kind),
      row_kind: kind,
      channel_name: s.channel_name,
      /* The patch is deliberately NOT copied: a socket holds one
         channel (046's UNIQUE (stage_box_id, stage_box_position)),
         so a copy that inherited its source's socket would be a
         guaranteed 23505. */
      sub_snake_id: null,
      sub_snake_position: null,
      stage_box_id: null,
      stage_box_position: null,
      position: s.position,
      gear_id: s.gear_id,
      mic: s.mic,
      mic_substitute: s.mic_substitute,
      di: s.di,
      gain: s.gain,
      stand: s.stand,
      cable_length: s.cable_length,
      phantom_power: s.phantom_power,
      provider: s.provider,
      notes: s.notes,
      output_item: s.output_item,
      output_description: s.output_description,
      output_is_stereo: s.output_is_stereo,
      output_position: s.output_position,
      output_notes: s.output_notes,
    })
    .select('*')
    .single();
  if (e1) throw new Error(e1.message);
  const newId = (inserted as ChannelListRow).id;
  const order = [
    ...sameKind.slice(0, idx + 1).map((r) => r.id),
    newId,
    ...sameKind.slice(idx + 1).map((r) => r.id),
  ];
  await reorderRows(supabase, sectionId, order);
  const { data: out, error: e2 } = await supabase
    .from('channel_list_rows')
    .select('*')
    .eq('id', newId)
    .single();
  if (e2) throw new Error(e2.message);
  return out as ChannelListRow;
}

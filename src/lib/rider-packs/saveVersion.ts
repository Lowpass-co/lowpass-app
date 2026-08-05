/* ============================================
   LOWPASS — saveVersion (rider decouple phase A, 2026-08-05)

   "Save as version": deep-copy a channel_list / stage_plot / rider document
   into a named sibling. One version = one source of truth (Adam's model):
   editing a version updates everywhere it is attached; a show that needs to
   differ gets its OWN version and its own attachment.

   Lineage: version_of_pack_id always points at the ROOT document (the
   original pack), never chains — resolving "all versions of X" is one query.

   This copies what the cross-artist clone route copies PLUS the two things it
   silently drops (pre-existing bugs, not replicated here): the pack's `kind`
   and each section's `metadata` (enabled_columns / rich text / summaries).
   For stage_plot packs it also copies stage_plots + stage_plot_items —
   stage_plot_items.channel_list_row_id is kept as-is (it points at rows of
   the LINKED channel-list pack, which this copy does not fork).
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface SaveVersionResult {
  ok: true;
  packId: string;
}
export interface SaveVersionError {
  ok: false;
  status: number;
  error: string;
}

export async function saveVersion(
  supabase: SupabaseClient,
  ws: string,
  userId: string,
  sourcePackId: string,
  versionLabel: string,
): Promise<SaveVersionResult | SaveVersionError> {
  const label = versionLabel.trim();
  if (!label) return { ok: false, status: 400, error: 'A version name is required' };

  const { data: source, error: srcErr } = await supabase
    .from('rider_packs')
    .select('id, workspace_id, title, kind, scope, artist_id, tour_id, routing_id, version_of_pack_id, cover_logo_url, cover_subtitle, cover_disclaimer, linked_rider_pack_id')
    .eq('id', sourcePackId)
    .maybeSingle();
  if (srcErr) return { ok: false, status: 500, error: srcErr.message };
  if (!source || source.workspace_id !== ws) return { ok: false, status: 404, error: 'Pack not found' };

  const rootId = (source.version_of_pack_id as string | null) ?? source.id;
  const baseTitle = String(source.title ?? 'Document').trim() || 'Document';
  const newTitle = `${baseTitle} — ${label}`;

  // Folder mirrors the source's scope — packs are 1:1 with a folder.
  const { data: folder, error: folderErr } = await supabase
    .from('rider_folders')
    .insert({
      workspace_id: ws,
      artist_id: source.artist_id,
      scope: source.scope,
      tour_id: source.tour_id,
      routing_id: source.routing_id,
      title: newTitle,
      inherit_from_folder_id: null,
    })
    .select('id')
    .single();
  if (folderErr || !folder) return { ok: false, status: 500, error: folderErr?.message ?? 'Folder create failed' };

  const { data: newPack, error: packErr } = await supabase
    .from('rider_packs')
    .insert({
      workspace_id: ws,
      folder_id: folder.id,
      scope: source.scope,
      artist_id: source.artist_id,
      tour_id: source.tour_id,
      routing_id: source.routing_id,
      title: newTitle,
      kind: source.kind ?? 'rider',
      version_of_pack_id: rootId,
      version_label: label,
      cover_logo_url: source.cover_logo_url,
      cover_subtitle: source.cover_subtitle,
      cover_disclaimer: source.cover_disclaimer,
      linked_rider_pack_id: source.linked_rider_pack_id,
      created_by: userId,
    })
    .select('id')
    .single();

  const rollbackFolder = () => supabase.from('rider_folders').delete().eq('id', folder.id);
  if (packErr || !newPack) {
    await rollbackFolder();
    return { ok: false, status: 500, error: packErr?.message ?? 'Pack create failed' };
  }
  const newPackId = newPack.id as string;
  let rolledBack = false;
  const rollback = async () => {
    if (rolledBack) return;
    rolledBack = true;
    await rollbackFolder(); // pack + children cascade from the folder's pack FK
    await supabase.from('rider_packs').delete().eq('id', newPackId);
  };

  // Sections — WITH metadata and status (the clone route drops metadata).
  const { data: sections, error: secErr } = await supabase
    .from('rider_sections')
    .select('id, section_key, title, sort_order, fields, section_type, metadata')
    .eq('pack_id', sourcePackId)
    .order('sort_order');
  if (secErr) { await rollback(); return { ok: false, status: 500, error: secErr.message }; }

  const sectionIdMap = new Map<string, string>();
  for (const s of sections ?? []) {
    const { data: ins, error: insErr } = await supabase
      .from('rider_sections')
      .insert({
        pack_id: newPackId,
        section_key: s.section_key,
        title: s.title,
        sort_order: s.sort_order,
        fields: s.fields ?? [],
        section_type: s.section_type ?? 'fields',
        metadata: s.metadata ?? {},
      })
      .select('id')
      .single();
    if (insErr || !ins) { await rollback(); return { ok: false, status: 500, error: insErr?.message ?? 'Section copy failed' }; }
    sectionIdMap.set(s.id as string, ins.id as string);
  }

  // Sub-snakes + stage boxes (id-remapped), then channel rows.
  const snakeIdMap = new Map<string, string>();
  const { data: snakes } = await supabase
    .from('sub_snakes')
    .select('id, section_id, label, colour, capacity, position')
    .eq('pack_id', sourcePackId);
  for (const sn of snakes ?? []) {
    const sec = sectionIdMap.get(sn.section_id as string);
    if (!sec) continue;
    const { data: nSn, error } = await supabase
      .from('sub_snakes')
      .insert({ pack_id: newPackId, section_id: sec, label: sn.label, colour: sn.colour, capacity: sn.capacity ?? 8, position: sn.position })
      .select('id')
      .single();
    if (error || !nSn) { await rollback(); return { ok: false, status: 500, error: error?.message ?? 'Sub-snake copy failed' }; }
    snakeIdMap.set(sn.id as string, nSn.id as string);
  }

  const boxIdMap = new Map<string, string>();
  const { data: boxes } = await supabase
    .from('stage_boxes')
    .select('id, section_id, label, colour, capacity, position')
    .eq('pack_id', sourcePackId);
  for (const bx of boxes ?? []) {
    const sec = sectionIdMap.get(bx.section_id as string);
    if (!sec) continue;
    const { data: nBx, error } = await supabase
      .from('stage_boxes')
      .insert({ pack_id: newPackId, section_id: sec, label: bx.label, colour: bx.colour, capacity: bx.capacity ?? 16, position: bx.position })
      .select('id')
      .single();
    if (error || !nBx) { await rollback(); return { ok: false, status: 500, error: error?.message ?? 'Stage box copy failed' }; }
    boxIdMap.set(bx.id as string, nBx.id as string);
  }

  const { data: rows } = await supabase
    .from('channel_list_rows')
    .select('*')
    .eq('pack_id', sourcePackId);
  for (const r of rows ?? []) {
    const sec = sectionIdMap.get(r.section_id as string);
    if (!sec) continue;
    const { id: _id, pack_id: _p, section_id: _s, created_at: _c, updated_at: _u, ...rest } = r as Record<string, unknown> & { id: string; pack_id: string; section_id: string; created_at?: string; updated_at?: string };
    void _id; void _p; void _s; void _c; void _u;
    const mappedSub = r.sub_snake_id ? snakeIdMap.get(r.sub_snake_id as string) ?? null : null;
    const mappedBox = r.stage_box_id ? boxIdMap.get(r.stage_box_id as string) ?? null : null;
    const { error } = await supabase.from('channel_list_rows').insert({
      ...rest,
      pack_id: newPackId,
      section_id: sec,
      sub_snake_id: mappedSub,
      sub_snake_position: mappedSub ? r.sub_snake_position : null,
      stage_box_id: mappedBox,
      stage_box_position: mappedBox ? r.stage_box_position : null,
    });
    if (error) { await rollback(); return { ok: false, status: 500, error: error.message }; }
  }

  // Stage plot canvas (stage_plot packs only — silently absent otherwise).
  const { data: plot } = await supabase
    .from('stage_plots')
    .select('*')
    .eq('rider_pack_id', sourcePackId)
    .maybeSingle();
  if (plot) {
    const { id: oldPlotId, rider_pack_id: _rp, created_at: _pc, updated_at: _pu, ...plotRest } = plot as Record<string, unknown> & { id: string; rider_pack_id: string; created_at?: string; updated_at?: string };
    void _rp; void _pc; void _pu;
    const { data: nPlot, error: plotErr } = await supabase
      .from('stage_plots')
      .insert({ ...plotRest, rider_pack_id: newPackId, version_label: label })
      .select('id')
      .single();
    if (plotErr || !nPlot) { await rollback(); return { ok: false, status: 500, error: plotErr?.message ?? 'Stage plot copy failed' }; }
    const { data: items } = await supabase
      .from('stage_plot_items')
      .select('*')
      .eq('stage_plot_id', oldPlotId);
    for (const it of items ?? []) {
      const { id: _i, stage_plot_id: _sp, created_at: _ic, updated_at: _iu, ...itemRest } = it as Record<string, unknown> & { id: string; stage_plot_id: string; created_at?: string; updated_at?: string };
      void _i; void _sp; void _ic; void _iu;
      const { error } = await supabase.from('stage_plot_items').insert({ ...itemRest, stage_plot_id: nPlot.id });
      if (error) { await rollback(); return { ok: false, status: 500, error: error.message }; }
    }
  }

  return { ok: true, packId: newPackId };
}

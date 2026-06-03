/* ============================================
   LOWPASS — Stage Plot server data access (§SP0 wiring)

   Maps the editor shapes (EditorPlot / EditorItem) to and from
   the DB rows (rider_packs + stage_plots + stage_plot_items) and
   provides create / load / save / delete against a Supabase
   client. A stage plot is a rider_packs row (kind='stage_plot')
   with a 1:1 stage_plots config row and many stage_plot_items.
   Requires migration 109.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolvePack } from '@/lib/rider-packs/resolve';
import type { RiderPack } from '@/lib/rider-packs/types';
import { DEFAULT_PLOT, type Channel, type EditorItem, type EditorPlot } from './editor-types';

interface PlotRow {
  id: string;
  rider_pack_id: string;
  stage_width_ft: number;
  stage_depth_ft: number;
  grid_size_ft: number;
  show_grid: boolean;
  show_rulers: boolean;
  show_center_line: boolean;
  show_ds_cross: boolean;
  show_lateral_markers: boolean;
  units: 'ft' | 'm';
  color_override: string | null;
  show_tm_name: string | null;
  show_tm_role: string | null;
  show_tm_phone: string | null;
  show_tm_email: string | null;
  show_logo_position: string | null;
  subtitle: string | null;
  version_label: string | null;
}

interface ItemRow {
  id: string;
  icon_name: string;
  label: string | null;
  position_x_ft: number;
  position_y_ft: number;
  width_ft: number | null;
  depth_ft: number | null;
  height_ft: number | null;
  scale: number | null;
  rotation_deg: number;
  color_tint: string | null;
  locked: boolean;
  layer: string;
  group_id: string | null;
  label_position: string | null;
  channel_list_row_id: string | null;
  /** Annotation fields (kind/text/fontSizeFt/x2Ft/y2Ft) stashed here —
   *  stage_plot_items has no dedicated columns for them yet. */
  label_style: Record<string, unknown> | null;
}

export function rowsToEditor(plot: PlotRow, items: ItemRow[], name: string): { plot: EditorPlot; items: EditorItem[] } {
  return {
    plot: {
      name,
      widthFt: Number(plot.stage_width_ft),
      depthFt: Number(plot.stage_depth_ft),
      gridSizeFt: Number(plot.grid_size_ft),
      showGrid: plot.show_grid,
      showRulers: plot.show_rulers,
      showCenterLine: plot.show_center_line,
      showDsCross: plot.show_ds_cross,
      showLateralMarkers: plot.show_lateral_markers,
      showChannels: false,
      snap: true,
      brandColor: plot.color_override ?? DEFAULT_PLOT.brandColor,
      units: plot.units,
      subtitle: plot.subtitle ?? undefined,
      tmName: plot.show_tm_name ?? undefined,
      tmRole: plot.show_tm_role ?? undefined,
      tmPhone: plot.show_tm_phone ?? undefined,
      tmEmail: plot.show_tm_email ?? undefined,
      versionLabel: plot.version_label ?? undefined,
      logoPosition: (plot.show_logo_position as EditorPlot['logoPosition']) ?? undefined,
    },
    items: items.map((r) => {
      const ann = (r.label_style ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        kind: (ann.kind as EditorItem['kind']) ?? 'icon',
        iconName: r.icon_name,
        xFt: Number(r.position_x_ft),
        yFt: Number(r.position_y_ft),
        widthFt: r.width_ft == null ? undefined : Number(r.width_ft),
        depthFt: r.depth_ft == null ? undefined : Number(r.depth_ft),
        heightFt: r.height_ft == null ? undefined : Number(r.height_ft),
        scale: r.scale == null ? undefined : Number(r.scale),
        rotationDeg: Number(r.rotation_deg),
        colorTint: r.color_tint,
        locked: r.locked,
        label: r.label ?? undefined,
        layer: (r.layer as EditorItem['layer']) ?? 'main',
        channelRowIds: (ann.channelRowIds as string[] | undefined) ?? (r.channel_list_row_id ? [r.channel_list_row_id] : undefined),
        groupId: r.group_id ?? undefined,
        kitName: ann.kitName as string | undefined,
        labelPosition: (r.label_position as EditorItem['labelPosition']) ?? undefined,
        labelFontPx: ann.labelFontPx as number | undefined,
        decoupleRotation: ann.decoupleRotation === true ? true : undefined,
        text: ann.text as string | undefined,
        fontSizeFt: ann.fontSizeFt as number | undefined,
        x2Ft: ann.x2Ft as number | undefined,
        y2Ft: ann.y2Ft as number | undefined,
      };
    }),
  };
}

export function plotToColumns(plot: EditorPlot): Record<string, unknown> {
  const cols: Record<string, unknown> = {
    stage_width_ft: plot.widthFt,
    stage_depth_ft: plot.depthFt,
    grid_size_ft: plot.gridSizeFt,
    show_grid: plot.showGrid,
    show_rulers: plot.showRulers,
    show_center_line: plot.showCenterLine,
    show_ds_cross: plot.showDsCross,
    show_lateral_markers: plot.showLateralMarkers,
    units: plot.units,
    color_override: plot.brandColor,
    // TM + logo columns exist since migration 109.
    show_tm_name: plot.tmName ?? null,
    show_tm_role: plot.tmRole ?? null,
    show_tm_phone: plot.tmPhone ?? null,
    show_tm_email: plot.tmEmail ?? null,
    show_logo_position: plot.logoPosition ?? 'top-right',
    updated_at: new Date().toISOString(),
  };
  // subtitle + version_label only exist after migration 110 — only
  // write them when set, so create / save still work on a 109-only DB
  // (otherwise the INSERT/UPDATE references a non-existent column).
  if (plot.subtitle != null && plot.subtitle !== '') cols.subtitle = plot.subtitle;
  if (plot.versionLabel != null && plot.versionLabel !== '') cols.version_label = plot.versionLabel;
  return cols;
}

export function itemToRow(it: EditorItem, stagePlotId: string, workspaceId: string, zIndex = 0): Record<string, unknown> {
  const kind = it.kind ?? 'icon';
  const labelStyle: Record<string, unknown> = kind === 'icon' ? {} : { kind, text: it.text, fontSizeFt: it.fontSizeFt, x2Ft: it.x2Ft, y2Ft: it.y2Ft };
  if (it.channelRowIds?.length) labelStyle.channelRowIds = it.channelRowIds;
  if (it.kitName) labelStyle.kitName = it.kitName;
  if (it.labelFontPx) labelStyle.labelFontPx = it.labelFontPx;
  if (it.decoupleRotation) labelStyle.decoupleRotation = true;
  return {
    workspace_id: workspaceId,
    stage_plot_id: stagePlotId,
    layer: it.layer ?? 'main',
    group_id: it.groupId ?? null,
    label_position: it.labelPosition ?? 'bottom',
    // icon_name is NOT NULL; annotations carry their kind as a sentinel.
    icon_name: it.iconName || `__${kind}__`,
    label: it.label ?? null,
    position_x_ft: it.xFt,
    position_y_ft: it.yFt,
    width_ft: it.widthFt ?? null,
    depth_ft: it.depthFt ?? null,
    height_ft: it.heightFt ?? null,
    scale: it.scale ?? 1,
    rotation_deg: it.rotationDeg ?? 0,
    color_tint: it.colorTint ?? null,
    locked: it.locked ?? false,
    channel_list_row_id: it.channelRowIds?.[0] ?? null,
    z_index: zIndex,
    label_style: labelStyle,
  };
}

/** Load a stage plot (config + items + name) by stage_plots.id. */
/** §SP-FIX-6 wiring — resolve the channel-list paired with this stage
 *  plot (linked pack → else a channel_list pack on the same tour →
 *  else the artist's), mapped to the editor's Channel shape so the
 *  editor can show the Channels section + tint linked items. */
export async function loadPlotChannels(supabase: SupabaseClient, riderPackId: string): Promise<Channel[]> {
  const { data: src } = await supabase
    .from('rider_packs')
    .select('tour_id, artist_id, linked_rider_pack_id')
    .eq('id', riderPackId)
    .maybeSingle();
  if (!src) return [];

  const pickPack = async (): Promise<RiderPack | null> => {
    if (src.linked_rider_pack_id) {
      const { data } = await supabase.from('rider_packs').select('*').eq('id', src.linked_rider_pack_id).eq('kind', 'channel_list').maybeSingle();
      if (data) return data as RiderPack;
    }
    if (src.tour_id) {
      const { data } = await supabase.from('rider_packs').select('*').eq('tour_id', src.tour_id).eq('kind', 'channel_list').order('updated_at', { ascending: false }).limit(1).maybeSingle();
      if (data) return data as RiderPack;
    }
    if (src.artist_id) {
      const { data } = await supabase.from('rider_packs').select('*').eq('artist_id', src.artist_id).eq('scope', 'artist').eq('kind', 'channel_list').order('updated_at', { ascending: false }).limit(1).maybeSingle();
      if (data) return data as RiderPack;
    }
    return null;
  };

  const clPack = await pickPack();
  if (!clPack) return [];
  try {
    const resolved = await resolvePack(supabase, clPack);
    const sec = resolved.sections.find((s) => s.section_type === 'channel_list');
    if (!sec?.rows) return [];
    const snakeById = new Map((sec.subSnakes ?? []).map((s) => [s.id, s]));
    return sec.rows
      .filter((r) => r.row_kind !== 'output')
      .sort((a, b) => a.row_index - b.row_index)
      .map((r, i) => {
        const sn = r.sub_snake_id ? snakeById.get(r.sub_snake_id) : undefined;
        return { id: r.id, number: i + 1, label: r.channel_name || `Ch ${i + 1}`, color: sn?.colour ?? null, snakeLabel: sn?.label ?? null };
      });
  } catch {
    return [];
  }
}

export async function loadStagePlot(
  supabase: SupabaseClient,
  id: string,
): Promise<{ plot: EditorPlot; items: EditorItem[]; riderPackId: string } | null> {
  const { data: plotRow } = await supabase.from('stage_plots').select('*').eq('id', id).single();
  if (!plotRow) return null;
  const { data: pack } = await supabase.from('rider_packs').select('title').eq('id', plotRow.rider_pack_id).single();
  const { data: itemRows } = await supabase
    .from('stage_plot_items')
    .select('*')
    .eq('stage_plot_id', id)
    .order('z_index', { ascending: true });
  const mapped = rowsToEditor(plotRow as PlotRow, (itemRows ?? []) as ItemRow[], pack?.title ?? 'Stage plot');
  return { ...mapped, riderPackId: plotRow.rider_pack_id };
}

/** Replace a stage plot's config + items (whole-document save). */
export async function saveStagePlot(
  supabase: SupabaseClient,
  id: string,
  workspaceId: string,
  plot: EditorPlot,
  items: EditorItem[],
): Promise<void> {
  const { data: plotRow } = await supabase.from('stage_plots').select('rider_pack_id').eq('id', id).single();
  await supabase.from('stage_plots').update(plotToColumns(plot)).eq('id', id);
  if (plotRow?.rider_pack_id) {
    await supabase.from('rider_packs').update({ title: plot.name }).eq('id', plotRow.rider_pack_id);
  }
  // Whole-document item replace (simple + correct for last-write-wins).
  await supabase.from('stage_plot_items').delete().eq('stage_plot_id', id);
  if (items.length) {
    await supabase.from('stage_plot_items').insert(items.map((it, i) => itemToRow(it, id, workspaceId, i)));
  }
}

/** Create a stage plot (rider_pack + stage_plots row). Artist-scope
 *  by default; pass tourId for a tour-scope plot (Operations surface).
 *  The rider_packs CHECK requires scope='tour' ⇒ tour_id NOT NULL. */
export async function createStagePlot(
  supabase: SupabaseClient,
  workspaceId: string,
  artistId: string,
  name: string,
  tourId?: string,
): Promise<{ id: string; riderPackId: string } | { error: string }> {
  const packRow = tourId
    ? { workspace_id: workspaceId, scope: 'tour', artist_id: artistId, tour_id: tourId, kind: 'stage_plot', title: name }
    : { workspace_id: workspaceId, scope: 'artist', artist_id: artistId, kind: 'stage_plot', title: name };
  const { data: pack, error: packErr } = await supabase
    .from('rider_packs')
    .insert(packRow)
    .select('id')
    .single();
  if (packErr || !pack) return { error: `rider_pack: ${packErr?.message ?? 'insert failed'}` };
  const { data: plot, error: plotErr } = await supabase
    .from('stage_plots')
    .insert({ workspace_id: workspaceId, rider_pack_id: pack.id, ...plotToColumns(DEFAULT_PLOT) })
    .select('id')
    .single();
  if (plotErr || !plot) {
    // Roll back the orphaned pack so a retry isn't blocked by the unique index.
    await supabase.from('rider_packs').delete().eq('id', pack.id);
    return { error: `stage_plots: ${plotErr?.message ?? 'insert failed'}` };
  }
  return { id: plot.id, riderPackId: pack.id };
}

/* ============================================
   LOWPASS — Stage Plot export data loader (#8 Document Export, 6th surface)

   Loads a stage plot by plot-id (NOT tour-id — a plot lives in the artist library
   and/or a tour rider pack). Reuses `loadStagePlot` (server.ts → EditorPlot +
   EditorItem in editor shapes) + a PER-REQUEST custom-icon map (race-free, not the
   global registry). When `includeInputList` is on, resolves the channel_list pack
   paired with the plot (linked pack → tour → artist, same precedence as
   loadPlotChannels) and builds the input/output rows via the shared
   channelDataFromSection.

   Read-only; RLS scopes on stage_plots.workspace_id (the route verified the plot).
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveArtistLogoUrl } from '@/lib/artists/imageUrl';
import { resolvePack } from '@/lib/rider-packs/resolve';
import type { RiderPack, ResolvedSection } from '@/lib/rider-packs/types';
import { loadStagePlot } from '@/lib/stage-plot/server';
import type { EditorItem, EditorPlot } from '@/lib/stage-plot/editor-types';
import type { IconCategoryKey, IconDescriptor } from '@/lib/stage-plot/icons/types';
import { channelDataFromSection, type ChannelListExportData } from '@/lib/export/channel-list-data';

export interface StagePlotExportData {
  plot: EditorPlot;
  items: EditorItem[];
  /** Per-request custom-icon resolver (`custom_<uuid>` → descriptor). */
  customIcons: Map<string, IconDescriptor>;
  plotName: string;
  artist: { name: string } | null;
  logoUrl: string | null;
  /** The paired channel/input list (when includeInputList + a list exists). */
  channel: ChannelListExportData | null;
}

const KNOWN_CATS = new Set<string>(['drums', 'mics', 'musicians', 'amps', 'keys', 'strings', 'monitors', 'signal', 'infrastructure', 'lighting', 'stands', 'utility']);

/** The channel_list section paired with this plot's rider pack — linked pack →
 *  else a channel_list pack on the same tour → else the artist's (mirrors
 *  loadPlotChannels' precedence). */
async function resolvePairedChannelSection(supabase: SupabaseClient, riderPackId: string): Promise<ResolvedSection | null> {
  const { data: src } = await supabase
    .from('rider_packs')
    .select('tour_id, artist_id, linked_rider_pack_id')
    .eq('id', riderPackId)
    .maybeSingle();
  if (!src) return null;

  let clPack: RiderPack | null = null;
  if (src.linked_rider_pack_id) {
    const { data } = await supabase.from('rider_packs').select('*').eq('id', src.linked_rider_pack_id).eq('kind', 'channel_list').maybeSingle();
    if (data) clPack = data as RiderPack;
  }
  if (!clPack && src.tour_id) {
    const { data } = await supabase.from('rider_packs').select('*').eq('tour_id', src.tour_id).eq('kind', 'channel_list').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (data) clPack = data as RiderPack;
  }
  if (!clPack && src.artist_id) {
    const { data } = await supabase.from('rider_packs').select('*').eq('artist_id', src.artist_id).eq('scope', 'artist').eq('kind', 'channel_list').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (data) clPack = data as RiderPack;
  }
  if (!clPack) return null;
  try {
    const resolved = await resolvePack(supabase, clPack);
    return resolved.sections.find((s) => s.section_type === 'channel_list') ?? null;
  } catch {
    return null;
  }
}

async function loadArtist(supabase: SupabaseClient, riderPackId: string): Promise<{ artist: { name: string } | null; logoUrl: string | null }> {
  const { data: pack } = await supabase.from('rider_packs').select('tour_id, artist_id').eq('id', riderPackId).maybeSingle();
  let artistId = (pack?.artist_id as string | null) ?? null;
  if (!artistId && pack?.tour_id) {
    const { data: tour } = await supabase.from('tours').select('artist_id').eq('id', pack.tour_id).maybeSingle();
    artistId = (tour?.artist_id as string | null) ?? null;
  }
  if (!artistId) return { artist: null, logoUrl: null };
  const { data: artistRow } = await supabase.from('artists').select('id, name, branding, spotify_id, spotify_image_url').eq('id', artistId).maybeSingle();
  if (!artistRow) return { artist: null, logoUrl: null };
  const logoUrl = await resolveArtistLogoUrl(artistRow as { id: string; name: string; branding: unknown; spotify_id: string | null; spotify_image_url: string | null });
  return { artist: { name: (artistRow as { name: string }).name }, logoUrl };
}

export async function loadStagePlotExportData(
  supabase: SupabaseClient,
  plotId: string,
  workspaceId: string,
  opts?: { includeInputList?: boolean },
): Promise<StagePlotExportData | null> {
  const loaded = await loadStagePlot(supabase, plotId);
  if (!loaded) return null;
  const { plot, items, riderPackId } = loaded;

  // Per-request custom-icon map (race-free) — mirrors /api/stage-plot/icons.
  const customIcons = new Map<string, IconDescriptor>();
  const { data: customRows } = await supabase
    .from('stage_plot_custom_items')
    .select('id, label, category, svg_content, default_width_ft, default_depth_ft')
    .eq('workspace_id', workspaceId);
  for (const r of (customRows ?? []) as Array<{ id: string; label: string; category: string | null; svg_content: string; default_width_ft: number | null; default_depth_ft: number | null }>) {
    const w = Number(r.default_width_ft) || 1;
    const d = Number(r.default_depth_ft) || 1;
    customIcons.set(`custom_${r.id}`, {
      name: `custom_${r.id}`,
      category: (r.category && KNOWN_CATS.has(r.category) ? r.category : 'utility') as IconCategoryKey,
      label: r.label,
      footprint: { width_ft: w, depth_ft: d },
      viewBox: `0 0 ${Math.round(w * 100)} ${Math.round(d * 100)}`,
      body: r.svg_content,
    });
  }

  const { artist, logoUrl } = await loadArtist(supabase, riderPackId);

  let channel: ChannelListExportData | null = null;
  if (opts?.includeInputList) {
    const section = await resolvePairedChannelSection(supabase, riderPackId);
    const { inputs, outputs } = channelDataFromSection(section);
    channel = { tour: { id: '', name: plot.name }, artist, logoUrl, inputs, outputs, hasSection: section !== null };
  }

  return { plot, items, customIcons, plotName: plot.name, artist, logoUrl, channel };
}

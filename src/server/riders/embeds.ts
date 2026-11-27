/* ============================================
   LOWPASS — Riders: the input list + stage plot, read for the rider

   `buildEmbeds` reads the tour's channel list and stage plot the way the tools
   resolve them — the tour's attached document (Production › Channel list /
   Stage plot), else the newest one on the tour — plus every SHOW with its own
   document attached ("Attach to show…"), and returns plain copies the rider
   can show and freeze (lib/riders/embeds.ts).

   Reads with the SERVICE ROLE, scoped by hand to this tour: show attachments
   carry no tour_id (RLS shows them to managers only) and a channel list can
   inherit from an artist-level pack, so a Member reading through RLS would
   see a different list from the one a manager publishes. The callers have
   already checked the viewer may see this tour's Production area. Every
   query below is pinned to the tour (or to documents of its workspace).
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolvePack } from '@/lib/rider-packs/resolve';
import { resolveTourChannelList } from '@/lib/rider-packs/resolveChannelList';
import type { ResolvedSection, RiderPack } from '@/lib/rider-packs/types';
import { channelDataFromSection, channelExportColumnLabel, type ChannelExportCellKey } from '@/lib/export/channel-list-data';
import { loadStagePlotExportData } from '@/lib/export/stageplot-data';
import { buildStagePlotSvg } from '@/lib/stage-plot/stageplot-svg';
import { emptyEmbeds } from '@/lib/riders/embeds';
import { fmtDay } from '@/lib/riders/blocks';
import type { EmbedInputList, EmbedStagePlot, EmbedTable, RiderEmbeds } from '@/lib/riders/types';

interface PackRow {
  id: string;
  workspace_id: string;
  tour_id: string | null;
  kind: string | null;
  title: string | null;
  version_label?: string | null;
  updated_at: string;
}

export interface EmbedShow {
  routingId: string;
  date: string;
  venue: string | null;
  city: string | null;
}

/** A resolved channel_list section → the rider's copy: inputs (channel number
 *  first, always) + outputs, as text in the editor's own columns. */
export function inputListCopy(section: ResolvedSection | null, pack: { id: string; title: string | null; version_label?: string | null }): EmbedInputList | null {
  if (!section) return null;
  const { columns, inputs, outputs } = channelDataFromSection(section);
  const cellKeys = columns.filter((k): k is ChannelExportCellKey => k !== 'number');
  const inputTable: EmbedTable = {
    columns: [channelExportColumnLabel('number'), ...cellKeys.map((k) => channelExportColumnLabel(k))],
    rows: inputs.map((r) => [String(r.index), ...cellKeys.map((k) => r.cells[k] ?? '')]),
  };
  const outputTable: EmbedTable | null = outputs.length
    ? {
        columns: ['#', 'Item', 'Destination', 'Qty', 'Format', 'Notes'],
        rows: outputs.map((o) => [String(o.index), o.item, o.destination, o.qty === null ? '—' : String(o.qty), `${o.stereo ? 'Stereo' : 'Mono'}${o.position ? ` (${o.position})` : ''}`, o.notes]),
      }
    : null;
  return {
    docId: pack.id,
    title: pack.title?.trim() || 'Input list',
    version: pack.version_label?.trim() || null,
    inputs: inputTable,
    outputs: outputTable,
  };
}

async function channelSectionOf(service: SupabaseClient, pack: PackRow): Promise<ResolvedSection | null> {
  try {
    const resolved = await resolvePack(service, pack as unknown as RiderPack);
    return resolved.sections.find((s) => s.section_type === 'channel_list') ?? null;
  } catch {
    return null;
  }
}

async function plotCopy(service: SupabaseClient, pack: PackRow, workspaceId: string): Promise<EmbedStagePlot | null> {
  const { data: plot } = await service.from('stage_plots').select('id').eq('rider_pack_id', pack.id).maybeSingle();
  const plotId = (plot as { id: string } | null)?.id;
  if (!plotId) return null;
  try {
    const data = await loadStagePlotExportData(service, plotId, workspaceId);
    if (!data) return null;
    return {
      docId: pack.id,
      title: pack.title?.trim() || 'Stage plot',
      version: pack.version_label?.trim() || null,
      svg: buildStagePlotSvg(data.plot, data.items, data.customIcons, { theme: 'light' }),
    };
  } catch {
    return null;
  }
}

const showLabel = (s: EmbedShow) => `${fmtDay(s.date)} · ${s.venue ?? s.city ?? 'Show'}`;

/**
 * The input list(s) and stage plot(s) this tour's rider can show — the tour's
 * and any show's own — or only one kind (`want`).
 */
export async function buildEmbeds(
  service: SupabaseClient,
  args: { tourId: string; workspaceId: string; shows: readonly EmbedShow[]; want?: { inputList: boolean; stagePlot: boolean } },
): Promise<RiderEmbeds> {
  const out = emptyEmbeds();
  const want = args.want ?? { inputList: true, stagePlot: true };
  if (!want.inputList && !want.stagePlot) return out;
  const { tourId, workspaceId } = args;
  const showIds = args.shows.map((s) => s.routingId);

  const [cl, packsRes, tourAttachRes, showAttachRes] = await Promise.all([
    want.inputList ? resolveTourChannelList(service, tourId) : Promise.resolve(null),
    service.from('rider_packs').select('id, workspace_id, tour_id, kind, title, version_label, updated_at').eq('tour_id', tourId).eq('workspace_id', workspaceId).order('updated_at', { ascending: false }),
    service.from('rider_pack_attachments').select('document_pack_id').eq('tour_id', tourId),
    showIds.length ? service.from('rider_pack_attachments').select('routing_id, document_pack_id').in('routing_id', showIds) : Promise.resolve({ data: [] }),
  ]);
  const tourPacks = (packsRes.data ?? []) as PackRow[];

  // Every document an attachment points at — this workspace's only.
  const attachedIds = [
    ...((tourAttachRes.data ?? []) as { document_pack_id: string }[]).map((a) => a.document_pack_id),
    ...((showAttachRes.data ?? []) as { document_pack_id: string }[]).map((a) => a.document_pack_id),
  ];
  const docById = new Map<string, PackRow>(tourPacks.map((p) => [p.id, p]));
  const missing = [...new Set(attachedIds)].filter((id) => !docById.has(id));
  if (missing.length) {
    const { data } = await service.from('rider_packs').select('id, workspace_id, tour_id, kind, title, version_label, updated_at').in('id', missing).eq('workspace_id', workspaceId);
    for (const p of (data ?? []) as PackRow[]) docById.set(p.id, p);
  }
  const kindOf = (id: string) => docById.get(id)?.kind ?? null;

  // The tour's documents.
  if (want.inputList && cl?.section && cl.packId) {
    const pack = docById.get(cl.packId) ?? (cl.pack as unknown as PackRow | null);
    const copy = pack ? inputListCopy(cl.section, pack) : null;
    if (copy) {
      out.inputLists[copy.docId] = copy;
      out.tour.inputList = copy.docId;
    }
  }
  if (want.stagePlot) {
    const attached = ((tourAttachRes.data ?? []) as { document_pack_id: string }[]).map((a) => a.document_pack_id).find((id) => kindOf(id) === 'stage_plot');
    const candidates = [attached, ...tourPacks.filter((p) => p.kind === 'stage_plot').map((p) => p.id)].filter((x): x is string => !!x);
    for (const id of candidates) {
      const pack = docById.get(id);
      const copy = pack ? await plotCopy(service, pack, workspaceId) : null;
      if (copy) {
        out.stagePlots[copy.docId] = copy;
        out.tour.stagePlot = copy.docId;
        break;
      }
    }
  }

  // Shows with their own document attached.
  const byShow = new Map<string, string[]>();
  for (const a of (showAttachRes.data ?? []) as { routing_id: string; document_pack_id: string }[]) byShow.set(a.routing_id, [...(byShow.get(a.routing_id) ?? []), a.document_pack_id]);
  for (const show of args.shows) {
    const ids = byShow.get(show.routingId) ?? [];
    for (const id of ids) {
      const pack = docById.get(id);
      if (!pack) continue;
      if (pack.kind === 'channel_list' && want.inputList && id !== out.tour.inputList) {
        if (!out.inputLists[id]) {
          const copy = inputListCopy(await channelSectionOf(service, pack), pack);
          if (!copy) continue;
          out.inputLists[id] = copy;
        }
        out.shows[show.routingId] = { ...(out.shows[show.routingId] ?? { label: showLabel(show) }), inputList: id };
      }
      if (pack.kind === 'stage_plot' && want.stagePlot && id !== out.tour.stagePlot) {
        if (!out.stagePlots[id]) {
          const copy = await plotCopy(service, pack, workspaceId);
          if (!copy) continue;
          out.stagePlots[id] = copy;
        }
        out.shows[show.routingId] = { ...(out.shows[show.routingId] ?? { label: showLabel(show) }), stagePlot: id };
      }
    }
  }
  return out;
}

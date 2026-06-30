/* ============================================
   LOWPASS — Channel-list export data loader (#8 Document Export, 5th surface)

   Mirrors the channel-list page (src/app/(app)/operations/[tourId]/channel-list/
   page.tsx): load the tour's rider packs, resolvePack each, find the first
   `channel_list` section, and read its rows / sub-snakes / stage boxes. The exported
   table matches the on-screen columns (ChannelListTourSheet) — input rows
   (# · Source · Mic/DI · Sub-snake · Stage I/O · Insert · Ph · Notes) + the output
   (IEM/mix) rows. Read-only; RLS scopes via rider_packs.workspace_id.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveArtistLogoUrl } from '@/lib/artists/imageUrl';
import { resolvePack } from '@/lib/rider-packs/resolve';
import type { RiderPack, ResolvedSection, ChannelListRow, SubSnake, StageBox } from '@/lib/rider-packs/types';

export interface ChannelInputRow {
  index: number;
  source: string;
  micDi: string;
  subSnake: string;
  stageIO: string;
  insert: string;
  phantom: 'On' | 'Off' | '—';
  notes: string;
}

export interface ChannelOutputRow {
  index: number;
  item: string;
  destination: string;
  qty: number | null;
  stereo: boolean;
  position: string;
  notes: string;
}

export interface ChannelListExportData {
  tour: { id: string; name: string };
  artist: { name: string } | null;
  logoUrl: string | null;
  inputs: ChannelInputRow[];
  outputs: ChannelOutputRow[];
  /** False when no channel_list section exists on any of the tour's rider packs. */
  hasSection: boolean;
}

function labelLookup(list: Array<{ id: string; label: string }>, id: string | null): string {
  if (!id) return '—';
  return list.find((x) => x.id === id)?.label ?? id.slice(0, 6);
}
function formatPos(label: string, pos: number | null): string {
  if (pos == null) return '—';
  return `${label}-${pos}`;
}

// NOTE: no workspaceId param — channel_list_rows / sub_snakes / stage_boxes are
// scoped via rider_packs.workspace_id (RLS), and the route already verified the tour
// belongs to the workspace. resolvePack runs under the caller's RLS session.
export async function loadChannelListExportData(
  supabase: SupabaseClient,
  tour: { id: string; name: string; artist_id: string | null },
): Promise<ChannelListExportData> {
  const tourId = tour.id;

  const [packsRes, artistRes] = await Promise.all([
    supabase.from('rider_packs').select('*').eq('tour_id', tourId).order('updated_at', { ascending: false }),
    tour.artist_id
      ? supabase.from('artists').select('id, name, branding, spotify_id, spotify_image_url').eq('id', tour.artist_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Resolve the first pack that carries a channel_list section (mirrors the page).
  let section: ResolvedSection | null = null;
  for (const pack of (packsRes.data ?? []) as RiderPack[]) {
    try {
      const resolved = await resolvePack(supabase, pack);
      const sec = resolved.sections.find((s) => s.section_type === 'channel_list');
      if (sec) {
        section = sec;
        break;
      }
    } catch {
      /* a malformed pack shouldn't break the export — try the next one */
    }
  }

  const subSnakes: SubSnake[] = section?.subSnakes ?? [];
  const stageBoxes: StageBox[] = section?.stageBoxes ?? [];
  const rows: ChannelListRow[] = section?.rows ?? [];

  const inputRows = rows.filter((r) => (r.row_kind ?? 'input') !== 'output').sort((a, b) => a.row_index - b.row_index);
  const outputRows = rows.filter((r) => (r.row_kind ?? 'input') === 'output').sort((a, b) => a.row_index - b.row_index);

  const inputs: ChannelInputRow[] = inputRows.map((r) => ({
    index: r.row_index,
    source: (r.channel_name ?? '').trim() || '—',
    micDi: [r.mic, r.di].filter((x) => (x ?? '').trim()).join(' · ') || '—',
    subSnake: formatPos(labelLookup(subSnakes, r.sub_snake_id), r.sub_snake_position),
    stageIO: formatPos(labelLookup(stageBoxes, r.stage_box_id), r.stage_box_position),
    insert: (r.position ?? '').trim() || '—',
    phantom: r.phantom_power === true ? 'On' : r.phantom_power === false ? 'Off' : '—',
    notes: (r.notes ?? '').trim(),
  }));

  const outputs: ChannelOutputRow[] = outputRows.map((r) => ({
    index: r.row_index,
    item: (r.output_item ?? '').trim() || '—',
    destination: (r.output_description ?? r.output_destination ?? '').trim() || '—',
    qty: typeof r.output_qty === 'number' ? r.output_qty : null,
    stereo: r.output_is_stereo === true,
    position: (r.output_position ?? '').trim(),
    notes: (r.output_notes ?? '').trim(),
  }));

  const artistRow = artistRes.data as { id: string; name: string; branding: unknown; spotify_id: string | null; spotify_image_url: string | null } | null;
  const logoUrl = artistRow ? await resolveArtistLogoUrl(artistRow) : null;

  return {
    tour: { id: tourId, name: tour.name },
    artist: artistRow ? { name: artistRow.name } : null,
    logoUrl,
    inputs,
    outputs,
    hasSection: section !== null,
  };
}

/* ============================================
   LOWPASS — Channel-list export data loader (#8 Document Export, 5th surface)

   Resolution is NOT done here. Both this loader and the channel-list page call
   `resolveTourChannelList()` (src/lib/rider-packs/resolveChannelList.ts) — the
   one attachment-first resolver. The previous "loop rider_packs, take the first
   channel_list (mirrors the page)" comment was false, and cost Adam an export
   that showed a different list from the editor. Do not re-implement it here.

   Columns are NOT hardcoded either (§CL-9). The exported table carries the
   editor's OWN enabled-column set — `rider_sections.metadata.enabled_columns`
   via `getEnabledColumnKeys()` — so the PDF/XLSX print exactly the columns
   Adam has switched on, in the editor's order, under the editor's labels.
   Read-only; RLS scopes via rider_packs.workspace_id.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveArtistLogoUrl } from '@/lib/artists/imageUrl';
import { resolveTourChannelList } from '@/lib/rider-packs/resolveChannelList';
import {
  COLUMN_BY_KEY,
  getEnabledColumnKeys,
  type ChannelListColumnKey,
} from '@/lib/channel-list/columns';
import type { ResolvedSection, ChannelListRow, SubSnake, StageBox } from '@/lib/rider-packs/types';

/** Every column an input row can print, minus the row number (which the
 *  renderers carry separately so XLSX can keep it numeric). */
export type ChannelExportCellKey = Exclude<ChannelListColumnKey, 'number'>;

/** Header text per column. Defaults to the EDITOR's label (single source of
 *  truth: CHANNEL_LIST_COLUMNS) so the export cannot drift from the screen.
 *  One deliberate override: the editor's checkbox column reads `+48`, which is
 *  a UI affordance; a printed spec sheet reads `48V`. (It printed `Ph.` before
 *  §CL-9 — cryptic on a page a house engineer has to read cold.) */
const EXPORT_LABEL_OVERRIDES: Partial<Record<ChannelListColumnKey, string>> = {
  phantom_power: '48V',
};

export function channelExportColumnLabel(key: ChannelListColumnKey): string {
  return EXPORT_LABEL_OVERRIDES[key] ?? COLUMN_BY_KEY[key].label;
}

export interface ChannelInputRow {
  index: number;
  /** Rendered text per column key. Populated for EVERY key; the renderers pick
   *  the enabled subset off `ChannelListExportData.columns`. */
  cells: Record<ChannelExportCellKey, string>;
  /** Oct 2026 — the row's stage box and its colour: the editor colour-codes
   *  every input by its box (ChannelListEditor ChannelBlock), so the export does
   *  too. Null when the channel isn't patched to a box. */
  boxId: string | null;
  boxColour: string | null;
}

/** One socket on an IO box sheet. `channel` null = nothing patched (SPARE). */
export interface BoxSocket {
  socket: number;
  channel: number | null;
  cells: Record<ChannelExportCellKey, string> | null;
}

/** An IO (stage) box, socket by socket — the per-box sheet that gets printed
 *  and taped to the box. */
export interface ExportBoxSheet {
  id: string;
  label: string;
  colour: string | null;
  capacity: number;
  sockets: BoxSocket[];
  /** Channels assigned to the box with no socket number yet. */
  unplaced: Array<{ channel: number; name: string }>;
}

/** A loom / sub-snake, for the loom pull. */
export interface ExportLoom {
  label: string;
  colour: string | null;
  capacity: number;
  used: number;
}

export interface PullRow {
  item: string;
  /** Band / Venue / Hire / '' (unassigned). */
  provider: string;
  qty: number;
}

export interface ChannelPulls {
  /** Mics AND DIs — a channel with both counts once in each. */
  mics: PullRow[];
  stands: PullRow[];
  cables: PullRow[];
  looms: ExportLoom[];
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
  /** Enabled columns in canonical (editor) order, INCLUDING `number`. */
  columns: ChannelListColumnKey[];
  inputs: ChannelInputRow[];
  outputs: ChannelOutputRow[];
  /** Every stage box in sort order, socket by socket. */
  boxes: ExportBoxSheet[];
  pulls: ChannelPulls;
  /** False when no channel_list section resolved for this tour. */
  hasSection: boolean;
}

/** The placeholder an empty cell prints as. Notes are the exception — a dash in
 *  a wide free-text column is noise, so notes stay blank. */
const EMPTY = '—';

function labelLookup(list: Array<{ id: string; label: string }>, id: string | null): string {
  if (!id) return EMPTY;
  return list.find((x) => x.id === id)?.label ?? id.slice(0, 6);
}
function formatPos(label: string, pos: number | null): string {
  if (pos == null) return EMPTY;
  return `${label}-${pos}`;
}
function text(v: string | null | undefined): string {
  return (v ?? '').trim() || EMPTY;
}

/* Short forms of the editor's ownership options ("Band (owned)" /
   "Venue supplies" / "Hire (rented)") — the parentheticals don't fit a
   4-rem print column and add nothing on paper. */
const PROVIDER_LABELS: Record<string, string> = { band: 'Band', venue: 'Venue', hire: 'Hire' };

function inputCells(
  r: ChannelListRow,
  subSnakes: SubSnake[],
  stageBoxes: StageBox[],
): Record<ChannelExportCellKey, string> {
  return {
    name: text(r.channel_name),
    position: text(r.position),
    stage_box: formatPos(labelLookup(stageBoxes, r.stage_box_id), r.stage_box_position),
    sub_snake: formatPos(labelLookup(subSnakes, r.sub_snake_id), r.sub_snake_position),
    cable_length: text(r.cable_length),
    /* Mic and DI share one editor column ("Mic / DI"); keep them joined. */
    mic: [r.mic, r.di].filter((x) => (x ?? '').trim()).join(' · ') || EMPTY,
    gain: text(r.gain),
    stand: text(r.stand),
    /* Migration 113 made phantom_power NOT NULL, so the old third "—" state is
       unreachable and has been dropped: every input row is On or Off. */
    phantom_power: r.phantom_power === true ? 'On' : 'Off',
    provider: r.provider ? (PROVIDER_LABELS[r.provider] ?? r.provider) : EMPTY,
    notes: (r.notes ?? '').trim(),
  };
}

const byPosition = <T extends { position?: number | null }>(a: T, b: T) => (a.position ?? 0) - (b.position ?? 0);

/** Each box socket by socket: 1 → capacity (or the highest patched socket if
 *  someone patched past it), every empty socket listed so the sheet doubles as
 *  a patch check. */
export function boxSheets(stageBoxes: StageBox[], inputRows: ChannelListRow[], subSnakes: SubSnake[]): ExportBoxSheet[] {
  return [...stageBoxes].sort(byPosition).map((b) => {
    const mine = inputRows.filter((r) => r.stage_box_id === b.id);
    const placed = mine.filter((r) => r.stage_box_position != null);
    const top = Math.max(Number(b.capacity) || 0, ...placed.map((r) => r.stage_box_position as number), 0);
    const bySocket = new Map(placed.map((r) => [r.stage_box_position as number, r]));
    const sockets: BoxSocket[] = [];
    for (let n = 1; n <= top; n++) {
      const r = bySocket.get(n);
      sockets.push(r ? { socket: n, channel: r.row_index, cells: inputCells(r, subSnakes, stageBoxes) } : { socket: n, channel: null, cells: null });
    }
    return {
      id: b.id,
      label: b.label,
      colour: b.colour ?? null,
      capacity: Number(b.capacity) || 0,
      sockets,
      unplaced: mine.filter((r) => r.stage_box_position == null).map((r) => ({ channel: r.row_index, name: text(r.channel_name) })),
    };
  });
}

function tally(keys: Array<{ item: string; provider: string }>): PullRow[] {
  const m = new Map<string, PullRow>();
  for (const k of keys) {
    const id = `${k.item}\u0000${k.provider}`;
    const cur = m.get(id);
    if (cur) cur.qty += 1;
    else m.set(id, { item: k.item, provider: k.provider, qty: 1 });
  }
  return [...m.values()].sort((a, b) => b.qty - a.qty || a.item.localeCompare(b.item) || a.provider.localeCompare(b.provider));
}

/** The pull lists. Differences from the editor's inventory panel, on purpose:
 *  a channel with a mic AND a DI counts in both (the editor counts only the
 *  mic, so DIs went missing from the pull), and a stand of "None" is not a
 *  stand. */
export function channelPulls(inputRows: ChannelListRow[], subSnakes: SubSnake[]): ChannelPulls {
  const prov = (r: ChannelListRow) => (r.provider ? (PROVIDER_LABELS[r.provider] ?? r.provider) : '');
  const mics: Array<{ item: string; provider: string }> = [];
  const stands: Array<{ item: string; provider: string }> = [];
  const cables: Array<{ item: string; provider: string }> = [];
  for (const r of inputRows) {
    for (const v of [r.mic, r.di]) {
      const item = (v ?? '').trim();
      if (item) mics.push({ item, provider: prov(r) });
    }
    const stand = (r.stand ?? '').trim();
    if (stand && !/^none$/i.test(stand)) stands.push({ item: stand, provider: prov(r) });
    const cable = (r.cable_length ?? '').trim();
    if (cable) cables.push({ item: cable, provider: '' });
  }
  return {
    mics: tally(mics),
    stands: tally(stands),
    cables: tally(cables),
    looms: [...subSnakes].sort(byPosition).map((l) => ({
      label: l.label,
      colour: l.colour ?? null,
      capacity: Number(l.capacity) || 0,
      used: inputRows.filter((r) => r.sub_snake_id === l.id).length,
    })),
  };
}

/** Map a resolved channel_list section → the export rows + its enabled column
 *  set. Shared by the tour-scoped loader AND the stage-plot "include input
 *  list" combine. */
export function channelDataFromSection(section: ResolvedSection | null): {
  columns: ChannelListColumnKey[];
  inputs: ChannelInputRow[];
  outputs: ChannelOutputRow[];
  boxes: ExportBoxSheet[];
  pulls: ChannelPulls;
} {
  const subSnakes: SubSnake[] = section?.subSnakes ?? [];
  const stageBoxes: StageBox[] = section?.stageBoxes ?? [];
  const rows: ChannelListRow[] = section?.rows ?? [];
  const inputRows = rows.filter((r) => (r.row_kind ?? 'input') !== 'output').sort((a, b) => a.row_index - b.row_index);
  const outputRows = rows.filter((r) => (r.row_kind ?? 'input') === 'output').sort((a, b) => a.row_index - b.row_index);

  /* §CL-9 — the SAME call the editor makes (ChannelListEditor.tsx:419), over
     the same two inputs, so the printed columns are the on-screen columns.
     Note it reads the INPUT rows only: outputs carry no input-column data and
     would drag the lazy pre-metadata derivation off. */
  const columns = getEnabledColumnKeys(section?.metadata ?? null, inputRows);

  const boxById = new Map(stageBoxes.map((b) => [b.id, b]));
  const inputs: ChannelInputRow[] = inputRows.map((r) => ({
    index: r.row_index,
    cells: inputCells(r, subSnakes, stageBoxes),
    boxId: r.stage_box_id && boxById.has(r.stage_box_id) ? r.stage_box_id : null,
    boxColour: (r.stage_box_id && boxById.get(r.stage_box_id)?.colour) || null,
  }));
  const outputs: ChannelOutputRow[] = outputRows.map((r) => ({
    index: r.row_index,
    item: text(r.output_item),
    destination: (r.output_description ?? r.output_destination ?? '').trim() || EMPTY,
    qty: typeof r.output_qty === 'number' ? r.output_qty : null,
    stereo: r.output_is_stereo === true,
    position: (r.output_position ?? '').trim(),
    notes: (r.output_notes ?? '').trim(),
  }));
  return { columns, inputs, outputs, boxes: boxSheets(stageBoxes, inputRows, subSnakes), pulls: channelPulls(inputRows, subSnakes) };
}

// NOTE: no workspaceId param — channel_list_rows / sub_snakes / stage_boxes are
// scoped via rider_packs.workspace_id (RLS), and the route already verified the tour
// belongs to the workspace. resolveTourChannelList runs under the caller's RLS session.
export async function loadChannelListExportData(
  supabase: SupabaseClient,
  tour: { id: string; name: string; artist_id: string | null },
): Promise<ChannelListExportData> {
  const tourId = tour.id;

  const [resolved, artistRes] = await Promise.all([
    resolveTourChannelList(supabase, tourId),
    tour.artist_id
      ? supabase.from('artists').select('id, name, branding, spotify_id, spotify_image_url').eq('id', tour.artist_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const section = resolved.section;
  const { columns, inputs, outputs, boxes, pulls } = channelDataFromSection(section);

  const artistRow = artistRes.data as { id: string; name: string; branding: unknown; spotify_id: string | null; spotify_image_url: string | null } | null;
  const logoUrl = artistRow ? await resolveArtistLogoUrl(artistRow) : null;

  return {
    tour: { id: tourId, name: tour.name },
    artist: artistRow ? { name: artistRow.name } : null,
    logoUrl,
    columns,
    inputs,
    outputs,
    boxes,
    pulls,
    hasSection: section !== null,
  };
}

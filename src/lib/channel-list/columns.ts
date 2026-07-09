/* ============================================
   LOWPASS — channel-list column source of truth (§CL-FIX-6)

   The base channel list is just Number + Name. Every other
   column is opt-in. This module is the single source of truth
   for: column order, labels, grid track sizes, which columns
   are permanent / always-on / keyboard-focusable, and which
   aggregate-section buttons a column gates (controlsButton).

   Enabled columns live in rider_sections.metadata.enabled_columns
   (a JSONB string array of optional column keys). When absent
   (existing sections, pre-§CL-FIX-6), we lazily derive the set
   from which columns actually carry data — so existing tours
   look unchanged without a heavy SQL backfill.

   Per Adam (§CL-FIX-6): mic_substitute is NOT a column (the new
   Mic/DI combobox covers substitutes informally).
   ============================================ */

import type { ChannelListRow } from '@/lib/rider-packs/types';

export type ChannelListColumnKey =
  | 'number'
  | 'name'
  | 'position'
  | 'stage_box'
  | 'sub_snake'
  | 'cable_length'
  | 'mic'
  | 'gain'
  | 'stand'
  | 'phantom_power'
  | 'provider'
  | 'notes';

export type ColumnButton =
  | 'manage-sub-snakes'
  | 'manage-stage-boxes'
  | 'cables-inventory'
  | 'manage-mic-library';

export interface ChannelListColumnDef {
  key: ChannelListColumnKey;
  label: string;
  /** Grid track size (matches the legacy CHANNEL_ROW_GRID sizes). */
  track: string;
  /** Always rendered (Number, Name). */
  alwaysOn: boolean;
  /** Can never be toggled off (Number, Name). */
  permanent: boolean;
  /** Keyboard-focusable cell → gets a NavCell + nav col index.
   *  Number is display-only. */
  focusable: boolean;
  /** Aggregate-section button gated on this column being enabled. */
  controlsButton?: ColumnButton;
}

/* Ordered exactly as the editor renders them (after the 2 chrome
   tracks — colour stripe + drag handle — which live outside this
   list). Number is the sticky col 1; Name through Notes follow. */
export const CHANNEL_LIST_COLUMNS: ChannelListColumnDef[] = [
  { key: 'number', label: '#', track: '32px', alwaysOn: true, permanent: true, focusable: false },
  { key: 'name', label: 'Name', track: 'minmax(10rem,1.4fr)', alwaysOn: true, permanent: true, focusable: true },
  { key: 'position', label: 'Pos', track: 'minmax(4rem,0.55fr)', alwaysOn: false, permanent: false, focusable: true },
  { key: 'stage_box', label: 'Stage Box', track: 'minmax(4.5rem,0.7fr)', alwaysOn: false, permanent: false, focusable: true, controlsButton: 'manage-stage-boxes' },
  { key: 'sub_snake', label: 'Loom', track: 'minmax(4.5rem,0.7fr)', alwaysOn: false, permanent: false, focusable: true, controlsButton: 'manage-sub-snakes' },
  { key: 'cable_length', label: 'Cable', track: 'minmax(4rem,0.55fr)', alwaysOn: false, permanent: false, focusable: true, controlsButton: 'cables-inventory' },
  { key: 'mic', label: 'Mic / DI', track: 'minmax(6rem,1fr)', alwaysOn: false, permanent: false, focusable: true, controlsButton: 'manage-mic-library' },
  // VIS-CL-06 — Gain column (channel_list_rows.gain, migration 238). Free text
  // so it holds "+4", "unity", "-10dB", etc.
  { key: 'gain', label: 'Gain', track: 'minmax(4rem,0.55fr)', alwaysOn: false, permanent: false, focusable: true },
  { key: 'stand', label: 'Stand', track: 'minmax(4rem,0.6fr)', alwaysOn: false, permanent: false, focusable: true },
  { key: 'phantom_power', label: '+48', track: '2.25rem', alwaysOn: false, permanent: false, focusable: true },
  { key: 'provider', label: 'Prov', track: 'minmax(4.5rem,0.55fr)', alwaysOn: false, permanent: false, focusable: true },
  { key: 'notes', label: 'Notes', track: 'minmax(7rem,1.1fr)', alwaysOn: false, permanent: false, focusable: true },
];

export const COLUMN_BY_KEY: Record<ChannelListColumnKey, ChannelListColumnDef> = Object.fromEntries(
  CHANNEL_LIST_COLUMNS.map((c) => [c.key, c]),
) as Record<ChannelListColumnKey, ChannelListColumnDef>;

/** Optional (toggleable) columns, in canonical order. */
export const OPTIONAL_COLUMNS: ChannelListColumnDef[] = CHANNEL_LIST_COLUMNS.filter((c) => !c.permanent);

const OPTIONAL_KEY_SET = new Set<string>(OPTIONAL_COLUMNS.map((c) => c.key));

/** True when at least one row carries non-default data for `key`. */
function columnHasData(key: ChannelListColumnKey, rows: ChannelListRow[]): boolean {
  return rows.some((r) => {
    switch (key) {
      case 'position':
        return (r.position ?? '').trim().length > 0;
      case 'stage_box':
        return r.stage_box_id != null;
      case 'sub_snake':
        return r.sub_snake_id != null;
      case 'cable_length':
        return (r.cable_length ?? '').trim().length > 0;
      case 'mic':
        return (r.mic ?? '').trim().length > 0;
      case 'gain':
        return (r.gain ?? '').trim().length > 0;
      case 'stand':
        return (r.stand ?? '').trim().length > 0;
      case 'phantom_power':
        return r.phantom_power === true;
      case 'provider':
        return r.provider != null;
      case 'notes':
        return (r.notes ?? '').trim().length > 0;
      default:
        return false;
    }
  });
}

/** Lazy backfill: optional columns that carry data on any row. */
export function deriveEnabledColumns(rows: ChannelListRow[]): ChannelListColumnKey[] {
  return OPTIONAL_COLUMNS.filter((c) => columnHasData(c.key, rows)).map((c) => c.key);
}

/** Read the persisted enabled set from metadata, or lazily derive
 *  it from row data when absent. Always includes the permanent
 *  columns. Returns enabled column keys in canonical order. */
export function getEnabledColumnKeys(
  metadata: Record<string, unknown> | null | undefined,
  rows: ChannelListRow[],
): ChannelListColumnKey[] {
  const raw = metadata?.enabled_columns;
  const enabledOptional = Array.isArray(raw)
    ? new Set(raw.filter((k): k is string => typeof k === 'string' && OPTIONAL_KEY_SET.has(k)))
    : new Set<string>(deriveEnabledColumns(rows));
  return CHANNEL_LIST_COLUMNS.filter((c) => c.permanent || enabledOptional.has(c.key)).map((c) => c.key);
}

/** The optional-column keys currently enabled (for persisting). */
export function enabledOptionalKeys(enabledKeys: ChannelListColumnKey[]): ChannelListColumnKey[] {
  const set = new Set(enabledKeys);
  return OPTIONAL_COLUMNS.filter((c) => set.has(c.key)).map((c) => c.key);
}

/* ============================================
   LOWPASS — Rider/Pack shared types

   Keep in sync with migration 034 column shapes and
   with RIDER_PACK_DESIGN.md §5.3 (field primitives).
   ============================================ */

export type PackScope = 'artist' | 'tour' | 'show';

/** Field primitive discriminated union. See design §5.3. */
export type FieldText = {
  type: 'text';
  key: string;
  label?: string;
  value: string; // HTML or markdown — client decides render
};

export type FieldTable = {
  type: 'table';
  key: string;
  label?: string;
  columns: { key: string; label: string }[];
  rows: Record<string, string>[];
};

export type FieldContact = {
  type: 'contact';
  key: string;
  label?: string;
  // Resolved at render; stored as references.
  entries: Array<{
    source: 'tour_personnel' | 'contact' | 'external';
    ref_id?: string; // personnel_tour_assignments.id / contacts.id
    // For external or overrides, inline fields:
    name?: string;
    role?: string;
    email?: string;
    phone?: string;
    company?: string;
    notes?: string;
    show_fields: Array<'name' | 'role' | 'email' | 'phone' | 'company' | 'notes'>;
  }>;
};

export type FieldAsset = {
  type: 'asset';
  key: string;
  label?: string;
  asset_id: string; // FK to rider_assets.id
};

export type FieldTime = {
  type: 'time';
  key: string;
  label?: string;
  value: string; // 'HH:MM' 24h
  tz?: string;   // IANA, e.g. 'Europe/London'
};

export type FieldCurrency = {
  type: 'currency';
  key: string;
  label?: string;
  amount: number;
  currency: string; // ISO 4217, e.g. 'USD'
};

export type FieldNumber = {
  type: 'number';
  key: string;
  label?: string;
  value: number;
  unit?: string;
};

export type FieldCheckboxList = {
  type: 'checkbox_list';
  key: string;
  label?: string;
  items: { key: string; label: string; checked: boolean }[];
};

export type FieldUrl = {
  type: 'url';
  key: string;
  label?: string;
  href: string;
  display_text?: string;
};

export type Field =
  | FieldText
  | FieldTable
  | FieldContact
  | FieldAsset
  | FieldTime
  | FieldCurrency
  | FieldNumber
  | FieldCheckboxList
  | FieldUrl;

export const FIELD_TYPES = [
  'text', 'table', 'contact', 'asset',
  'time', 'currency', 'number', 'checkbox_list', 'url',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

/** How section content is stored and edited.
 *
 *  Sprint 12 §9a extension:
 *    - 'rich_text'        Tiptap document stored in
 *                         rider_sections.metadata.content.
 *                         The legacy `fields` array stays
 *                         empty for rich_text sections.
 *    - 'advance_summary'  9-line subject/body summary panel
 *                         (Sprint 12 §9d). Stored in
 *                         rider_sections.metadata.summary
 *                         as an ordered array.
 *  Both new types live alongside the existing 'fields' and
 *  'channel_list' values; the DB column is plain TEXT so no
 *  enum migration is needed. */
export type SectionType = 'fields' | 'channel_list' | 'rich_text' | 'advance_summary';

/** Grouping for rider content: many per artist / tour / show; one pack per folder (migration 039). */
export type RiderFolder = {
  id: string;
  workspace_id: string;
  artist_id: string;
  scope: PackScope;
  tour_id: string | null;
  routing_id: string | null;
  title: string | null;
  inherit_from_folder_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** rider_packs row. */
export type RiderPack = {
  id: string;
  workspace_id: string;
  /** 1:1 with rider_folders (folder is the "rider" slot in the UI). Set after migration 039. */
  folder_id?: string;
  scope: PackScope;
  artist_id: string;
  tour_id: string | null;
  routing_id: string | null;
  title: string | null;
  google_doc_id: string | null;
  google_doc_url: string | null;
  created_by: string | null;
  /** Sprint 12 §9a — cover-page columns added in migration 100.
   *  All optional; cover_logo_url falls back to the artist's
   *  default_logo_url at render time when null. */
  cover_logo_url?: string | null;
  cover_subtitle?: string | null;
  cover_disclaimer?: string | null;
  created_at: string;
  updated_at: string;
  /** Set when list/detail embeds the folder (optional on older clients). */
  folder?: RiderFolder | null;
};

/** rider_sections row (as stored). */
export type RiderSection = {
  id: string;
  pack_id: string;
  section_key: string;
  title: string;
  sort_order: number;
  /** Defaults to `fields` when missing (pre-migration rows). */
  section_type?: SectionType;
  fields: Field[];
  /** Sprint 12 §9a — free-shaped per-section JSONB column
   *  added in migration 100. Used by:
   *    - section_type='rich_text': `{ content: <Tiptap doc JSON> }`
   *    - section_type='advance_summary': `{ summary: Array<{subject, body}> }`
   *    - section_type='channel_list': `{ inventory_notes: Record<key, string> }`
   *      (deferred from §8b3; lands in a follow-up after §9 core)
   *  Defaults to `{}` on the DB side; consumers should treat
   *  missing keys as the empty/default state. */
  metadata?: Record<string, unknown> | null;
  /** Migration 111 (§RA1) — section completion tracking. Optional on
   *  older clients / pre-migration rows. */
  status?: 'not_started' | 'in_progress' | 'complete' | 'needs_review' | null;
  last_updated_by_id?: string | null;
  template_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type SubSnake = {
  id: string;
  pack_id: string;
  section_id: string;
  label: string;
  colour: string;
  /** Max patch positions 1..capacity per box. */
  capacity: number;
  position: number;
  created_at: string;
};

export type StageBox = {
  id: string;
  pack_id: string;
  section_id: string;
  label: string;
  colour: string;
  capacity: number;
  position: number;
  created_at: string;
};

export type ChannelListRow = {
  id: string;
  pack_id: string;
  section_id: string;
  row_index: number;
  channel_name: string;
  sub_snake_id: string | null;
  sub_snake_position: number | null;
  stage_box_id: string | null;
  stage_box_position: number | null;
  position: string;
  gear_id: string | null;
  mic: string;
  mic_substitute: string;
  di: string;
  /** VIS-CL-06 — free-text gain ("+4", "unity", "-10dB"). Migration 238. */
  gain: string | null;
  stand: string;
  phantom_power: boolean | null;
  provider: 'band' | 'venue' | 'hire' | null;
  notes: string;
  /* Sprint 12 §8a — output-row support. row_kind='input'
     rows use the mic/di/stand/phantom_power columns above
     and ignore the output_* columns. row_kind='output' rows
     populate the output_* columns and leave input fields
     NULL. The editor renders the two kinds in stacked sub-
     tables; the migration adds row_kind with default 'input'
     so existing rows backfill correctly. */
  row_kind: 'input' | 'output';
  output_item: string | null;
  output_destination: string | null;
  output_qty: number | null;
  output_notes: string | null;
  /* §CL-FIX-7 — outputs v2. output_description supersedes
     output_destination (kept one tour for safety); output_is_stereo
     + output_position model the "Mark as stereo" 1+2 display. */
  output_description: string | null;
  output_is_stereo: boolean;
  output_position: string | null;
  /* Sprint 12 §8a — cable length feeding the Cables
     aggregate. Stored as text so the editor's hardcoded
     options round-trip exactly. */
  cable_length: string | null;
  created_at: string;
  updated_at: string;
};

export type Provider = 'band' | 'venue' | 'hire';

export type MicLibraryEntry = {
  id: string;
  name: string;
  type: 'dynamic' | 'condenser' | 'ribbon' | 'di_active' | 'di_passive';
  default_phantom: boolean;
};

/** Resolved section with inheritance metadata. */
export type ResolvedSection = RiderSection & {
  /** Where this section actually came from. null = authored at current scope. */
  inherited_from: PackScope | null;
  /** Pack ID the section was sourced from (may differ from the requested pack). */
  source_pack_id: string;
  /** Set when `section_type === 'channel_list'` (from resolve). */
  subSnakes?: SubSnake[];
  /** Set when `section_type === 'channel_list'` (from resolve). */
  stageBoxes?: StageBox[];
  /** Set when `section_type === 'channel_list'` (from resolve). */
  rows?: ChannelListRow[];
};

/** Shape returned by GET /api/rider-packs/[id]/resolved. */
export type ResolvedPack = {
  pack: RiderPack;
  sections: ResolvedSection[];
};

export const HISTORY_CHANGE_TYPES = [
  'pack.created',
  'pack.updated',
  'pack.deleted',
  'section.added',
  'section.updated',
  'section.removed',
  'section.reordered',
  /* Sprint 12 §7 — fired when an artist-scope template is
     instantiated onto a tour via the AssignToTourDialog.
     newValue carries { template_pack_id, template_folder_id,
     tour_id, tour_name, kind, sections_copied }. */
  'pack.assigned_from_template',
] as const;

export type HistoryChangeType = (typeof HISTORY_CHANGE_TYPES)[number];

export type RiderPackHistoryRow = {
  id: string;
  pack_id: string;
  changed_by: string | null;
  change_type: HistoryChangeType | string;
  section_key: string | null;
  field_key: string | null;
  old_value: unknown;
  new_value: unknown;
  changed_at: string;
};

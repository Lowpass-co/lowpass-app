/* ============================================
   LOWPASS — Riders: the shapes (rebuild, Nov 2026 — migration 301)

   A tour has two documents, Tech and Hospitality, each an ordered list of
   blocks. A block is one heading, one piece of prose, one request line, one
   table, the key contacts, the advance summary, the attachments or a page
   break. Request lines are what make the rider answerable: a quantity, the
   item, who provides it, what else is acceptable — each line can be replied
   to by the venue and settled per show.

   Publishing freezes both documents into a snapshot (`RiderSnapshot`) — the
   legal reference copy promoters see, numbered 1.0, 1.1 … 2.0.
   ============================================ */

export const RIDER_KINDS = ['tech', 'hospitality'] as const;
export type RiderKind = (typeof RIDER_KINDS)[number];
export const RIDER_KIND_LABEL: Record<RiderKind, string> = { tech: 'Tech', hospitality: 'Hospitality' };
export const RIDER_DEFAULT_TITLE: Record<RiderKind, string> = {
  tech: 'Technical & Production Rider',
  hospitality: 'Hospitality Rider',
};

export const BLOCK_KINDS = ['heading', 'text', 'request', 'table', 'contacts', 'summary', 'files', 'break'] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

/** Tiptap / ProseMirror JSON, StarterKit subset (see prose.ts). */
export interface ProseMark {
  type: string;
  attrs?: Record<string, unknown>;
}
export interface ProseNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: ProseNode[];
  text?: string;
  marks?: ProseMark[];
}
export interface ProseDoc {
  type: 'doc';
  content: ProseNode[];
}

/** Who provides a requested item. */
export const PROVIDERS = [
  { id: 'venue', label: 'Venue provides', short: 'Venue' },
  { id: 'promoter', label: 'Promoter provides', short: 'Promoter' },
  { id: 'artist', label: 'We bring', short: 'We bring' },
] as const;
export type Provider = (typeof PROVIDERS)[number]['id'];

export interface HeadingContent {
  text: string;
  /** 1 = a section (in the outline, groups the summary); 2 = a sub-heading. */
  level: 1 | 2;
}
export interface TextContent {
  doc: ProseDoc;
}
export interface RequestContent {
  /** null = no count ("Shore power where possible"). */
  qty: number | null;
  item: string;
  provider: Provider | null;
  /** What else is acceptable ("Gretsch Roundbadge / DW"). */
  alternatives: string;
  note: string;
  /** A nice-to-have, printed "If possible". Requests are requirements by default. */
  optional: boolean;
  /** qty is per person in the touring party ("1 towel per person"). */
  perPerson: boolean;
  /** Listed in the advance summary. */
  summary: boolean;
}
export interface TableContent {
  columns: string[];
  rows: string[][];
}
export interface Contact {
  name: string;
  role: string;
  phone: string;
  email: string;
  /** A People record it came from (crew picker), if any. */
  personId: string | null;
}
export interface ContactsContent {
  people: Contact[];
}
export interface SummaryContent {
  title: string;
}
export type Attachment =
  | { kind: 'channel_list' }
  | { kind: 'stage_plot' }
  | { kind: 'file'; id: string; label: string };
export interface FilesContent {
  items: Attachment[];
}
export type BreakContent = Record<string, never>;

export interface BlockContentMap {
  heading: HeadingContent;
  text: TextContent;
  request: RequestContent;
  table: TableContent;
  contacts: ContactsContent;
  summary: SummaryContent;
  files: FilesContent;
  break: BreakContent;
}

/** A block as the editor holds it. `from` / `until` = the show dates it
 *  applies to (YYYY-MM-DD, inclusive); both null = every show. */
export type RiderBlock = {
  [K in BlockKind]: {
    id: string;
    riderId: string;
    kind: K;
    position: string;
    content: BlockContentMap[K];
    from: string | null;
    until: string | null;
    version: number;
    updatedBy?: string | null;
    updatedAt?: string | null;
  };
}[BlockKind];

/** A block frozen in a published version. */
export type SnapBlock = {
  [K in BlockKind]: { id: string; kind: K; content: BlockContentMap[K]; from: string | null; until: string | null };
}[BlockKind];

export interface SnapDoc {
  kind: RiderKind;
  title: string;
  blocks: SnapBlock[];
}

/** An attachment resolved to what it is on this tour at publish time. */
export interface ResolvedAttachment {
  kind: 'channel_list' | 'stage_plot' | 'file';
  /** channel_list: the tour id (the export resolves the tour's list);
   *  stage_plot: the stage_plots id; file: the file_references id. null =
   *  not on this tour (shown as "not attached yet", never a dead link). */
  id: string | null;
  label: string;
}

export interface RiderSnapshot {
  v: 1;
  tourName: string;
  artistName: string | null;
  party: number | null;
  docs: SnapDoc[];
  attachments: ResolvedAttachment[];
}

export type ChangeType = 'added' | 'removed' | 'changed';
export interface RiderChange {
  doc: RiderKind | null;
  /** The section (level-1 heading) the block sits under. */
  section: string | null;
  type: ChangeType;
  /** The line as it reads now (or as it read, when removed). */
  what: string;
  before?: string;
  after?: string;
  /** Applies only from / until — said in the line. */
  from?: string | null;
  until?: string | null;
  blockId: string | null;
}

export interface VersionNo {
  major: number;
  minor: number;
}

/** Per-show settlement of a request line. */
export const LINE_STATES = [
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'substitute', label: 'Substitute' },
  { id: 'cut', label: 'Cut' },
] as const;
export type LineState = (typeof LINE_STATES)[number]['id'];

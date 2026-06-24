/* ============================================================
   LOWPASS — RAG source text builders (PII excluded by construction)

   One pure function per source kind. Each turns a record into the
   NON-personal text to embed + non-PII metadata. ALLOW-LIST ONLY: the
   ingestion layer SELECTs exactly the columns referenced here, so the
   special-category / identity columns from docs/gdpr/DATA_MAP.md never
   even reach this module — defence in depth, not just discipline.

   Privacy invariant (AI_ASSISTANT_ARCHITECTURE.md §2 Layer A): embed
   operational content only. When in doubt, EXCLUDE and surface the column
   to Adam — exclude-and-ask beats embed-and-leak.

   DATA_MAP rows honoured (the EXCLUDED side is the point):
     - deal_memos (DATA_MAP §3c): EXCLUDE promoter_name / promoter_email /
       promoter_phone (identity+contact), notes (free text → may hold PII),
       document_filename, created_by/updated_by. INCLUDE the commercial
       terms (DATA_MAP §6 treats fee/settlement figures as non-personal).
     - venues (DATA_MAP §3c, F4): EXCLUDE the `contacts` JSONB (people),
       `notes`, and the free-form `technical_specs`/`hospitality_info`/
       `parking_info`/`union_rules` blobs (a user could type a person into
       any of them). INCLUDE only name/city/country/capacity — unambiguous
       business facts. (technical_specs is operational but free-form; left
       out of v1 pending Adam's confirmation — see done report.)
     - budget_line_items (DATA_MAP §6): figures+labels are commercial, not
       personal. EXCLUDE `notes` (free text). INCLUDE category/label/cost.
   ============================================================ */

export const RAG_SOURCE_KINDS = ['deal_memo', 'venue', 'budget_line_item'] as const;
export type RagSourceKind = (typeof RAG_SOURCE_KINDS)[number];

/** Non-PII metadata stored alongside a chunk (location/date/refs only). */
export type RagChunkMetadata = Record<string, string | number | null>;

export interface RagChunkContent {
  content: string;
  metadata: RagChunkMetadata;
}

/* ── deal_memo ───────────────────────────────────────────────────────
   Allow-listed columns + non-PII joined context (venue name/city/date
   from the routing row, resolved by the ingestion layer). */
export interface DealMemoSource {
  id: string;
  title?: string | null;
  reference?: string | null;
  fee_amount?: number | null;
  fee_currency?: string | null;
  deposit_amount?: number | null;
  deposit_currency?: string | null;
  settlement_method?: string | null;
  status?: string | null;
  terms_summary?: string | null;
  // non-PII context (joined):
  tour_id?: string | null;
  show_id?: string | null;
  venue_name?: string | null; // venue is a business, not a person
  city?: string | null;
  show_date?: string | null;
}

export function buildDealMemoChunk(row: DealMemoSource): RagChunkContent | null {
  const lines: string[] = [];
  if (row.title) lines.push(`Deal memo: ${row.title}`);
  if (row.venue_name || row.city) {
    lines.push(`Venue: ${[row.venue_name, row.city].filter(Boolean).join(', ')}`);
  }
  if (row.show_date) lines.push(`Show date: ${row.show_date}`);
  if (typeof row.fee_amount === 'number') {
    lines.push(`Guarantee/fee: ${row.fee_amount}${row.fee_currency ? ` ${row.fee_currency}` : ''}`);
  }
  if (typeof row.deposit_amount === 'number') {
    lines.push(`Deposit: ${row.deposit_amount}${row.deposit_currency ? ` ${row.deposit_currency}` : ''}`);
  }
  if (row.settlement_method) lines.push(`Settlement: ${row.settlement_method}`);
  if (row.status) lines.push(`Status: ${row.status}`);
  if (row.terms_summary) lines.push(`Terms: ${row.terms_summary}`);

  if (lines.length === 0) return null;
  return {
    content: lines.join('\n'),
    metadata: {
      tour_id: row.tour_id ?? null,
      show_id: row.show_id ?? null,
      city: row.city ?? null,
      show_date: row.show_date ?? null,
    },
  };
}

/* ── venue ───────────────────────────────────────────────────────────
   Only the unambiguous business facts. The JSONB/free-text columns are
   deliberately not in this interface so they can't be embedded. */
export interface VenueSource {
  id: string;
  name?: string | null;
  city?: string | null;
  country?: string | null;
  capacity?: number | null;
}

export function buildVenueChunk(row: VenueSource): RagChunkContent | null {
  const lines: string[] = [];
  if (row.name) lines.push(`Venue: ${row.name}`);
  const loc = [row.city, row.country].filter(Boolean).join(', ');
  if (loc) lines.push(`Location: ${loc}`);
  if (typeof row.capacity === 'number') lines.push(`Capacity: ${row.capacity}`);

  // A venue with no name is nothing to embed (city/capacity alone aren't
  // a retrievable entity).
  if (!row.name) return null;
  return {
    content: lines.join('\n'),
    metadata: {
      city: row.city ?? null,
      country: row.country ?? null,
      capacity: typeof row.capacity === 'number' ? row.capacity : null,
    },
  };
}

/* ── budget_line_item ────────────────────────────────────────────────
   Commercial figures + labels (DATA_MAP §6 non-personal). notes excluded. */
export interface BudgetLineItemSource {
  id: string;
  category?: string | null;
  label?: string | null;
  proposed_cost?: number | null;
  actual_cost?: number | null;
  currency?: string | null;
  // non-PII context:
  tour_id?: string | null;
  routing_id?: string | null;
  city?: string | null;
  show_date?: string | null;
}

export function buildBudgetLineItemChunk(row: BudgetLineItemSource): RagChunkContent | null {
  if (!row.label) return null;
  const lines: string[] = [`Budget line: ${row.label}`];
  if (row.category) lines.push(`Category: ${row.category}`);
  if (typeof row.proposed_cost === 'number') {
    lines.push(`Proposed cost: ${row.proposed_cost}${row.currency ? ` ${row.currency}` : ''}`);
  }
  if (typeof row.actual_cost === 'number' && row.actual_cost !== 0) {
    lines.push(`Actual cost: ${row.actual_cost}${row.currency ? ` ${row.currency}` : ''}`);
  }
  if (row.city) lines.push(`City: ${row.city}`);
  if (row.show_date) lines.push(`Date: ${row.show_date}`);

  return {
    content: lines.join('\n'),
    metadata: {
      tour_id: row.tour_id ?? null,
      routing_id: row.routing_id ?? null,
      city: row.city ?? null,
      show_date: row.show_date ?? null,
    },
  };
}

/** Dispatch a source row to its builder by kind. */
export function buildChunk(
  kind: RagSourceKind,
  row: DealMemoSource | VenueSource | BudgetLineItemSource,
): RagChunkContent | null {
  switch (kind) {
    case 'deal_memo':
      return buildDealMemoChunk(row as DealMemoSource);
    case 'venue':
      return buildVenueChunk(row as VenueSource);
    case 'budget_line_item':
      return buildBudgetLineItemChunk(row as BudgetLineItemSource);
    default:
      return null;
  }
}

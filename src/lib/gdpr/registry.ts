/* ============================================================
   LOWPASS — GDPR data-subject registry (single source of truth)

   Encodes docs/gdpr/DATA_MAP.md as code. The export (Art. 15/20) and
   erasure (Art. 17) routines BOTH iterate this list — it is the only
   place that decides what personal data exists and what happens to it.
   Adding a PII-bearing table/column WITHOUT adding it here = an
   incomplete export and a non-compliant erasure. Keep this in sync with
   the schema (a CI check that diffs columns against this registry is a
   recommended follow-up).

   ⚠️ DRAFT — pending Adam's sign-off on the DATA_MAP classifications,
   especially `retain_legal` periods (need legal input) and the
   special-category (Art. 9) fields. Erasure execution must not run
   against `retain_legal` rows until retention windows are configured.
   ============================================================ */

export type SubjectType = 'account' | 'roster_person' | 'external_contact' | 'venue_intake';

export type EraseAction =
  | 'delete' // hard-delete the row
  | 'anonymize' // scrub identity columns, keep the row + FKs
  | 'retain_legal' // keep (statutory retention); anonymize identity; gated on retention window
  | 'nullify_author'; // null/tombstone an author FK; keep the content row

export type PiiCategory =
  | 'identity'
  | 'contact'
  | 'financial'
  | 'location'
  | 'special_category' // Art. 9 — dietary/health/religion-revealing, passport, DOB, emergency contact
  | 'authorship'
  | 'technical'; // IPs, tokens

export interface SubjectLink {
  /** Column used to resolve rows for a subject. */
  column: string;
  /** How to match it to the subject. 'free_text_name' is unreliable — see DATA_MAP F2. */
  via: 'user_id' | 'person_id' | 'personnel_id' | 'canonical_person_id' | 'email' | 'free_text_name' | 'author_fk' | 'self_id';
}

export interface TableRule {
  table: string;
  subjects: SubjectType[];
  /** Personal-data columns (excludes business/non-personal columns). */
  piiColumns: string[];
  /** Free-form JSONB columns that may hide PII (need bespoke handling). */
  jsonbBlobs?: string[];
  category: PiiCategory[];
  /** One or more ways to find this subject's rows. */
  links: SubjectLink[];
  action: EraseAction;
  /** Columns to overwrite with a tombstone on `anonymize`/`retain_legal`. */
  anonymizeColumns?: string[];
  notes?: string;
}

/** Supabase Storage buckets holding personal files — erasure/export must
 *  walk objects under the subject's folder, not just DB rows. */
export const STORAGE_BUCKETS = [
  { bucket: 'personnel', risk: 'uploaded personnel documents — likely passport/visa scans', folderKey: 'person/personnel id' },
  { bucket: 'profiles', risk: 'avatars', folderKey: 'auth uid' },
  { bucket: 'artist-assets', risk: 'logos/banners (may depict individuals)', folderKey: 'auth uid' },
  { bucket: 'rider-assets', risk: 'rider attachments', folderKey: 'workspace/pack' },
  // Budget receipts live in storage too (per /api/budget/receipts/upload) — confirm bucket name.
  { bucket: 'receipts', risk: 'receipts showing cardholder names', folderKey: 'workspace/tour' },
] as const;

export const REGISTRY: TableRule[] = [
  // ── 3a. Account-user data ───────────────────────────────────────────
  { table: 'profiles', subjects: ['account'], piiColumns: ['name', 'email', 'phone', 'avatar_url', 'passport_encrypted'], category: ['identity', 'contact', 'special_category'], links: [{ column: 'id', via: 'self_id' }], action: 'delete', notes: 'passport encrypted at app layer ✅' },
  { table: 'workspace_members', subjects: ['account'], piiColumns: ['user_id'], category: ['identity'], links: [{ column: 'user_id', via: 'user_id' }], action: 'delete' },
  { table: 'workspace_member_tags', subjects: ['account'], piiColumns: ['tag_name', 'member_id'], category: ['identity'], links: [{ column: 'member_id', via: 'user_id' }], action: 'delete' },
  { table: 'notifications', subjects: ['account'], piiColumns: ['user_id'], category: ['technical'], links: [{ column: 'user_id', via: 'user_id' }], action: 'delete' },
  { table: 'ai_usage_events', subjects: ['account'], piiColumns: ['user_id'], category: ['technical'], links: [{ column: 'user_id', via: 'user_id' }], action: 'nullify_author', anonymizeColumns: ['user_id'], notes: 'keep cost row for accounting; null the user' },
  { table: 'ai_usage_user_overrides', subjects: ['account'], piiColumns: ['user_id', 'notes'], category: ['technical'], links: [{ column: 'user_id', via: 'user_id' }], action: 'delete' },
  { table: 'audit_log', subjects: ['account'], piiColumns: ['actor_user_id'], category: ['authorship'], links: [{ column: 'actor_user_id', via: 'user_id' }], action: 'retain_legal', anonymizeColumns: ['actor_user_id'], notes: 'breach-evidence log (Art. 33) — keep event, anonymize actor after retention. CONFIRM tension.' },

  // ── 3b. Roster people ───────────────────────────────────────────────
  { table: 'persons', subjects: ['roster_person'], piiColumns: ['full_name', 'preferred_name', 'email', 'phone', 'date_of_birth', 'emergency_contact', 'dietary', 'passport_full_name', 'passport_number', 'passport_country', 'passport_expiry', 'notes'], category: ['identity', 'contact', 'special_category'], links: [{ column: 'id', via: 'person_id' }, { column: 'canonical_person_id', via: 'canonical_person_id' }], action: 'anonymize', anonymizeColumns: ['full_name', 'preferred_name', 'email', 'phone', 'date_of_birth', 'emergency_contact', 'dietary', 'passport_full_name', 'passport_number', 'passport_country', 'passport_expiry', 'notes'], notes: 'special-category + plaintext passport (DATA_MAP F1/F3)' },
  { table: 'canonical_persons', subjects: ['roster_person'], piiColumns: ['display_name', 'email', 'phone'], category: ['identity', 'contact'], links: [{ column: 'id', via: 'canonical_person_id' }], action: 'anonymize', anonymizeColumns: ['display_name', 'email', 'phone'] },
  { table: 'personnel', subjects: ['roster_person', 'account'], piiColumns: ['name', 'email', 'phone', 'dietary_needs', 'passport_info', 'user_id'], jsonbBlobs: ['passport_info'], category: ['identity', 'contact', 'special_category'], links: [{ column: 'id', via: 'personnel_id' }, { column: 'user_id', via: 'user_id' }], action: 'anonymize', anonymizeColumns: ['name', 'email', 'phone', 'dietary_needs', 'passport_info'] },
  { table: 'personnel_rates', subjects: ['roster_person'], piiColumns: ['person_name', 'person_id', 'roster_personnel_id', 'base_rate_note', 'commission_note'], category: ['financial', 'identity'], links: [{ column: 'person_id', via: 'person_id' }, { column: 'roster_personnel_id', via: 'personnel_id' }, { column: 'person_name', via: 'free_text_name' }], action: 'retain_legal', anonymizeColumns: ['person_name'], notes: 'keep rate figures; anonymize name. free-text name = F2' },
  { table: 'payroll_entries', subjects: ['roster_person'], piiColumns: ['person_id', 'personnel_id', 'notes'], category: ['financial'], links: [{ column: 'person_id', via: 'person_id' }, { column: 'personnel_id', via: 'personnel_id' }], action: 'retain_legal', notes: 'keep amounts, scrub identity via person ref' },
  { table: 'flights', subjects: ['roster_person'], piiColumns: ['person_name', 'passenger_ids', 'pnr', 'notes'], category: ['identity', 'location'], links: [{ column: 'passenger_ids', via: 'person_id' }, { column: 'person_name', via: 'free_text_name' }], action: 'anonymize', anonymizeColumns: ['person_name', 'pnr'], notes: 'PNR is travel PII' },
  { table: 'flight_bookings', subjects: ['roster_person'], piiColumns: ['person_name'], category: ['identity'], links: [{ column: 'person_name', via: 'free_text_name' }], action: 'anonymize', anonymizeColumns: ['person_name'] },
  { table: 'hotel_room_assignments', subjects: ['roster_person'], piiColumns: ['person_name', 'notes'], category: ['identity'], links: [{ column: 'person_name', via: 'free_text_name' }], action: 'anonymize', anonymizeColumns: ['person_name'] },
  { table: 'rooming_grid', subjects: ['roster_person'], piiColumns: ['person_name', 'person_id'], category: ['identity'], links: [{ column: 'person_id', via: 'person_id' }, { column: 'person_name', via: 'free_text_name' }], action: 'anonymize', anonymizeColumns: ['person_name'] },
  { table: 'room_assignments', subjects: ['roster_person'], piiColumns: ['person_id', 'tour_personnel_id'], category: ['identity'], links: [{ column: 'person_id', via: 'person_id' }], action: 'delete' },
  { table: 'tour_personnel', subjects: ['roster_person'], piiColumns: ['person_id'], category: ['identity'], links: [{ column: 'person_id', via: 'person_id' }], action: 'delete' },
  { table: 'personnel_tour_assignments', subjects: ['roster_person'], piiColumns: ['personnel_id'], category: ['identity'], links: [{ column: 'personnel_id', via: 'personnel_id' }], action: 'delete' },
  { table: 'personnel_intake_tokens', subjects: ['roster_person'], piiColumns: ['personnel_id', 'notification_email_sent_to', 'invited_by_user_id'], category: ['contact', 'technical'], links: [{ column: 'personnel_id', via: 'personnel_id' }], action: 'delete' },
  { table: 'expenses', subjects: ['roster_person', 'account'], piiColumns: ['submitted_by', 'person_id', 'notes', 'receipt_url', 'receipt_filename', 'city', 'country'], category: ['financial', 'location'], links: [{ column: 'person_id', via: 'person_id' }, { column: 'submitted_by', via: 'user_id' }], action: 'retain_legal', anonymizeColumns: ['submitted_by'] },

  // ── 3c. External contacts ───────────────────────────────────────────
  { table: 'contacts', subjects: ['external_contact'], piiColumns: ['first_name', 'last_name', 'email', 'phone', 'notes', 'venue_name', 'person_id'], category: ['identity', 'contact'], links: [{ column: 'id', via: 'self_id' }, { column: 'email', via: 'email' }], action: 'delete' },
  { table: 'deal_memos', subjects: ['external_contact'], piiColumns: ['promoter_name', 'promoter_email', 'promoter_phone', 'document_filename', 'notes'], category: ['identity', 'contact', 'financial'], links: [{ column: 'promoter_email', via: 'email' }], action: 'retain_legal', anonymizeColumns: ['promoter_name', 'promoter_email', 'promoter_phone'], notes: 'contract — keep terms' },
  { table: 'venues', subjects: ['external_contact'], piiColumns: ['notes'], jsonbBlobs: ['contacts'], category: ['contact'], links: [{ column: 'contacts', via: 'email' }], action: 'anonymize', notes: 'venue is business; the contacts JSONB array is personal (F4)' },
  { table: 'routing', subjects: ['external_contact'], piiColumns: ['venue_phone', 'notes'], category: ['contact', 'location'], links: [{ column: 'venue_phone', via: 'free_text_name' }], action: 'anonymize', anonymizeColumns: ['venue_phone'], notes: 'venue address is business; phone may be a person' },
  { table: 'rental_jobs', subjects: ['external_contact'], piiColumns: ['client_name', 'billing_email', 'billing_phone', 'billing_address', 'billing_tax_id', 'notes', 'user_id'], category: ['identity', 'contact', 'financial'], links: [{ column: 'billing_email', via: 'email' }], action: 'retain_legal', anonymizeColumns: ['client_name', 'billing_email', 'billing_phone', 'billing_address', 'billing_tax_id'], notes: 'invoicing law' },

  // ── 3d. Venue-intake people ─────────────────────────────────────────
  { table: 'advance_intake_links', subjects: ['venue_intake'], piiColumns: ['recipient_name', 'recipient_email', 'submitted_by_name', 'submitted_by_email', 'last_viewer_ip', 'notification_email_sent_to'], jsonbBlobs: ['submitted_data'], category: ['identity', 'contact', 'technical'], links: [{ column: 'submitted_by_email', via: 'email' }, { column: 'recipient_email', via: 'email' }], action: 'delete', notes: 'M6 core — also retention-purge last_viewer_ip on schedule' },
  { table: 'advance_packet_links', subjects: ['venue_intake'], piiColumns: ['last_viewer_ip'], category: ['technical'], links: [{ column: 'last_viewer_ip', via: 'free_text_name' }], action: 'delete', notes: 'retention-purge IP' },
  { table: 'stage_plot_share_links', subjects: ['venue_intake'], piiColumns: ['last_viewer_ip'], category: ['technical'], links: [{ column: 'last_viewer_ip', via: 'free_text_name' }], action: 'delete', notes: 'retention-purge IP' },
  { table: 'stage_plots', subjects: ['account', 'roster_person'], piiColumns: ['show_tm_name', 'show_tm_email', 'show_tm_phone', 'notes'], category: ['identity', 'contact'], links: [{ column: 'show_tm_email', via: 'email' }], action: 'anonymize', anonymizeColumns: ['show_tm_name', 'show_tm_email', 'show_tm_phone'] },

  // ── Authored content (nullify author FK on account erasure) ─────────
  // Applied generically to created_by/updated_by/last_updated_by_id/etc.
  { table: 'workspace_invites', subjects: ['account', 'external_contact'], piiColumns: ['invited_email', 'invited_by_user_id', 'accepted_user_id', 'notification_email_sent_to'], category: ['contact', 'identity'], links: [{ column: 'invited_email', via: 'email' }, { column: 'accepted_user_id', via: 'user_id' }], action: 'delete' },
  { table: 'bug_reports', subjects: ['account'], piiColumns: ['description', 'resolution_notes', 'created_by'], category: ['authorship'], links: [{ column: 'created_by', via: 'author_fk' }], action: 'nullify_author', anonymizeColumns: ['created_by'], notes: 'free-text body may contain PII — flag for manual redaction' },
  { table: 'rider_assets', subjects: ['account'], piiColumns: ['created_by'], category: ['authorship'], links: [{ column: 'created_by', via: 'author_fk' }], action: 'nullify_author' },
  { table: 'rider_packs', subjects: ['account'], piiColumns: ['created_by'], category: ['authorship'], links: [{ column: 'created_by', via: 'author_fk' }], action: 'nullify_author' },
  { table: 'rider_web_links', subjects: ['account'], piiColumns: ['created_by'], category: ['authorship'], links: [{ column: 'created_by', via: 'author_fk' }], action: 'nullify_author' },
  { table: 'stage_plot_versions', subjects: ['account'], piiColumns: ['created_by'], category: ['authorship'], links: [{ column: 'created_by', via: 'author_fk' }], action: 'nullify_author' },
  { table: 'stage_plot_custom_items', subjects: ['account'], piiColumns: ['created_by'], category: ['authorship'], links: [{ column: 'created_by', via: 'author_fk' }], action: 'nullify_author' },
  { table: 'rental_movements', subjects: ['account'], piiColumns: ['scanned_by_user_id', 'notes'], category: ['authorship'], links: [{ column: 'scanned_by_user_id', via: 'author_fk' }], action: 'nullify_author' },
  { table: 'budget_line_item_notes', subjects: ['account'], piiColumns: ['created_by'], category: ['authorship'], links: [{ column: 'created_by', via: 'author_fk' }], action: 'nullify_author' },
];

/* ── RAG index cascade (build #2, AI_ASSISTANT_ARCHITECTURE §2 Layer A) ──
   A per-workspace semantic index (public.rag_chunks) embeds PII-STRIPPED
   text derived from `deal_memos`, `venues`, and `budget_line_items`. When
   the Art. 17 erasure executor is built (it does NOT exist yet — see
   migration 207), it must, for every erased/anonymised row of those three
   tables, also clear the derived chunk by calling
   `deleteSourceChunks(workspaceId, table, sourceId)` from
   src/lib/ai/rag/reindex.ts (RAG_INDEXED_TABLES maps table→source_kind).
   Per-record deletes already cascade via the entity routes; this note is
   the hook for the subject-level erasure walk. */

/** Author-FK columns swept generically across the schema on account erasure
 *  (in addition to the explicit rows above). */
export const GENERIC_AUTHOR_COLUMNS = [
  'created_by',
  'updated_by',
  'created_by_id',
  'last_updated_by_id',
  'invited_by_user_id',
  'actor_user_id',
  'scanned_by_user_id',
];

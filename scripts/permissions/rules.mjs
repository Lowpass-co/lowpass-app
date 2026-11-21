/* ============================================
   LOWPASS — which rule every table gets (permissions step 3, Nov 2026)

   THE map from table → area → how the row reaches its tour. `gen293.mjs`
   turns it into database/migrations/293_tour_access_rules.sql; the PGlite
   test builds its tables from it; `rules.test.tsx` checks every area here is
   a real area. Change a table's rule HERE and regenerate — never hand-edit
   the SQL.

   Kinds:
     tour     row has tour_id                 → tours_i_can(area)
     day      row has routing_id (show day)   → days_i_can(area)
     line     row has line_item_id            → lines_i_can(area)
     pack     row has a rider pack id         → packs_i_can()  (Production)
     settle   row has settlement_id           → settlements_i_can()  (Income)
     via      row reaches its tour through a parent table (inline subquery)
     ref      shared workspace reference data → read: any member; write: admin/manager
     manager  admin / manager only (+ `self` read where noted)

   `read` = extra areas whose VIEW also lets you read (never write).
   `own`  = column holding a person id: a member always reads their own rows.
   `nullTourManager` = rows with no tour (artist-level) are admin/manager only.
   ============================================ */

export const RULES = [
  // ---- Schedule: the tour, its days ----
  { table: 'tours', kind: 'tours' },
  { table: 'routing', kind: 'routing', area: 'schedule' },

  // ---- Advance ----
  { table: 'advance_documents', kind: 'tour', area: 'advance', ws: true },
  { table: 'advance_form_configs', kind: 'tour', area: 'advance' },
  { table: 'advance_intake_links', kind: 'tour', area: 'advance', ws: true },
  { table: 'advance_packet_links', kind: 'tour', area: 'advance', ws: true },
  { table: 'advance_instances', kind: 'day', area: 'advance' },
  { table: 'labor_calls', kind: 'tour', area: 'advance', ws: true },
  { table: 'show_links', kind: 'tour', area: 'advance', ws: true },
  { table: 'tour_advance_day_templates', kind: 'tour', area: 'advance', ws: true },

  // ---- Production ----
  { table: 'rider_packs', kind: 'tour', area: 'production', ws: true, nullTourManager: true },
  { table: 'rider_folders', kind: 'tour', area: 'production', ws: true, nullTourManager: true },
  { table: 'rider_assets', kind: 'tour', area: 'production', ws: true, nullTourManager: true },
  { table: 'rider_pack_attachments', kind: 'tour', area: 'production', ws: true, nullTourManager: true },
  { table: 'tour_gear', kind: 'tour', area: 'production', ws: true },
  { table: 'channel_list_rows', kind: 'pack', col: 'pack_id' },
  { table: 'rider_pack_exports', kind: 'pack', col: 'pack_id' },
  { table: 'rider_pack_history', kind: 'pack', col: 'pack_id' },
  { table: 'rider_sections', kind: 'pack', col: 'pack_id' },
  { table: 'rider_web_links', kind: 'pack', col: 'pack_id' },
  { table: 'stage_boxes', kind: 'pack', col: 'pack_id' },
  { table: 'sub_snakes', kind: 'pack', col: 'pack_id' },
  { table: 'stage_plots', kind: 'pack', col: 'rider_pack_id' },
  {
    table: 'stage_plot_items', kind: 'via', col: 'stage_plot_id',
    parent: (lvl) => `SELECT sp.id FROM public.stage_plots sp WHERE sp.rider_pack_id IN (SELECT private.packs_i_can('${lvl}'))`,
  },

  // ---- Parking ----
  { table: 'parking_maps', kind: 'tour', area: 'parking', ws: true },
  { table: 'parking_share_links', kind: 'tour', area: 'parking', ws: true },

  // ---- Logistics ----
  { table: 'tour_personnel', kind: 'tour', area: 'logistics', ws: true, own: 'person_id' },
  { table: 'personnel_tour_assignments', kind: 'tour', area: 'logistics' },
  { table: 'flights', kind: 'tour', area: 'logistics', ws: true },
  { table: 'flight_bookings', kind: 'tour', area: 'logistics', ws: true },
  { table: 'hotels', kind: 'tour', area: 'logistics', ws: true },
  { table: 'hotel_bookings', kind: 'tour', area: 'logistics', ws: true },
  { table: 'rooming_grid', kind: 'tour', area: 'logistics', ws: true, own: 'person_id' },
  {
    table: 'rooms', kind: 'via', col: 'hotel_id',
    parent: (lvl) => `SELECT h.id FROM public.hotels h WHERE h.tour_id IN (SELECT private.tours_i_can('logistics', '${lvl}'))`,
  },
  {
    table: 'room_assignments', kind: 'via', col: 'room_id',
    parent: (lvl) => `SELECT r.id FROM public.rooms r JOIN public.hotels h ON h.id = r.hotel_id WHERE h.tour_id IN (SELECT private.tours_i_can('logistics', '${lvl}'))`,
  },

  // ---- Files ----
  { table: 'file_references', kind: 'files' },
  { table: 'file_share_links', kind: 'tour', area: 'files', ws: true },
  { table: 'file_share_events', kind: 'tour', area: 'files', ws: true },
  {
    table: 'file_entity_links', kind: 'via', col: 'file_id',
    // RLS on file_references applies inside: you can link/see a link only
    // to a file you can see; writing needs Files edit on that file's tour.
    parent: (lvl) => lvl === 'view'
      ? `SELECT f.id FROM public.file_references f`
      : `SELECT f.id FROM public.file_references f WHERE (f.linked_to_type = 'tour' AND f.linked_to_id IN (SELECT private.tours_i_can('files', 'edit'))) OR (f.linked_to_type = 'routing' AND f.linked_to_id IN (SELECT private.days_i_can('files', 'edit'))) OR private.is_manager()`,
  },

  // ---- Budget ----
  { table: 'budget_line_items', kind: 'tour', area: 'budget', ws: true, read: ['receipts'] },
  { table: 'budget_sections', kind: 'tour', area: 'budget', ws: true, read: ['receipts'] },
  { table: 'budget_settings', kind: 'tour', area: 'budget', ws: true, readAnyArea: true },
  { table: 'budget_fx_rates', kind: 'tour', area: 'budget', ws: true, readAnyArea: true },
  { table: 'budget_versions', kind: 'tour', area: 'budget', ws: true },
  { table: 'import_batches', kind: 'manager' },
  { table: 'budget_line_item_attachments', kind: 'line', area: 'budget' },
  { table: 'budget_line_item_notes', kind: 'line', area: 'budget' },
  { table: 'budget_line_item_transactions', kind: 'line', area: 'budget', also: ['receipts'] },
  { table: 'budget_version_lines', kind: 'line', area: 'budget' },
  { table: 'budget_version_income', kind: 'day', area: 'budget' },
  {
    table: 'budget_version_sections', kind: 'via', col: 'version_id',
    parent: (lvl) => `SELECT v.id FROM public.budget_versions v WHERE v.tour_id IN (SELECT private.tours_i_can('budget', '${lvl}'))`,
  },

  // ---- Receipts ----
  { table: 'expense_receipts', kind: 'tour', area: 'receipts', ws: true },
  { table: 'expenses', kind: 'tour', area: 'receipts', ws: true },

  // ---- Payroll ----
  { table: 'personnel_rates', kind: 'tour', area: 'payroll', ws: true, own: 'person_id' },
  { table: 'personnel_rate_lines', kind: 'tour', area: 'payroll', ws: true },
  { table: 'payroll_entries', kind: 'tour', area: 'payroll', ws: true, own: 'person_id' },

  // ---- Income ----
  { table: 'deal_memos', kind: 'tour', area: 'income', ws: true },
  { table: 'budget_commissions', kind: 'tour', area: 'income', ws: true },
  { table: 'budget_income', kind: 'day', area: 'income' },
  { table: 'settlement', kind: 'day', area: 'income' },
  { table: 'settlement_deductions', kind: 'settle' },
  { table: 'settlement_expenses', kind: 'settle' },
  { table: 'settlement_payments', kind: 'settle' },

  // ---- People: master records are admin/manager (+ yourself) ----
  { table: 'personnel', kind: 'manager', self: 'user_id' },
  { table: 'persons', kind: 'persons' },
  { table: 'contacts', kind: 'manager' },
  { table: 'personnel_intake_tokens', kind: 'manager' },
  { table: 'intake_pending_answers', kind: 'manager' },
  { table: 'intake_reminders', kind: 'manager' },
  { table: 'import_pending_lines', kind: 'manager' },

  // ---- Artists: members see the artists of tours they see ----
  { table: 'artists', kind: 'artists' },

  // ---- AI index holds deal memos + budget lines (audit B3) ----
  { table: 'rag_chunks', kind: 'manager' },

  // ---- Retired, unread (day sheets, old schedule templates): admin / manager ----
  { table: 'tour_roles', kind: 'manager' },
  { table: 'tour_role_links', kind: 'manager' },
  { table: 'advance_schedule_templates', kind: 'manager' },

  // ---- Shared reference data: read by any member (and everyone reads the
  //      built-in rows with no workspace), written by admin/manager ----
  ...[
    'advance_day_type_templates', 'advance_layout_templates', 'advance_templates',
    'budget_templates', 'budget_template_sections', 'budget_template_lines',
    'rider_section_templates', 'export_templates', 'labor_call_templates',
    'stage_plot_custom_items', 'gear', 'mic_library', 'rate_types', 'venues',
    'spaces', 'containers',
  ].map((table) => ({ table, kind: 'ref' })),
];

/* Tables with a tour_id (or reaching a tour) that this step deliberately
   leaves alone, and why. The post-check lists any OTHER table with a
   tour_id that still has only workspace rules. */
export const LEFT_ALONE = {
  rental_jobs: 'retired rental feature (rental_* tables); admin-only routes',
  ai_usage_events: 'per-user AI metering; read by the user and admins already',
  tour_access: 'the access table itself — its own rules are in 292',
};

export const AREAS = ['advance', 'production', 'parking', 'logistics', 'files', 'schedule', 'budget', 'receipts', 'payroll', 'income'];

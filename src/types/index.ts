/* ============================================
   LOWPASS — Core Type Definitions

   These types define the data model for the
   entire application. They mirror the PostgreSQL
   schema and are used across all components.
   ============================================ */

import type { PersonnelExtendedProfile } from '@/lib/personnel-extended-profile';

export type { PersonnelExtendedProfile };

// ---- Workspace & Auth ----

export interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  currency: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  workspace_id: string;
  role_id: string;
  created_at: string;
}

export interface Role {
  id: string;
  workspace_id: string;
  name: string;
  is_god: boolean;
  permissions: PermissionGrants;
}

/**
 * Permissions are stored as a flat object.
 * Keys are dot-separated: "advance.view", "advance.edit", "budget.view", etc.
 * Section-specific overrides use colon: "advance.edit:section_uuid"
 * Value is boolean (granted or not).
 */
export type PermissionGrants = Record<string, boolean>;

// Pre-defined permission keys for reference
export const PERMISSIONS = {
  // Advance
  ADVANCE_VIEW: 'advance.view',
  ADVANCE_EDIT: 'advance.edit',
  ADVANCE_ASSIGN: 'advance.assign',
  ADVANCE_EXPORT: 'advance.export',
  // Budget (Phase 2)
  BUDGET_VIEW: 'budget.view',
  BUDGET_EDIT: 'budget.edit',
  BUDGET_APPROVE: 'budget.approve',
  // Personnel
  PERSONNEL_VIEW: 'personnel.view',
  PERSONNEL_EDIT: 'personnel.edit',
  PERSONNEL_VIEW_COMMISSION: 'personnel.view_commission',
  // Venues
  VENUE_VIEW: 'venue.view',
  VENUE_EDIT: 'venue.edit',
  VENUE_VERIFY: 'venue.verify',
  // Tours
  TOUR_CREATE: 'tour.create',
  TOUR_EDIT: 'tour.edit',
  TOUR_DELETE: 'tour.delete',
  // Admin
  ADMIN_USERS: 'admin.users',
  ADMIN_ROLES: 'admin.roles',
  ADMIN_BUGS: 'admin.bugs',
} as const;


// ---- Artists & Tours ----

export interface Artist {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  spotify_id?: string;
  spotify_image_url?: string;
  spotify_banner_url?: string;
  branding: ArtistBranding;
  created_at: string;
}

export interface ArtistBranding {
  /** Logo URL for exports (not Spotify profile pic) */
  logo_url?: string;
  /** Custom banner image (overrides Spotify banner if set) */
  banner_url?: string;
  primary_color?: string;
  secondary_color?: string;
}

export type TourStatus = 'planning' | 'active' | 'completed' | 'archived';
export type Continent = 'GLOBAL' | 'US' | 'UK' | 'EU' | 'AUS' | 'ASIA' | 'OTHER';

export interface Tour {
  id: string;
  workspace_id: string;
  artist_id: string;
  name: string;
  start_date: string;
  end_date: string;
  continent: Continent;
  currency: string;
  principal_count: number;
  band_count: number;
  crew_count: number;
  status: TourStatus;
  notes?: string;
  created_at: string;
  // Joined data (optional, populated by queries)
  artist?: Artist;
}


// ---- Routing ----

export type DayType =
  | 'show'
  | 'off'
  | 'travel'
  | 'rehearsal'
  | 'press'
  | 'radio'
  | 'tv'
  | 'festival';

export interface RoutingDate {
  id: string;
  tour_id: string;
  date: string;
  day_type: DayType;
  city: string;
  venue_id?: string;
  venue_name?: string;
  notes?: string;
  sequence: number;
  created_at: string;
  // Joined
  venue?: Venue;
  advance_status?: AdvanceStatus;
}


// ---- Advance System ----

/** Field types available in the dynamic form builder */
export type AdvanceFieldType =
  | 'text'
  | 'number'
  | 'time'
  | 'date'
  | 'url'
  | 'file'
  | 'dropdown'
  | 'checkbox'
  | 'schedule_block'
  | 'textarea';

/** Configuration for a single form field */
export interface AdvanceFieldConfig {
  field_id: string;
  label: string;
  type: AdvanceFieldType;
  required: boolean;
  default_value?: unknown;
  placeholder?: string;
  options?: string[];   // For dropdowns
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
}

/** Configuration for a section within an advance form */
export interface AdvanceSectionConfig {
  id: string;
  section_type: string;
  name: string;
  icon?: string;
  custom: boolean;
  fields: AdvanceFieldConfig[];
  assigned_to: string[];   // User IDs who can edit
  view_only: string[];     // User IDs who can only view
  required: boolean;
}

/** The full form configuration for a tour/routing date */
export interface AdvanceFormConfig {
  id: string;
  tour_id: string;
  routing_id?: string;
  name: string;
  is_default: boolean;
  sections: AdvanceSectionConfig[];
  created_by_id: string;
  created_at: string;
  updated_at: string;
}

/** Status of an advance section or instance */
export type AdvanceStatus =
  | 'not_started'
  | 'in_progress'
  | 'complete'
  | 'needs_review';

/** Live advance data for a specific routing date */
export interface AdvanceInstance {
  id: string;
  routing_id: string;
  form_config_id: string;
  status: AdvanceStatus;
  data: Record<string, Record<string, unknown>>;  // section_id → field_id → value
  flags: AdvanceFlag[];
  last_updated_by_id?: string;
  last_updated_at: string;
  locked: boolean;
}

export interface AdvanceFlag {
  type: 'missing_required' | 'conflict' | 'stale' | 'manual';
  severity: 'critical' | 'high' | 'medium' | 'low';
  section_id: string;
  field_id?: string;
  message: string;
  created_at: string;
}

/** A comment on an advance section */
export interface AdvanceComment {
  id: string;
  advance_instance_id: string;
  section_id: string;
  author_id: string;
  content: string;
  mentions: string[];
  thread_id?: string;
  created_at: string;
  updated_at: string;
  // Joined
  author?: User;
}

/** A pre-built section template from the library */
export interface AdvanceTemplate {
  id: string;
  workspace_id?: string;
  template_type: string;
  name: string;
  description: string;
  icon: string;
  fields: AdvanceFieldConfig[];
  suggested_for_day_types: DayType[];
  created_at: string;
}


// ---- Personnel ----

export interface Personnel {
  id: string;
  workspace_id: string;
  lp_id: string;           // LP-00001 format
  name: string;
  email?: string;
  phone?: string;
  role: string;
  home_airport?: string;
  dietary_needs?: string;
  passport_info?: PassportInfo;
  /** Rich profile (address, emergency contact, visa, sizes, etc.) — migration 026. */
  extended_profile?: PersonnelExtendedProfile;
  standard_rates: PersonnelRates;
  commission_rates?: Record<string, number>;  // territory → percentage (hidden field)
  merch_size?: string;
  preferences?: string;
  created_at: string;
}

export interface PassportInfo {
  number?: string;
  expiry_date?: string;
  country?: string;
  full_name?: string;
}

export interface PersonnelRates {
  show_day_rate: number;
  off_day_rate: number;
  travel_day_rate: number;
  per_diem_rate: number;
  currency: string;
}

export interface PersonnelTourAssignment {
  id: string;
  tour_id: string;
  personnel_id: string;
  start_date: string;
  end_date: string;
  role_on_tour: string;
  rate_overrides?: Partial<PersonnelRates>;
  created_at: string;
  // Joined
  personnel?: Personnel;
}


// ---- Venues ----

export interface Venue {
  id: string;
  workspace_id: string;
  name: string;
  address: string;
  city: string;
  country?: string;
  capacity?: number;
  contacts: VenueContact[];
  technical_specs?: Record<string, unknown>;
  hospitality_info?: string;
  parking_info?: string;
  union_rules?: string;
  notes?: string;
  last_verified_at?: string;
  verified_by_id?: string;
  created_at: string;
  updated_at: string;
}

export interface VenueContact {
  name: string;
  position: string;
  email?: string;
  phone?: string;
}


// ---- Files ----

export type StorageProvider = 'google_drive' | 's3' | 'local';

export interface FileReference {
  id: string;
  workspace_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_provider: StorageProvider;
  provider_file_id: string;
  linked_to_type: string;
  linked_to_id: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}


// ---- Notifications ----

export type NotificationType =
  | 'mention'
  | 'comment'
  | 'status_change'
  | 'flag'
  | 'assignment'
  | 'system';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  created_at: string;
}


// ---- Bug Reports ----

export type BugReportStatus = 'new' | 'triaged' | 'in_progress' | 'resolved' | 'closed';

export interface BugReport {
  id: string;
  workspace_id: string;
  reported_by_id: string;
  title: string;
  description: string;
  steps_to_reproduce?: string;
  status: BugReportStatus;
  priority: 'low' | 'medium' | 'high' | 'critical';
  created_at: string;
  updated_at: string;
}

// ---- Budget System ----

export type BudgetCategory =
  | 'hotels' | 'flights'
  | 'transport_bus' | 'transport_taxis' | 'transport_fuel'
  | 'transport_parking' | 'transport_misc' | 'transport_agent'
  | 'prod_audio' | 'prod_lighting' | 'prod_freight'
  | 'prod_equipment' | 'prod_programming' | 'prod_set_wardrobe' | 'prod_misc';

export type PaymentMethod = 'card' | 'cash' | 'bank_transfer' | 'company_card';
export type SettlementStatus = 'pending' | 'day_of_complete' | 'reconciled';
export type PersonType = 'crew' | 'band' | 'principal';
export type RoomType = 'SGL' | 'DBL (A)' | 'DBL (B)' | 'DBL (C)' | 'DBL (D)' | '-' | 'N/A';
export type RateType = 'day_rate' | 'split_rate';
export type DayStatus = 'show' | 'off_travel' | 'rehearsal' | 'no_tour';
export type CommissionBasis = 'gross' | 'net' | 'gross_merch' | 'net_merch' | 'gross_minus_tax';

export interface BudgetSettings {
  id: string;
  tour_id: string;
  workspace_id: string;
  currency_home: string;
  currency_tour: string;
  exchange_rate: number | null;
  exchange_rate_updated_at: string | null;
  insurance_pct: number;
  contingency_pct: number;
  accountancy_pct: number;
  notes: string | null;
  /** Budget redesign (migration 200) — per-tour phase toggle. When
   *  false (default) the grid hides the Phase column + phase strip. */
  track_phases?: boolean;
  created_at: string;
  updated_at: string;
}

/* ============================================
   Budget redesign (migration 200) — sections + templates
   ============================================ */

/** Per-tour, user-defined section header. The new backbone of a
 *  budget — line items group under sections via section_id. */
export interface BudgetSection {
  id: string;
  tour_id: string;
  workspace_id: string;
  name: string;
  sort_order: number;
  created_at?: string;
  /** Phase 3 (migration 203) — 'custom' (plain, editable lines) or a locked
   *  formula kind: 'commission' | 'insurance' | 'contingency' | 'cogs'.
   *  Absent on rows read before the migration → treat as 'custom'. */
  kind?: string | null;
}

/** A reusable budget preset. System presets have workspace_id null +
 *  is_system true; workspace templates are scoped, with an optional
 *  artist_id override. */
export interface BudgetTemplate {
  id: string;
  workspace_id: string | null;
  artist_id: string | null;
  name: string;
  description: string | null;
  tier: string | null;
  is_system: boolean;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
  /** Optionally hydrated by the templates API for the editor. */
  sections?: BudgetTemplateSection[];
}

export interface BudgetTemplateSection {
  id: string;
  template_id: string;
  workspace_id: string | null;
  name: string;
  sort_order: number;
  /** Optionally hydrated alongside the section. */
  lines?: BudgetTemplateLine[];
}

export interface BudgetTemplateLine {
  id: string;
  template_id: string;
  template_section_id: string;
  workspace_id: string | null;
  label: string;
  default_phase_tag: string | null;
  sort_order: number;
}

export interface BudgetCommission {
  id: string;
  tour_id: string;
  workspace_id: string;
  label: string;
  percentage: number;
  basis: CommissionBasis;
  notes: string | null;
  order_index: number;
  created_at: string;
}

export interface BudgetIncome {
  id: string;
  routing_id: string;
  workspace_id: string;
  pre_tax_guarantee: number;
  withholding_pct: number;
  post_tax_guarantee: number;
  pre_tax_overage: number;
  post_tax_overage: number;
  merch_income: number;
  vip_income: number;
  drop_count: number | null;
  actual_guarantee: number | null;
  actual_overage: number | null;
  actual_merch: number | null;
  actual_vip: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  routing?: { date: string; venue_name: string; city: string; day_type: string };
}

export interface BudgetLineItem {
  id: string;
  tour_id: string;
  workspace_id: string;
  /** Legacy category key; persists alongside UX14 section. */
  category: BudgetCategory | string;
  label: string;
  quantity: number;
  proposed_cost: number;
  actual_cost: number;
  currency: string | null;
  /** FX unify · Stage 2 (migration 234) — the tour FX rate LOCKED when this line
   *  first actualized (1 <line currency> = rate <tour currency>). NULL = not yet
   *  actualized → the P&L converts the actual at the live tour rate. Projected
   *  always uses the live rate. */
  locked_fx_rate?: number | null;
  receipt_id: string | null;
  routing_id: string | null;
  notes: string | null;
  /** Budget Phase A §A3 — raw sum of
   *  budget_line_item_transactions for this line (0 if none).
   *  Distinct from `actual_cost`: after §A3's server-side
   *  auto-sync, actual_cost mirrors transaction_sum until the
   *  user types a manual override. Views compare the two via
   *  getActualState(line) to detect overrides + drive the
   *  warning marker / Sync button. Optional because pre-§A2
   *  fetch paths don't attach it. */
  transaction_sum?: number;
  /** Budget Phase A §A2 — count of transactions for the row.
   *  When ≥ 2 the Actual cell in the grid shows a "click
   *  slide-over to edit" indicator. */
  transaction_count?: number;
  /** Phase 3 grid (Step 5) — count of budget_line_item_attachments for the
   *  row, attached at fetch time so the grid's 📎 cell shows a real count
   *  without loading the attachment rows. Optional (not on every fetch path). */
  attachment_count?: number;
  /** Budget Phase B §B0 (migration 105) — explicit flag set
   *  when the user has typed an actual that should not
   *  auto-sync to the transactions sum. Cleared by the "Sync
   *  to transactions sum" button. Default false on all rows. */
  actual_cost_override?: boolean;
  flight_id?: string | null;
  hotel_id?: string | null;
  room_id?: string | null;
  gear_id?: string | null;
  tour_gear_id?: string | null;
  order_index: number;
  /** UX14 section bucket (migration 054) — legacy enum, kept for
   *  back-compat. Superseded in the UI by section_id below. */
  section?: string | null;
  /** Budget redesign (migration 200) — FK to budget_sections. The new
   *  grouping backbone; null = uncategorised. */
  section_id?: string | null;
  sort_order?: number;
  status?: string | null;
  /** Phase 3 §D / migration 064 — optional tour-phase tag for grouping
   *  in the budget UI. Null = unscoped. Mirrors the four phases from
   *  computeTourPhases() (pre_prod / rehearsals / show_days / wrap). */
  phase_tag?: 'pre_prod' | 'rehearsals' | 'show_days' | 'wrap' | null;
  tags?: string[];
  linked_item_ids?: string[];
  source_entity_type?: string | null;
  source_entity_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PersonnelRate {
  id: string;
  tour_id: string;
  workspace_id: string;
  /** Workspace roster row when added from Personnel; rooming/payroll use person_name. */
  roster_personnel_id?: string | null;
  person_name: string;
  role: string | null;
  person_type: PersonType;
  rate_type: RateType;
  show_rate: number;
  off_rate: number;
  rehearsal_rate: number;
  /** Rates SSOT (camelCase) — the individual amounts read from
   *  personnel_rate_lines, attached by the personnel-rates API (rateAmountsFor).
   *  Consumers should read these, not the legacy columns above (dropped by 231). */
  showRate?: number;
  offRate?: number;
  rehearsalRate?: number;
  perDiem?: number;
  advanceFee?: number;
  per_diem: number;
  advance_fee: number;
  commission: number;
  commission_note: string | null;
  base_rate_note: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface PayrollEntry {
  id: string;
  tour_id: string;
  workspace_id: string;
  personnel_id: string;
  person_id?: string | null;
  week_start: string;
  day_statuses: Record<string, DayStatus>;
  advance_fee: number;
  total_fee: number;
  total_per_diem: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  personnel?: PersonnelRate;
}

export interface RoomingGridEntry {
  id: string;
  tour_id: string;
  workspace_id: string;
  person_name: string;
  person_id?: string | null;
  role: string | null;
  routing_id: string;
  room_type: RoomType;
  created_at: string;
  // Joined
  routing?: { date: string; venue_name: string; city: string };
}

export interface HotelBooking {
  id: string;
  tour_id: string;
  workspace_id: string;
  hotel_name: string;
  address: string | null;
  phone: string | null;
  cancellation_policy: string | null;
  distance_to_venue: string | null;
  distance_to_airport: string | null;
  city: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  room_assignments?: HotelRoomAssignment[];
}

export interface HotelRoomAssignment {
  id: string;
  hotel_booking_id: string;
  workspace_id: string;
  person_name: string;
  check_in: string | null;
  check_out: string | null;
  nights: number;
  room_type: string | null;
  room_number: string | null;
  confirmation: string | null;
  rate_per_night: number;
  notes: string | null;
  created_at: string;
}

export interface FlightBooking {
  id: string;
  tour_id: string;
  workspace_id: string;
  person_name: string;
  role: string | null;
  origin_code: string | null;
  destination_code: string | null;
  proposed_cost: number;
  actual_cost: number;
  airline: string | null;
  flight_number: string | null;
  confirmation: string | null;
  departure_date: string | null;
  departure_time: string | null;
  leg_order: number;
  created_at: string;
  updated_at: string;
}

export interface ExpenseReceipt {
  id: string;
  tour_id: string;
  workspace_id: string;
  receipt_number: string;
  date: string | null;
  vendor: string | null;
  category: string | null;
  description: string | null;
  payment_method: PaymentMethod;
  cost_tour_currency: number;
  cost_home_currency: number;
  receipt_file_url: string | null;
  in_budget: boolean;
  linked_line_item_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Settlement {
  id: string;
  routing_id: string;
  workspace_id: string;
  status: SettlementStatus;
  day_of_guarantee: number | null;
  day_of_overage: number | null;
  day_of_merch: number | null;
  day_of_deductions: number | null;
  day_of_net: number | null;
  day_of_signed_by: string | null;
  day_of_notes: string | null;
  day_of_file_url: string | null;
  reconciled_guarantee: number | null;
  reconciled_overage: number | null;
  reconciled_merch: number | null;
  reconciled_deductions: number | null;
  reconciled_net: number | null;
  reconciled_notes: string | null;
  reconciled_at: string | null;
  deal_memo_text: string | null;
  deal_memo_file_url: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  routing?: { date: string; venue_name: string; city: string };
}

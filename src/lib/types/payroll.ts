/* ============================================
   LOWPASS — Payroll types (Payroll Sprint §P1)

   Mirrors the actual schema (migration 017 + 025 + 050 + 106),
   NOT the idealised shape sketched in the §P1 spec brief. Key
   differences from the spec sketch surfaced by recon:

   - personnel_rates keys legacy on (tour_id, person_name TEXT).
     A `roster_personnel_id` UUID FK to personnel(id) was added
     in migration 025 + backfilled in 050. Both fields surface
     here so writes can read either historically and join via
     the canonical id going forward.

   - payroll_entries already exists at the
     (personnel_id, week_start) grain with day_statuses JSONB
     + advance_fee. The §P1 spec proposed a new
     payroll_advances table — that is REDUNDANT and skipped
     in migration 106. Advances live on payroll_entries.

   - Day-type classification reuses the existing routing.day_type
     enum ('show' / 'off' / 'travel' / 'rehearsal' / 'press' /
     'radio' / 'tv' / 'festival') from migration 001. The
     current PayrollWeekSheet.tsx already collapses these to
     'show' | 'off_travel' | 'no_tour'. The expanded enum
     below keeps the festival exception explicit.

   - ACL Per Diem override is a per-routing-row numeric column
     (routing.acl_per_diem_amount, migration 106). Non-null =
     festival flat amount overriding both rate AND base
     per_diem for every assigned person on that date.
   ============================================ */

/** Row in public.personnel_rates. The historical (person_name)
 *  + canonical (roster_personnel_id) shape coexist. New code
 *  prefers roster_personnel_id; legacy data may have it
 *  NULL with only person_name populated. */
export interface PersonnelRatesRow {
  id: string;
  tour_id: string;
  workspace_id: string;
  /** Legacy free-text person name. Keep for backwards compat. */
  person_name: string;
  role: string | null;
  person_type: string;
  rate_type: string;
  show_rate: number;
  off_rate: number;
  rehearsal_rate: number;
  per_diem: number;
  advance_fee: number;
  commission: number;
  commission_note: string | null;
  base_rate_note: string | null;
  order_index: number;
  /** Canonical FK to public.personnel.id (migration 025).
   *  Backfilled in migration 050. May be NULL for legacy rows. */
  roster_personnel_id: string | null;
  /** §P1 — "Lowpass rate" (internal P&L). Admin-only visibility.
   *  Substitutes show_rate in combined all-staff PDFs (§P6)
   *  when present + non-zero. */
  internal_rate: number | null;
  created_at: string;
  updated_at: string;
}

/** Row in public.payroll_entries. day_statuses is a JSON map
 *  of date-string → day-type-string. Spec uses the expanded
 *  DayType union; existing rows may have legacy strings (see
 *  PayrollWeekSheet's dayTypeToStatus collapse). */
export interface PayrollEntryRow {
  id: string;
  tour_id: string;
  workspace_id: string;
  /** FK to personnel_rates(id) — the per-tour rates row. */
  personnel_id: string;
  /** FK to personnel(id) — backfilled in migration 050. */
  person_id: string | null;
  week_start: string;
  /** Map of ISO-date → day_type-string. */
  day_statuses: Record<string, string>;
  /** @deprecated RETIRED, migration 265 drops these columns. They were only
   *  ever written when somebody painted a day status, so on an unpainted tour
   *  they held nothing while the live-computing surfaces showed real figures.
   *  Nothing reads them any more. For payroll money use the DERIVED budget
   *  lines — `@/lib/budget/derivedPayrollTotals`. Do not add a reader. */
  advance_fee: number;
  total_fee: number;
  total_per_diem: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Day type expanded for payroll-side computation. Sourced
 *  from routing.day_type with the festival → acl_per_diem
 *  branch handled separately (driven by the new
 *  routing.acl_per_diem_amount column).
 *  Status strings stored in payroll_entries.day_statuses
 *  may legacy-collapse to 'show' | 'off_travel' | 'no_tour'
 *  per PayrollWeekSheet.tsx — keep both forms reachable. */
export type PayrollDayType =
  | 'show'
  | 'off_travel'   // off / travel / press / radio / tv / rehearsal
  | 'acl_per_diem' // festival date with routing.acl_per_diem_amount set
  | 'no_tour';

/** Per-day computed row consumed by the grid + PDF
 *  renderer. */
export interface PayrollDay {
  date: string;
  city: string | null;
  venue: string | null;
  day_type: PayrollDayType;
  /** Computed rate for this day. May be 0 (no_tour) or the
   *  full show_rate (show) or off_rate (off_travel) or 0
   *  (acl_per_diem; the per_diem field carries the flat
   *  amount instead). */
  rate: number;
  /** Computed per_diem for this day. 0 for no_tour. */
  per_diem: number;
  /** rate + per_diem. */
  day_total: number;
}

/** Per-person per-week roll-up consumed by the grid + PDFs. */
export interface PayrollWeek {
  week_start: string;
  /** Pre-formatted "W/C 23rd Mar — 29th Mar". */
  week_label: string;
  person_id: string;
  person_name: string;
  person_role: string | null;
  /** 7 entries Sun→Sat. */
  days: PayrollDay[];
  subtotal: number;
  advance: number;
  /** subtotal - advance. */
  total_due: number;
  currency: string;
}

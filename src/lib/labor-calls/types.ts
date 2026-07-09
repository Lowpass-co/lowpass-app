/* ============================================
   LOWPASS — Labor calls (P6). Types + shared constants.

   Per-day crew call schedule. First-class object (labor_calls table, migration
   239) — NOT payroll (local crew ≠ tour payroll; never touches rate_lines).
   Departments are free-text; the list below is only a suggestion set for the
   editor's combobox.
   ============================================ */

/** A persisted labor call (one department's call for one day). Mirrors the
 *  labor_calls table (migration 239). */
export interface LaborCall {
  id: string;
  workspace_id: string;
  tour_id: string | null;
  routing_id: string | null;
  department: string;
  /** 'HH:MM' 24h, or null. */
  call_time: string | null;
  headcount: number | null;
  company: string;
  contact_name: string;
  contact_phone: string;
  meal_break_notes: string;
  union_notes: string;
  notes: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** The editable subset of a call — the shape a template row, an intake row, and
 *  the block editor all speak. No ids / scope / timestamps. */
export interface LaborCallRow {
  department: string;
  call_time: string | null;
  headcount: number | null;
  company: string;
  contact_name: string;
  contact_phone: string;
  meal_break_notes: string;
  union_notes: string;
  notes: string;
}

/** A saved labor-call template (labor_call_templates, migration 239). Scoped to
 *  an artist (inherits to the artist's tours) OR a tour. */
export interface LaborCallTemplate {
  id: string;
  workspace_id: string;
  artist_id: string | null;
  tour_id: string | null;
  name: string;
  rows: LaborCallRow[];
  created_at: string;
  updated_at: string;
}

/** Free-text department suggestions (combobox only — the column has no enum). */
export const DEPARTMENT_SUGGESTIONS = [
  'Steel',
  'Audio',
  'Lights',
  'Video',
  'Backline',
  'Loaders',
  'Wardrobe',
  'Runner',
] as const;

/** An empty editable row (block "add row" / a fresh template row). */
export function emptyLaborRow(): LaborCallRow {
  return {
    department: '',
    call_time: null,
    headcount: null,
    company: '',
    contact_name: '',
    contact_phone: '',
    meal_break_notes: '',
    union_notes: '',
    notes: '',
  };
}

/** Project a persisted call down to its editable row (for duplicate / template
 *  capture). */
export function toRow(c: LaborCall | LaborCallRow): LaborCallRow {
  return {
    department: c.department ?? '',
    call_time: c.call_time ?? null,
    headcount: c.headcount ?? null,
    company: c.company ?? '',
    contact_name: c.contact_name ?? '',
    contact_phone: c.contact_phone ?? '',
    meal_break_notes: c.meal_break_notes ?? '',
    union_notes: c.union_notes ?? '',
    notes: c.notes ?? '',
  };
}

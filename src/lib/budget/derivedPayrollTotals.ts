/* ============================================
   LOWPASS — Payroll totals, read from the DERIVED budget lines

   THE ONE READ PATH for "what does payroll cost on this tour".

   Adam's ruling (2026-08-14): `payroll_entries.total_fee` /
   `.total_per_diem` are NOT a source of truth and are being dropped. Rows in
   `payroll_entries` are written only when somebody paints a day status, so on
   a tour nobody has painted the column is not merely wrong — it is ABSENT, and
   every reader of it renders zero while the live-computing surfaces show real
   figures. That is the Coachella mismatch.

   The canonical persisted total is the DERIVED BUDGET LINE that
   `reconcileDerivedBudgetLines` writes through `fees.ts`:

     source_entity_type = 'payroll'            → salary,   one line per person
     source_entity_type = 'payroll_per_diem'   → per diem, one line per person
     source_entity_id   = personnel_rates.id

   Those lines exist whether or not anyone painted anything (the reconcile
   fills unpainted days from routing via `effectiveStatuses`), and they respect
   budget-version locking for free: on an APPROVED version `proposed_cost` is
   the frozen baseline and `actual_cost` is live, which is exactly the
   proposed/actual split every summary surface wants.

   Pure module — no imports, no 'use client' — so the server routes and the
   client grids can share it and therefore cannot disagree.
   ============================================ */

/** `budget_line_items.source_entity_type` for the derived salary lines. */
export const PAYROLL_SALARY_SOURCE = 'payroll';
/** `budget_line_items.source_entity_type` for the derived per-diem lines. */
export const PAYROLL_PER_DIEM_SOURCE = 'payroll_per_diem';

/** The shape this module needs off a `budget_line_items` row. Deliberately
 *  loose: every caller selects `*` or a superset, and none of them should have
 *  to model the whole table to sum four numbers. */
export interface DerivedPayrollLineRow {
  source_entity_type?: string | null;
  source_entity_id?: string | null;
  proposed_cost?: number | string | null;
  actual_cost?: number | string | null;
}

export interface DerivedPayrollTotals {
  proposedSalaries: number;
  actualSalaries: number;
  proposedPerDiem: number;
  actualPerDiem: number;
}

export interface DerivedPayrollPersonTotals {
  proposedFee: number;
  actualFee: number;
  proposedPerDiem: number;
  actualPerDiem: number;
}

const num = (v: unknown): number => (v == null ? 0 : Number(v) || 0);

/** Tour-wide salary + per-diem, proposed and actual, from the derived lines. */
export function derivedPayrollTotals(
  lines: readonly DerivedPayrollLineRow[] | null | undefined,
): DerivedPayrollTotals {
  let proposedSalaries = 0;
  let actualSalaries = 0;
  let proposedPerDiem = 0;
  let actualPerDiem = 0;
  for (const l of lines ?? []) {
    if (l.source_entity_type === PAYROLL_SALARY_SOURCE) {
      proposedSalaries += num(l.proposed_cost);
      actualSalaries += num(l.actual_cost);
    } else if (l.source_entity_type === PAYROLL_PER_DIEM_SOURCE) {
      proposedPerDiem += num(l.proposed_cost);
      actualPerDiem += num(l.actual_cost);
    }
  }
  return { proposedSalaries, actualSalaries, proposedPerDiem, actualPerDiem };
}

/** Per-person totals keyed by `personnel_rates.id` — for surfaces that show a
 *  row per roster member (the salary tables) rather than a tour total. */
export function derivedPayrollByPerson(
  lines: readonly DerivedPayrollLineRow[] | null | undefined,
): Map<string, DerivedPayrollPersonTotals> {
  const byPerson = new Map<string, DerivedPayrollPersonTotals>();
  const slot = (id: string): DerivedPayrollPersonTotals => {
    const existing = byPerson.get(id);
    if (existing) return existing;
    const fresh = { proposedFee: 0, actualFee: 0, proposedPerDiem: 0, actualPerDiem: 0 };
    byPerson.set(id, fresh);
    return fresh;
  };
  for (const l of lines ?? []) {
    const id = l.source_entity_id;
    if (!id) continue;
    if (l.source_entity_type === PAYROLL_SALARY_SOURCE) {
      const s = slot(id);
      s.proposedFee += num(l.proposed_cost);
      s.actualFee += num(l.actual_cost);
    } else if (l.source_entity_type === PAYROLL_PER_DIEM_SOURCE) {
      const s = slot(id);
      s.proposedPerDiem += num(l.proposed_cost);
      s.actualPerDiem += num(l.actual_cost);
    }
  }
  return byPerson;
}

/** The categories the derived payroll lines carry (`crew` / `per_diems`).
 *  Exported so the direct-expense category filters can assert they do NOT
 *  overlap — a reader that summed both the derived lines AND their category
 *  would double-count every salary. */
export const PAYROLL_DERIVED_CATEGORIES = ['crew', 'per_diems'] as const;

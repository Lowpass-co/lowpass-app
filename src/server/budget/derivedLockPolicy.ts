/* ============================================
   LOWPASS — Derived-feed lock policy (pure; no imports → unit-testable)

   §3a: when the active budget version is APPROVED (locked), the rooming/payroll
   derived feeds flow to ACTUALS ONLY — the frozen proposed baseline is never
   touched. When DRAFT, they write proposed + actual + structure.
   ============================================ */

/** The fields a reconcile pass may write to an EXISTING derived line. */
export function derivedUpdatePayload(
  locked: boolean,
  d: { total: number; label: string },
  sectionId: string | null,
): Record<string, unknown> {
  return locked
    ? { actual_cost: d.total }
    : { label: d.label, proposed_cost: d.total, actual_cost: d.total, section_id: sectionId };
}

/** The proposed_cost for a NEW derived line: 0 when locked (actuals-only line,
 *  not in the approved snapshot → unbudgeted variance), else the real total. */
export function derivedInsertProposed(locked: boolean, total: number): number {
  return locked ? 0 : total;
}

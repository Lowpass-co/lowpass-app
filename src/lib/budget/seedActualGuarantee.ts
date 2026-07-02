/* ============================================
   LOWPASS — seed the settled Actual guarantee from the projected one (#4)

   Settlement usually opens at the deal number, so the ACTUAL guarantee cell
   should pre-fill from the PROJECTED (pre-tax) guarantee the first time —
   letting the user adjust rather than re-type. Rules, deliberately conservative
   so it never disturbs a real settled figure or the P&L:

     - Seed ONLY when the row has no actual guarantee yet (existing is null)
       AND this write isn't itself setting one (body did not send the field).
     - Seed ONLY when there's a real projected guarantee (> 0).
     - NEVER overwrite an actual the user (or a prior seed) already put there,
       including an explicit 0.

   Pure — the route calls this to decide the persisted actual_guarantee value.
   ============================================ */

export interface SeedActualGuaranteeArgs {
  /** The value already merged from body↔existing (what would persist today). */
  merged: number | null;
  /** Was actual_guarantee present on THIS request body? */
  bodyEntered: boolean;
  /** The row's stored actual_guarantee before this write (null = never set). */
  existing: number | null;
  /** The merged projected (pre-tax) guarantee for this row. */
  projected: number;
}

export function seedActualGuarantee({
  merged,
  bodyEntered,
  existing,
  projected,
}: SeedActualGuaranteeArgs): number | null {
  const firstTime = !bodyEntered && existing == null;
  if (firstTime && projected > 0) return projected;
  return merged;
}

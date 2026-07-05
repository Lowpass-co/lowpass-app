/* ============================================
   LOWPASS — Income actuals provenance (Stage 5)

   Pure decision for the settlement → budget_income actuals cascade. The
   settlement writes actuals ONLY onto rows whose provenance is NULL (never
   touched) or 'settlement' (previously settlement-written). A row a user
   typed by hand (actuals_source='manual') is SKIPPED, and the fields whose
   settlement value differs from the manual value are returned as a conflict
   list — the settlement UI turns that into a per-row explicit overwrite
   (which re-runs with overwriteManual=true).

   Kept side-effect-free so the settlement route stays thin and the behaviour
   is verifiable without a database (see actualsProvenance.harness.ts).
   ============================================ */

export const SETTLEMENT_ACTUAL_FIELDS = [
  'actual_guarantee',
  'actual_overage',
  'actual_merch',
  'actual_deductions',
  'actual_tickets_sold',
  'actual_gross',
] as const;

export type SettlementActualField = (typeof SETTLEMENT_ACTUAL_FIELDS)[number];

export interface ActualsConflictField {
  field: string;
  manual: number | null;
  settlement: number | null;
}

export interface ActualsCascadeDecision {
  /** True → do NOT write income actuals (manual row, not force-overwritten). */
  skip: boolean;
  /** Fields where settlement differs from the manual value (empty unless the
   *  row is 'manual'). Drives the UI's overwrite prompt. */
  conflicts: ActualsConflictField[];
  /** The actuals_source to stamp when writing; null = don't stamp (either the
   *  cascade is skipped, or the settlement carries no actuals to write). */
  writeSource: 'settlement' | null;
}

function toNum(v: number | null | undefined): number | null {
  return v == null ? null : Number(v);
}

export function resolveActualsCascade(input: {
  existingSource: string | null;
  existingActuals: Partial<Record<SettlementActualField, number | null>>;
  settlementActuals: Partial<Record<SettlementActualField, number | null>>;
  /** Whether the settlement carries any money actual to write. */
  hasActuals: boolean;
  overwriteManual: boolean;
}): ActualsCascadeDecision {
  const { existingSource, existingActuals, settlementActuals, hasActuals, overwriteManual } = input;

  const conflicts: ActualsConflictField[] = [];
  if (existingSource === 'manual') {
    for (const field of SETTLEMENT_ACTUAL_FIELDS) {
      const sv = toNum(settlementActuals[field]);
      if (sv == null) continue; // settlement carries nothing for this field
      const manualVal = toNum(existingActuals[field]);
      if (manualVal == null || sv !== manualVal) {
        conflicts.push({ field, manual: manualVal, settlement: sv });
      }
    }
  }

  const skip = existingSource === 'manual' && !overwriteManual && conflicts.length > 0;
  return {
    skip,
    conflicts,
    writeSource: !skip && hasActuals ? 'settlement' : null,
  };
}

/* ============================================
   LOWPASS — Payroll finalize lock (M1-C)

   `tours.payroll_finalized_at` (migration 243) is the per-tour payroll lock. When
   set, every payroll write path must reject SERVER-SIDE — not just hide the UI. The
   guard below is called by /api/budget/payroll (day statuses) and
   /api/budget/rate-lines (rate amounts). Unlock is admin-gated and clears the stamp.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

export const PAYROLL_FINALIZED_ERROR =
  'Payroll is finalized for this tour. Unlock to edit.';

/** The tour's finalize timestamp, or null when editable. */
export async function payrollFinalizedAt(
  supabase: SupabaseClient,
  tourId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('tours')
    .select('payroll_finalized_at')
    .eq('id', tourId)
    .maybeSingle();
  return (data?.payroll_finalized_at as string | null | undefined) ?? null;
}

/** True when the tour's payroll is locked — writers reject on true. */
export async function isPayrollFinalized(
  supabase: SupabaseClient,
  tourId: string,
): Promise<boolean> {
  return (await payrollFinalizedAt(supabase, tourId)) != null;
}

/* ============================================
   LOWPASS — Gear → derived budget line

   Kept as the call site the gear routes already use, but it no longer writes
   budget lines itself. It used to: update proposed AND actual to the hire
   total (erasing receipt-set actuals and ignoring an approved budget's lock),
   and DELETE the line when gear stopped being hired (cascading away any
   receipts on it). The one derived-line writer now does all of that by the
   shared rules — see src/server/budget/reconcileDerivedLines.ts.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { refreshDerivedLines } from '@/server/budget/reconcileDerivedLines';

export async function syncDerivedBudgetRowForTour(
  supabase: SupabaseClient,
  workspaceId: string,
  _gearId: string,
  tourId: string,
): Promise<void> {
  await refreshDerivedLines(supabase, tourId, workspaceId, 'gear');
}

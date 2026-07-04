/* ============================================================
   LOWPASS — getFxRate (FX unify · Stage 2)

   The one exchange-rate truth for server code. There is exactly ONE FX source:
   the tour's budget_fx_rates (admin-editable, refreshable via the exchange-rate
   route). The static GBP-pivot table (src/lib/budget/fx.ts) is gone.

   Two shapes:
     • Hot paths (P&L rollup, grids, exports) can't await per cell — they load
       the tour's FxRateMap ONCE (loadTourFxRates) and convert with the pure
       tourFxRate / convertToTour from '@/lib/budget/fxRates' (client-safe).
     • One-off server conversions use getFxRate() below, which loads the map and
       resolves a single pair.

   Precedence (see tourFxRate): explicit lockedRate (settled income / actualized
   expense) → the tour's budget_fx_rates entry → a FLAGGED 1:1 fallback
   (missing: true) so the UI shows a warning chip, never silent stale math.
   ============================================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  loadTourFxRates,
  tourFxRate,
  convertToTour,
  type FxRateMap,
  type TourFxRate,
} from '@/lib/budget/fxRates';

// Re-export the map loader + the pure resolvers so callers have one import home.
export { loadTourFxRates, tourFxRate, convertToTour };
export type { FxRateMap, TourFxRate };

/** Load the tour's FX map then resolve a single pair (server one-off). For hot
 *  paths, prefer loadTourFxRates once + tourFxRate/convertToTour per cell. */
export async function getFxRate(args: {
  supabase: SupabaseClient;
  tourId: string;
  workspaceId: string;
  from: string | null | undefined;
  tourCurrency: string;
  lockedRate?: number | null;
}): Promise<TourFxRate> {
  const map = await loadTourFxRates(args.supabase, args.tourId, args.workspaceId);
  return tourFxRate(args.from, args.tourCurrency, map, args.lockedRate);
}

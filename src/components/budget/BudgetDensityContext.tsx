'use client';

/* ============================================
   LOWPASS — Budget density (delegates to app-wide density)

   Grid system Phase 1 — the per-feature Budget density context is
   retired. Density is now ONE app-wide preference (see
   `@/lib/density/appDensity`), so the budget toggle and every other
   grid share a single source of truth + storage key.

   These exports are kept as thin aliases so existing budget imports
   (`useBudgetDensity`, `BudgetDensityProvider`, `BudgetDensity`) keep
   working unchanged. The provider is now a pass-through — the real
   provider is mounted once in (app)/layout.
   ============================================ */

import { useAppDensity, type Density } from '@/lib/density/appDensity';

export type BudgetDensity = Density;

/** Pass-through. The single <AppDensityProvider> lives in (app)/layout;
 *  this wrapper stays so existing mounts don't error, but it no longer
 *  creates a competing context. */
export function BudgetDensityProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export const useBudgetDensity = useAppDensity;

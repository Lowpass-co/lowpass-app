'use client';

/* ============================================
   LOWPASS — Personnel density (delegates to app-wide density)

   Grid system Phase 1 — retired the per-feature Personnel density
   context in favour of ONE app-wide preference
   (`@/lib/density/appDensity`). Exports kept as aliases so existing
   imports keep working; the provider is a pass-through (the real one
   is mounted once in (app)/layout).
   ============================================ */

import { useAppDensity, AppDensityToggle } from '@/lib/density/appDensity';

export function PersonnelDensityProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export const usePersonnelDensity = useAppDensity;
export const PersonnelDensityToggle = AppDensityToggle;

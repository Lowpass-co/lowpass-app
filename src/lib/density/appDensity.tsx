'use client';

/* ============================================
   LOWPASS — App-wide density (grid system, Phase 1)

   ONE source of truth for row density across every grid in the
   app. Replaces the three per-feature contexts (Budget / Equipment
   / Personnel) that each spun their own state + storage key and so
   never propagated to each other.

   A single <AppDensityProvider> is mounted once in the authenticated
   (app)/layout, so the `data-lp-density="…"` attribute (and the React
   context) is an ancestor of every page. Both shared primitives
   (SpreadsheetGrid, DataTable) read `useAppDensity()`, so flipping the
   toggle on ANY surface resizes EVERY grid live — rows + type scale.

   Three levels (default Comfortable):
     compact      — today's cosy size
     comfortable  — large / readable (DEFAULT)
     cozy         — bigger again (labelled "Spacious" in the toggle)

   Persisted in localStorage under the single key `lowpass:density`.
   The token set that drives cell sizing lives in globals.css
   (--lp-row-{mode}, --lp-row-cell-padding-y-{mode},
   --lp-cell-font-size-{mode}, --lp-cell-numeric-size-{mode}).
   ============================================ */

import { createDensity, type Density } from './createDensity';

const binding = createDensity({
  storageKey: 'lowpass:density',
  defaultDensity: 'comfortable',
});

export const AppDensityProvider = binding.Provider;
export const useAppDensity = binding.useDensity;
export const AppDensityToggle = binding.Toggle;

export type { Density };

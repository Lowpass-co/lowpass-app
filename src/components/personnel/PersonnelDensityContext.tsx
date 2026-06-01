'use client';

/* ============================================
   LOWPASS — Personnel density (Phase B §B5)

   Per-device density preference for the Personnel grid.
   Distinct localStorage key from Budget + Equipment so each
   surface keeps its own choice.
   ============================================ */

import { createDensity } from '@/lib/density/createDensity';

const binding = createDensity({
  storageKey: 'lowpass:personnel:density',
  defaultDensity: 'comfortable',
});

export const PersonnelDensityProvider = binding.Provider;
export const usePersonnelDensity = binding.useDensity;
export const PersonnelDensityToggle = binding.Toggle;

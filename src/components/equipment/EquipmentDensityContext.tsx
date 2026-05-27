'use client';

/* ============================================
   LOWPASS — Equipment density (Phase B §B5)

   Per-device density preference for the Equipment grid
   (InventoryTab + JobsTab). Distinct localStorage key from
   Budget so each surface keeps its own choice.
   ============================================ */

import { createDensity } from '@/lib/density/createDensity';

const binding = createDensity({
  storageKey: 'lowpass:equipment:density',
  defaultDensity: 'comfortable',
});

export const EquipmentDensityProvider = binding.Provider;
export const useEquipmentDensity = binding.useDensity;
export const EquipmentDensityToggle = binding.Toggle;

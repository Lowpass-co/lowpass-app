/**
 * UX21 — TS shape for rental_inventory rows surfaced through the bridge.
 * Fields mirror src/components/equipment/types.ts → RentalInventoryItem
 * (which is the authoritative type for the rental module itself); this
 * one-page mirror exists so canonical-entity code can import it without
 * pulling in the full equipment-module surface.
 */
export type RentalInventory = {
  id: string;
  userId: string;
  name: string;
  category: string | null;
  serialNumber: string | null;
  countryOfOrigin: string | null;
  purchaseCost: number | null;
  dayRate: number | null;
  dayRateManual: boolean | null;
  weightKg: number | null;
  imageUrl: string | null;
  notes: string | null;
  createdAt: string;
};

export type GearOwnership = 'owned' | 'sub_hired' | 'hired_to_client';

export type Gear = {
  id: string;
  workspaceId: string;
  name: string;
  category: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  ownership: GearOwnership;
  ownerLabel: string | null;
  hireCostAmount: number | null;
  hireCostCurrency: string | null;
  hireCostPeriod: string | null;
  notes: string | null;
  imageUrl: string | null;
  /** UX21 — bridge to rental_inventory when this gear is owned via the rental house. */
  rentalInventoryId: string | null;
  /** What it cost — its day rate is 3% of this unless one is typed. */
  purchaseCost?: number | null;
  dayRate?: number | null;
  dayRateManual?: boolean;
  /** How many you own (306) — 1 for a serialised item. */
  quantity?: number;
  status?: 'available' | 'in_use' | 'maintenance' | 'retired';
  weightKg?: number | null;
  /** Retail / replacement value (the lookup fills it). */
  valueAmount?: number | null;
  valueCurrency?: string | null;
  dimensionsCm?: { l?: number; w?: number; h?: number } | null;
  spaceId?: string | null;
  containerId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TourGear = {
  id: string;
  workspaceId: string;
  tourId: string;
  gearId: string;
  tourOwnership: GearOwnership | null;
  tourHireCostAmount: number | null;
  tourHireCostCurrency: string | null;
  tourHireCostPeriod: string | null;
  startsOn: string | null;
  endsOn: string | null;
  quantity: number;
  notes: string | null;
  createdAt: string;
};

import type { Gear, TourGear } from '@/lib/types/gear';
import type { RentalInventory } from '@/lib/types/rental';

type GearRow = {
  id: string;
  workspace_id: string;
  name: string;
  category: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  ownership: 'owned' | 'sub_hired' | 'hired_to_client';
  owner_label: string | null;
  hire_cost_amount: number | null;
  hire_cost_currency: string | null;
  hire_cost_period: string | null;
  notes: string | null;
  image_url: string | null;
  /** UX21 bridge — null when this gear isn't from the rental house. */
  rental_inventory_id?: string | null;
  created_at: string;
  updated_at: string;
  tour_gear?: TourGearRow[];
};

type TourGearRow = {
  id: string;
  workspace_id: string;
  tour_id: string;
  gear_id: string;
  tour_ownership: 'owned' | 'sub_hired' | 'hired_to_client' | null;
  tour_hire_cost_amount: number | null;
  tour_hire_cost_currency: string | null;
  tour_hire_cost_period: string | null;
  starts_on: string | null;
  ends_on: string | null;
  quantity: number | null;
  notes: string | null;
  created_at: string;
};

function mapTourGear(row: TourGearRow): TourGear {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    tourId: row.tour_id,
    gearId: row.gear_id,
    tourOwnership: row.tour_ownership,
    tourHireCostAmount: row.tour_hire_cost_amount == null ? null : Number(row.tour_hire_cost_amount),
    tourHireCostCurrency: row.tour_hire_cost_currency,
    tourHireCostPeriod: row.tour_hire_cost_period,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    quantity: Number(row.quantity ?? 1),
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function mapGear(row: GearRow): Gear & { tourGear?: TourGear[] } {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    category: row.category,
    manufacturer: row.manufacturer,
    model: row.model,
    serialNumber: row.serial_number,
    ownership: row.ownership,
    ownerLabel: row.owner_label,
    hireCostAmount: row.hire_cost_amount == null ? null : Number(row.hire_cost_amount),
    hireCostCurrency: row.hire_cost_currency,
    hireCostPeriod: row.hire_cost_period,
    notes: row.notes,
    imageUrl: row.image_url,
    rentalInventoryId: row.rental_inventory_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tourGear: (row.tour_gear ?? []).map(mapTourGear),
  };
}

export async function searchGear(
  query: string,
  opts?: {
    tourId?: string;
    limit?: number;
    ownership?: string;
    category?: string;
    /** UX21 — when true, /api/gear may also surface rental_inventory rows
     *  not yet linked to a Gear, returned in `rentalInventory[]`. */
    includeRentalInventory?: boolean;
  },
): Promise<(Gear & { tourGear?: TourGear[] })[]> {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (opts?.tourId) params.set('tour_id', opts.tourId);
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.ownership) params.set('ownership', opts.ownership);
  if (opts?.category) params.set('category', opts.category);
  if (opts?.includeRentalInventory) params.set('include_rental_inventory', '1');
  const res = await fetch(`/api/gear?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to search gear');
  const json = (await res.json()) as { gear?: GearRow[] };
  return (json.gear ?? []).map(mapGear);
}

/**
 * UX21 — companion to searchGear. Returns rental_inventory rows in the
 * caller's workspace that are NOT yet linked to a canonical Gear record,
 * for display under "From your rental inventory" in the gear picker.
 */
export async function searchUnlinkedRentalInventory(
  query: string,
  opts?: { limit?: number },
): Promise<RentalInventory[]> {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (opts?.limit) params.set('limit', String(opts.limit));
  const res = await fetch(`/api/gear/rental-inventory?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load rental inventory');
  const json = (await res.json()) as { items?: RentalInventoryRow[] };
  return (json.items ?? []).map(mapRentalInventory);
}

type RentalInventoryRow = {
  id: string;
  user_id: string;
  name: string;
  category: string | null;
  serial_number: string | null;
  country_of_origin: string | null;
  purchase_cost: number | null;
  day_rate: number | null;
  day_rate_manual: boolean | null;
  weight_kg: number | null;
  image_url: string | null;
  notes: string | null;
  created_at: string;
};

function mapRentalInventory(row: RentalInventoryRow): RentalInventory {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    category: row.category,
    serialNumber: row.serial_number,
    countryOfOrigin: row.country_of_origin,
    purchaseCost: row.purchase_cost == null ? null : Number(row.purchase_cost),
    dayRate: row.day_rate == null ? null : Number(row.day_rate),
    dayRateManual: row.day_rate_manual,
    weightKg: row.weight_kg == null ? null : Number(row.weight_kg),
    imageUrl: row.image_url,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

/** UX21 — link an existing Gear to an underlying rental_inventory row (or unlink with null). */
export async function linkGearToRentalInventory(
  gearId: string,
  rentalInventoryId: string | null,
): Promise<Gear & { tourGear?: TourGear[] }> {
  const res = await fetch(`/api/gear/${gearId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rental_inventory_id: rentalInventoryId }),
  });
  if (!res.ok) throw new Error('Failed to link rental inventory');
  const row = (await res.json()) as GearRow;
  return mapGear(row);
}

/**
 * UX21 — promote a rental_inventory row to a canonical Gear in one call.
 * Optionally links it to a tour (creates a tour_gear row) so the picker
 * flow ("Add to tour" or in-grid promotion) can complete in one round-trip.
 * Default ownership when promoting from the rental house is `owned`.
 */
export async function createGearFromRentalInventory(
  rentalInventoryId: string,
  opts?: { tourId?: string; ownership?: 'owned' | 'sub_hired' | 'hired_to_client' },
): Promise<Gear & { tourGear?: TourGear[] }> {
  const res = await fetch(`/api/gear/from-rental`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rental_inventory_id: rentalInventoryId,
      tour_id: opts?.tourId ?? null,
      ownership: opts?.ownership ?? 'owned',
    }),
  });
  if (!res.ok) throw new Error('Failed to create gear from rental inventory');
  const row = (await res.json()) as GearRow;
  return mapGear(row);
}

export async function getGearById(id: string): Promise<(Gear & { tourGear?: TourGear[] }) | null> {
  const res = await fetch(`/api/gear/${id}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to load gear');
  const row = (await res.json()) as GearRow;
  return mapGear(row);
}

export async function updateGear(id: string, payload: Record<string, unknown>) {
  const res = await fetch(`/api/gear/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to update gear');
  const row = (await res.json()) as GearRow;
  return mapGear(row);
}

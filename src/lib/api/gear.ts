import type { Gear, TourGear } from '@/lib/types/gear';

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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tourGear: (row.tour_gear ?? []).map(mapTourGear),
  };
}

export async function searchGear(
  query: string,
  opts?: { tourId?: string; limit?: number; ownership?: string; category?: string }
): Promise<(Gear & { tourGear?: TourGear[] })[]> {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (opts?.tourId) params.set('tour_id', opts.tourId);
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.ownership) params.set('ownership', opts.ownership);
  if (opts?.category) params.set('category', opts.category);
  const res = await fetch(`/api/gear?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to search gear');
  const json = (await res.json()) as { gear?: GearRow[] };
  return (json.gear ?? []).map(mapGear);
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

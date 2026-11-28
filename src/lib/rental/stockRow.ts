/* A `gear` row → the job builder's stock shape (RentalInventoryItem, id =
   gear.id). Pure — the server's loadRentalStock and the job page (an item
   just added to stock from a job) both use it. */
import type { RentalInventoryItem } from '@/components/equipment/types';

type GearRow = Record<string, unknown>;

export function gearToStock(g: GearRow): RentalInventoryItem {
  const n = (v: unknown) => (v == null ? null : Number(v));
  return {
    id: g.id as string,
    user_id: '',
    workspace_id: (g.workspace_id as string) ?? null,
    name: (g.name as string) ?? 'Item',
    category: (g.category as string) ?? null,
    serial_number: (g.serial_number as string) ?? null,
    country_of_origin: (g.country_of_origin as string) ?? null,
    purchase_cost: n(g.purchase_cost),
    day_rate: n(g.day_rate),
    day_rate_manual: (g.day_rate_manual as boolean) ?? false,
    weight_kg: n(g.weight_kg),
    image_url: (g.image_url as string) ?? null,
    notes: (g.notes as string) ?? null,
    status: (g.status as RentalInventoryItem['status']) ?? 'available',
    last_used_at: (g.last_used_at as string) ?? null,
    customs_hs_code: (g.customs_hs_code as string) ?? null,
    value_amount: n(g.value_amount),
    value_currency: (g.value_currency as string) ?? null,
    dimensions_cm: (g.dimensions_cm as RentalInventoryItem['dimensions_cm']) ?? null,
    qr_token: (g.qr_token as string) ?? null,
    quantity: Math.max(1, Number(g.quantity) || 1),
    created_at: (g.created_at as string) ?? '',
  };
}


/* ============================================
   LOWPASS — the job builder's stock (Nov 2026)

   ONE list: `gear` (the Gear & rentals page writes it). The job builder used
   to read rental_inventory, which nothing has written since stock moved to
   Assets — so new items could never go on a job. This reads `gear` into the
   shape the job builder already uses (RentalInventoryItem), id = gear.id.
   Retired items are left out of the picker; lines already pointing at one
   still name it (the job builder looks names up from this list, so retired
   items are fetched too and flagged).
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RentalInventoryItem } from '@/components/equipment/types';

const COLS =
  'id, workspace_id, name, category, serial_number, country_of_origin, purchase_cost, day_rate, day_rate_manual, weight_kg, image_url, notes, status, last_used_at, customs_hs_code, value_amount, value_currency, dimensions_cm, qr_token, quantity, created_at';

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

/** The workspace's stock for the job builder, by name. Before 306 is pasted
 *  `gear.quantity` doesn't exist — read without it (everything counts 1). */
export async function loadRentalStock(client: SupabaseClient, workspaceId: string): Promise<RentalInventoryItem[]> {
  const read = (cols: string) => client.from('gear').select(cols).eq('workspace_id', workspaceId).order('name');
  let res: { data: unknown; error: { message: string } | null } = await read(COLS);
  if (res.error && /quantity/.test(res.error.message)) res = await read(COLS.replace(', quantity', ''));
  if (res.error) throw new Error(res.error.message);
  return ((res.data ?? []) as GearRow[]).map(gearToStock);
}

/** The workspace's default week (306), 3 until it's set. */
export async function loadDaysPerWeek(client: SupabaseClient, workspaceId: string): Promise<number | null> {
  const { data, error } = await client.from('workspaces').select('rental_days_per_week').eq('id', workspaceId).maybeSingle();
  if (error || !data) return null;
  return Number((data as { rental_days_per_week: unknown }).rental_days_per_week) || null;
}

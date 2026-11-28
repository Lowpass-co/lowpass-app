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
import { cleanValidDays, DEFAULT_QUOTE_VALID_DAYS } from '@/lib/rental/quote';

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
  return (await loadRentalSettings(client, workspaceId)).daysPerWeek;
}

export interface RentalSettings {
  /** null before 306 → the app uses 3. */
  daysPerWeek: number | null;
  /** 14 before 307. */
  quoteValidDays: number;
  /** Free text printed on the PDF when asked (307); null = none. */
  paymentDetails: string | null;
}

/** The workspace's rental settings (306 + 307). Reads what exists: before 307
 *  only the week, before 306 nothing — never an error page for a missing
 *  column. */
export async function loadRentalSettings(client: SupabaseClient, workspaceId: string): Promise<RentalSettings> {
  const out: RentalSettings = { daysPerWeek: null, quoteValidDays: DEFAULT_QUOTE_VALID_DAYS, paymentDetails: null };
  const read = (cols: string) => client.from('workspaces').select(cols).eq('id', workspaceId).maybeSingle();
  let res: { data: unknown; error: { message: string } | null } = await read('rental_days_per_week, rental_quote_valid_days, rental_payment_details');
  if (res.error && /rental_quote_valid_days|rental_payment_details/.test(res.error.message)) res = await read('rental_days_per_week');
  if (res.error || !res.data) return out;
  const row = res.data as Record<string, unknown>;
  out.daysPerWeek = Number(row.rental_days_per_week) || null;
  if (row.rental_quote_valid_days != null) out.quoteValidDays = cleanValidDays(row.rental_quote_valid_days);
  const pd = typeof row.rental_payment_details === 'string' ? row.rental_payment_details.trim() : '';
  out.paymentDetails = pd || null;
  return out;
}

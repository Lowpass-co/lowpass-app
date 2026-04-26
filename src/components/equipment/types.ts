import { calcRentalBillableDays } from '@/lib/rental-pricing';

export interface RentalInventoryItem {
  id: string;
  user_id: string;
  name: string;
  category: string | null;
  serial_number: string | null;
  country_of_origin: string | null;
  purchase_cost: number | null;
  day_rate: number | null;
  /** When false, day_rate is derived as 1% of purchase_cost whenever purchase is set. */
  day_rate_manual?: boolean | null;
  weight_kg: number | null;
  image_url: string | null;
  notes: string | null;
  created_at: string;
}

export interface RentalJob {
  id: string;
  user_id: string;
  name: string;
  client_name: string | null;
  /** Workspace artist (from `artists` table). */
  artist_id: string | null;
  /** Workspace tour (from `tours` table). */
  tour_id: string | null;
  start_date: string | null;
  end_date: string | null;
  discount_percent: number | null;
  discount_fixed: number | null;
  notes: string | null;
  status: 'draft' | 'confirmed' | 'invoiced' | 'completed';
  created_at: string;
  /** Optional billing details — appear on the exported quote/invoice PDF. */
  billing_address?: string | null;
  billing_email?: string | null;
  billing_phone?: string | null;
  billing_tax_id?: string | null;
  /** Populated when listing with Supabase embed `artist:artists(...)` */
  artist?: { id: string; name: string } | null;
  /** Populated when listing with Supabase embed `tour:tours(...)` */
  tour?: { id: string; name: string } | null;
}

/** Slim rows for job modal / filters (from workspace). */
export interface EquipmentArtistOption {
  id: string;
  name: string;
}

export interface EquipmentTourOption {
  id: string;
  name: string;
  artist_id: string;
}

export interface RentalJobItem {
  id: string;
  job_id: string;
  inventory_id: string;
  quantity: number;
  day_rate_override: number | null;
  created_at: string;
}

/** Shared min height for Equipment inventory / jobs table shells (empty + data). */
export const EQUIPMENT_TABLE_MIN_CLASS = 'min-h-[26rem]';

/** One fixed content column (max-w-6xl); header, tabs, toolbars, and tables share this width. */
export const EQUIPMENT_PAGE_SHELL_CLASS =
  'mx-auto w-full max-w-6xl min-w-0 flex flex-col gap-6';

/**
 * Toolbar grid: search (flex) | dropdown 160px | count | primary CTA.
 * Same template on Inventory and Jobs so controls do not shift between tabs or empty/data states.
 */
export const EQUIPMENT_TOOLBAR_GRID_CLASS =
  'grid w-full min-w-0 grid-cols-[minmax(0,1fr)_10rem_minmax(5.5rem,auto)_10rem] items-center gap-3';

export const CATEGORIES = [
  'Audio', 'Lighting', 'Video / LED', 'Backline',
  'Rigging', 'Power', 'Cases', 'Cables', 'Staging', 'Other',
] as const;

export const STATUS_OPTIONS = ['draft', 'confirmed', 'invoiced', 'completed'] as const;

export const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  draft:     { bg: 'rgba(107,114,128,0.12)', text: '#6B7280' },
  confirmed: { bg: 'rgba(16,185,129,0.12)',  text: '#10B981' },
  invoiced:  { bg: 'rgba(59,130,246,0.12)',  text: '#3B82F6' },
  completed: { bg: 'rgba(139,92,246,0.12)',  text: '#8B5CF6' },
};

/** @see calcRentalBillableDays — 3-day-week billable count for job pricing */
export function calcDays(start: string | null, end: string | null): number {
  return calcRentalBillableDays(start, end);
}

export function fmtUSD(n: number | null | undefined): string {
  if (n == null) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

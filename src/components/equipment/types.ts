import { calcRentalBillableDays } from '@/lib/rental-pricing';

export interface RentalInventoryItem {
  id: string;
  /** Legacy user-scope ownership column. Migration 095 added
   *  workspace_id as the canonical scoping field; user_id is
   *  kept for FK / historical fidelity but no longer drives
   *  RLS or app-side filtering. */
  user_id: string;
  /** Sprint 12 §1 — canonical workspace scoping. Added in
   *  migration 095 with the denormalisation backfill. */
  workspace_id?: string | null;
  name: string;
  category: string | null;
  serial_number: string | null;
  country_of_origin: string | null;
  purchase_cost: number | null;
  day_rate: number | null;
  /** When false, day_rate is derived from purchase_cost at DAY_RATE_PCT_OF_VALUE (see lib/rental-pricing.ts). */
  day_rate_manual?: boolean | null;
  weight_kg: number | null;
  image_url: string | null;
  notes: string | null;
  /** Sprint 11 §5 — lifecycle state. CHECK-constrained to one
   *  of available / in_use / maintenance / retired. Defaults to
   *  'available' on insert. */
  status?: InventoryStatus | null;
  /** Sprint 11 §5 — stamped each time the item lands on a
   *  confirmed / invoiced / completed rental_jobs row. Drives
   *  the "Last used" relative time on each grid row. NULL when
   *  the item has never been on a confirmed job. */
  last_used_at?: string | null;
  /** Sprint 12 §1 / §2 — Carnet + scanning fields (migration
   *  093). qr_token is the stable 8-char short ID encoded in
   *  the printed QR label. */
  customs_hs_code?: string | null;
  value_amount?: number | null;
  value_currency?: string | null;
  dimensions_cm?: { l?: number; w?: number; h?: number } | null;
  qr_token?: string | null;
  created_at: string;
}

/** Sprint 11 §5 — rental_inventory.status enum (CHECK-constrained
 *  in migration 091). */
export type InventoryStatus = 'available' | 'in_use' | 'maintenance' | 'retired';

export const INVENTORY_STATUS_OPTIONS: ReadonlyArray<{ value: InventoryStatus; label: string }> = [
  { value: 'available',   label: 'Available' },
  { value: 'in_use',      label: 'In use' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'retired',     label: 'Retired' },
];

/** Pill colour-tones per status. Mirrors STATUS_STYLES (jobs)
 *  for visual continuity across the equipment surfaces. */
export const INVENTORY_STATUS_STYLES: Record<InventoryStatus, { bg: string; text: string; border: string }> = {
  available:   { bg: 'rgba(31,138,76,0.10)',  text: '#1f8a4c', border: 'rgba(31,138,76,0.35)' },
  in_use:      { bg: '#FF45001a',             text: '#b85a00', border: '#FF450055' },
  maintenance: { bg: 'rgba(201,122,29,0.12)', text: '#c97a1d', border: 'rgba(201,122,29,0.40)' },
  retired:     { bg: 'rgba(107,114,128,0.12)', text: '#6B7280', border: 'rgba(107,114,128,0.40)' },
};

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
  /** Item 2 — the quote is denominated ONCE, here. NULL = USD (migration 253). */
  display_currency?: string | null;
  /** Frozen 1 <item currency> = fx_rate <display_currency>. NULL while draft. */
  fx_rate?: number | null;
  /** When fx_rate was captured — printed on the quote for auditability. */
  fx_rate_at?: string | null;
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

/**
 * Money, in the currency you name. Replaces fmtUSD, which hardcoded '$'.
 *
 * There is deliberately NO default currency. fmtUSD had one implicitly and that
 * is exactly how a euro quote gets printed with a dollar sign: every call site
 * that forgot to think about currency still rendered, and rendered wrong. A
 * required argument turns that into a compile error instead of a document a
 * client receives.
 *
 * Falls back to a plain code prefix for currencies Intl doesn't symbolise,
 * which is right — "SEK 1,200.00" is unambiguous, an invented glyph is not.
 */
export function fmtMoney(n: number | null | undefined, currency: string): string {
  if (n == null) return '—';
  const code = (currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(n));
  } catch {
    return `${code} ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

/** The quote's currency. NULL display_currency = USD, the pre-switcher default. */
export function jobCurrency(job: { display_currency?: string | null }): string {
  return (job.display_currency || 'USD').toUpperCase();
}

/** Currencies offered by the quote switcher. */
export const QUOTE_CURRENCIES = ['USD', 'GBP', 'EUR', 'CAD', 'AUD', 'JPY', 'SEK', 'CHF'] as const;

export function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ============================================
   R2-6 — THE SYMBOL AND THE NUMBER MUST AGREE

   Switching a quote to GBP re-rendered $17,189.10 as £17,189.10. Identical
   figure, new symbol. A UK client would have been quoted £270/day for a
   $270/day item.

   The conversion code was right; it just never ran. `conv()` is the identity
   function when the FX rate is null, while `cur` changed regardless — so the
   two halves of a price were sourced independently and could disagree. Three
   ways to reach a null rate, all of which shipped:

     · both FX vendors failing (they were — see the exchange-rate route),
     · a NON-DRAFT job that never froze a rate, which skips the fetch entirely,
     · the fetch simply not having resolved yet on first paint.

   Rather than patch each, derive the symbol from the same fact that decides
   the number. If there is no rate, the figures ARE dollars, so they are
   labelled dollars and the UI says why. A mixed pair is now unrepresentable.
   ============================================ */

export type QuoteDisplay = {
  /** Currency the FIGURES are actually in — never a symbol we cannot back. */
  dispCur: string;
  /** False when the quote wanted a foreign currency and we had no rate. */
  converted: boolean;
};

export function resolveQuoteDisplay(cur: string, fxRate: number | null): QuoteDisplay {
  if (cur === 'USD') return { dispCur: 'USD', converted: true };
  if (fxRate == null) return { dispCur: 'USD', converted: false };
  return { dispCur: cur, converted: true };
}

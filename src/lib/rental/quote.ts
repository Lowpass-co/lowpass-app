/* ============================================
   LOWPASS — a rental quote, priced once (Nov 2026)

   The job page, the jobs list and the PDF each summed the lines themselves
   (three copies of "qty × days × rate"). This is the one place now: lines are
   priced in USD (the stock's unit), grouped by category in a fixed order, and
   the discount taken off the subtotal. Callers convert for display.
   ============================================ */

import { effectiveInventoryDayRate } from '@/lib/rental-pricing';

export interface QuoteStockItem {
  id: string;
  name: string;
  category: string | null;
  image_url?: string | null;
  purchase_cost: number | null;
  day_rate: number | null;
  day_rate_manual?: boolean | null;
}

export interface QuoteLineInput {
  id: string;
  gear_id: string | null;
  quantity: number;
  day_rate_override: number | null;
}

export interface PricedLine {
  id: string;
  gearId: string | null;
  name: string;
  category: string;
  imageUrl: string | null;
  quantity: number;
  /** USD per day — the override when there is one. */
  rate: number;
  /** True when the line's rate is not the item's own. */
  custom: boolean;
  /** USD for the whole hire. */
  total: number;
}

export interface QuoteGroup {
  category: string;
  lines: PricedLine[];
  subtotal: number;
}

export interface PricedQuote {
  groups: QuoteGroup[];
  /** Lines in group order — the order every view shows them in. */
  lines: PricedLine[];
  subtotal: number;
  discount: number;
  total: number;
  /** Σ quantity. */
  pieces: number;
}

/** Category order on screen and on paper: the app's list, then anything
 *  else A–Z, then lines with no category ("Other") last. */
export const CATEGORY_ORDER = [
  'Audio', 'Lighting', 'Video / LED', 'Backline',
  'Rigging', 'Power', 'Cases', 'Cables', 'Staging',
] as const;
export const NO_CATEGORY = 'Other';

function categoryRank(c: string): [number, string] {
  const i = (CATEGORY_ORDER as readonly string[]).indexOf(c);
  if (i >= 0) return [i, ''];
  if (c === NO_CATEGORY) return [CATEGORY_ORDER.length + 1, ''];
  return [CATEGORY_ORDER.length, c.toLowerCase()];
}

export function compareCategories(a: string, b: string): number {
  const [ra, sa] = categoryRank(a);
  const [rb, sb] = categoryRank(b);
  return ra - rb || sa.localeCompare(sb);
}

const money = (n: number) => Math.round(n * 100) / 100;

export function priceQuote(args: {
  lines: QuoteLineInput[];
  stock: QuoteStockItem[];
  days: number;
  discountPercent?: number | null;
  discountFixed?: number | null;
}): PricedQuote {
  const byId = new Map(args.stock.map((s) => [s.id, s]));
  const days = Math.max(0, args.days || 0);
  const priced: PricedLine[] = args.lines.map((l) => {
    const item = l.gear_id ? byId.get(l.gear_id) : undefined;
    const own = item ? effectiveInventoryDayRate(item) ?? 0 : 0;
    const rate = l.day_rate_override ?? own;
    const quantity = Math.max(1, Math.round(Number(l.quantity) || 1));
    return {
      id: l.id,
      gearId: l.gear_id,
      name: item?.name ?? 'Unknown item',
      category: item?.category?.trim() || NO_CATEGORY,
      imageUrl: item?.image_url ?? null,
      quantity,
      rate,
      custom: l.day_rate_override != null && Math.abs(l.day_rate_override - own) >= 0.005,
      total: money(quantity * days * rate),
    };
  });

  const map = new Map<string, PricedLine[]>();
  for (const p of priced) {
    const arr = map.get(p.category) ?? [];
    arr.push(p);
    map.set(p.category, arr);
  }
  const groups: QuoteGroup[] = [...map.entries()]
    .sort(([a], [b]) => compareCategories(a, b))
    .map(([category, lines]) => ({
      category,
      lines,
      subtotal: money(lines.reduce((s, l) => s + l.total, 0)),
    }));

  const subtotal = money(groups.reduce((s, g) => s + g.subtotal, 0));
  const pct = Math.min(100, Math.max(0, Number(args.discountPercent) || 0));
  const fixed = Math.max(0, Number(args.discountFixed) || 0);
  const discount = money(Math.min(subtotal, subtotal * (pct / 100) + fixed));
  return {
    groups,
    lines: groups.flatMap((g) => g.lines),
    subtotal,
    discount,
    total: money(subtotal - discount),
    pieces: priced.reduce((s, l) => s + l.quantity, 0),
  };
}

/** "a week is charged as 3 days" — the job's real rule, never a fixed 3. */
export function weekRuleText(daysPerWeek: number): string {
  const n = Number.isInteger(daysPerWeek) ? String(daysPerWeek) : daysPerWeek.toFixed(1);
  return `a week is charged as ${n} day${daysPerWeek === 1 ? '' : 's'}`;
}

/** How long a quote holds when nothing else says (Adam, Nov 2026: 14). */
export const DEFAULT_QUOTE_VALID_DAYS = 14;

/** A quote's last valid day, as YYYY-MM-DD, counted from the day it's issued. */
export function quoteValidUntil(issued: Date, validDays: number = DEFAULT_QUOTE_VALID_DAYS): string {
  const d = new Date(Date.UTC(issued.getFullYear(), issued.getMonth(), issued.getDate()));
  d.setUTCDate(d.getUTCDate() + Math.max(1, Math.round(validDays) || DEFAULT_QUOTE_VALID_DAYS));
  return d.toISOString().slice(0, 10);
}

/** Quote validity days as stored: whole days, 1–365, else the default. */
export function cleanValidDays(v: unknown): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 365 ? n : DEFAULT_QUOTE_VALID_DAYS;
}

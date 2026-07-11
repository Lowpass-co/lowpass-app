/* ============================================
   LOWPASS — Utility Functions

   General-purpose helpers used across the app.
   ============================================ */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes safely.
 * Combines clsx (conditional classes) with tailwind-merge (deduplication).
 *
 * Usage: cn('px-4 py-2', isActive && 'bg-lp-orange', className)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Capitalise tour status for display (e.g. "planning" → "Planning"). */
export function capitaliseStatus(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Display name in title case (e.g. "john doe" → "John Doe").
 * Fixes lowercase display bug for user names.
 */
export function toTitleCase(s: string | null | undefined): string {
  if (!s || !s.trim()) return '';
  return s
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Format a date string for display.
 * Uses DD/MM/YY format (UK style, since Adam is UK-based).
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

/**
 * Format a date for display with day name.
 * Example: "Mon, 13/06"
 */
export function formatDateWithDay(dateString: string): string {
  const date = new Date(dateString);
  const day = date.toLocaleDateString('en-GB', { weekday: 'short' });
  const dateStr = date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
  });
  return `${day}, ${dateStr}`;
}

/**
 * Format for routing grid: "Mon 6 Mar 2026" — three-letter month, single line.
 */
export function formatRoutingDateShort(dateString: string): string {
  const date = parseRoutingDate(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Format tour date range: "6 Mar – 20 Apr 2026" (three-letter months, no numeric).
 */
export function formatTourDateRange(startDate: string, endDate: string): string {
  const start = parseRoutingDate(startDate);
  const end = parseRoutingDate(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return `${startDate} – ${endDate}`;
  const startStr = start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const endStr = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${startStr} – ${endStr}`;
}

/**
 * Parse a YYYY-MM-DD date string for routing/calendar display.
 * Uses noon local to avoid DST edge cases; safe for display.
 */
export function parseRoutingDate(dateStr: string): Date {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return new Date(NaN);
  return new Date(dateStr + 'T12:00:00');
}

/**
 * Format for day view card header: "22 MAY" (day + short month uppercase).
 */
export function formatDayCardDate(dateString: string): string {
  const date = parseRoutingDate(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  const day = date.getDate();
  const month = date.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
  return `${day} ${month}`;
}

/**
 * Format currency amounts.
 * Handles GBP, USD, EUR, and AUD.
 */
export function formatCurrency(amount: number, currency: string = 'GBP'): string {
  const symbols: Record<string, string> = {
    GBP: '£',
    USD: '$',
    EUR: '€',
    AUD: 'A$',
  };
  const symbol = symbols[currency] || currency;
  return `${symbol}${amount.toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Whole-pound currency via the Intl currency style (locale-aware symbol
 * placement), no decimals. Distinct from formatCurrency (which uses a fixed
 * symbol map + 2 decimals). Extracted verbatim from the byte-identical locals
 * in BudgetSummaryTab + BudgetMainTable — same output, one home.
 */
export function formatCurrencyWhole(value: number, currency: string): string {
  try {
    return value.toLocaleString('en-GB', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  } catch {
    return `${currency} ${Math.round(value)}`;
  }
}

/**
 * Generate a Lowpass Personnel ID.
 * Format: LP-00001, LP-00002, etc.
 */
export function generateLpId(sequence: number): string {
  return `LP-${String(sequence).padStart(5, '0')}`;
}

/** Parse day_type (may be comma-separated) into array of single types. */
export function parseDayTypes(value: string): string[] {
  if (!value || !value.trim()) return [];
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

/** First day type when value is comma-separated (for display). */
export function firstDayType(value: string): string {
  const types = parseDayTypes(value);
  return types[0] ?? '';
}

/** Whether day_type string includes a given type. */
export function dayTypesInclude(value: string, type: string): boolean {
  return parseDayTypes(value).includes(type);
}

/**
 * Get human-readable label for a day type.
 */
export function getDayTypeLabel(dayType: string): string {
  const labels: Record<string, string> = {
    show: 'Show Day',
    off: 'Day Off',
    travel: 'Travel Day',
    rehearsal: 'Rehearsal',
    press: 'Press Day',
    radio: 'Radio performance',
    tv: 'TV Performance',
    festival: 'Festival',
  };
  return labels[dayType] || dayType;
}

/** Extra palette for custom day types (assigned deterministically by hash) */
const CUSTOM_DAY_TYPE_COLORS: { bg: string; text: string; dot: string }[] = [
  { bg: 'bg-cyan-500/10', text: 'text-cyan-600 dark:text-cyan-400', dot: 'bg-cyan-500' },
  { bg: 'bg-teal-500/10', text: 'text-teal-600 dark:text-teal-400', dot: 'bg-teal-500' },
  { bg: 'bg-lime-500/10', text: 'text-lime-600 dark:text-lime-400', dot: 'bg-lime-500' },
  { bg: 'bg-indigo-500/10', text: 'text-indigo-600 dark:text-indigo-400', dot: 'bg-indigo-500' },
  { bg: 'bg-fuchsia-500/10', text: 'text-fuchsia-600 dark:text-fuchsia-400', dot: 'bg-fuchsia-500' },
  { bg: 'bg-slate-500/10', text: 'text-slate-600 dark:text-slate-400', dot: 'bg-slate-500' },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i) | 0;
  return Math.abs(h);
}

/**
 * Get the colour class for a day type.
 * Preset types use fixed colours; custom types get a deterministic colour from the palette.
 */
export function getDayTypeColor(dayType: string): { bg: string; text: string; dot: string } {
  const colors: Record<string, { bg: string; text: string; dot: string }> = {
    show: { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
    off: { bg: 'bg-gray-500/10', text: 'text-gray-600 dark:text-gray-400', dot: 'bg-gray-500' },
    travel: { bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', dot: 'bg-blue-500' },
    rehearsal: { bg: 'bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400', dot: 'bg-violet-500' },
    press: { bg: 'bg-pink-500/10', text: 'text-pink-600 dark:text-pink-400', dot: 'bg-pink-500' },
    radio: { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
    tv: { bg: 'bg-red-500/10', text: 'text-red-600 dark:text-red-400', dot: 'bg-red-500' },
    festival: { bg: 'bg-lp-orange/10', text: 'text-lp-orange', dot: 'bg-lp-orange' },
  };
  if (colors[dayType]) return colors[dayType];
  const idx = hashString(dayType) % CUSTOM_DAY_TYPE_COLORS.length;
  return CUSTOM_DAY_TYPE_COLORS[idx];
}

/**
 * Get human-readable advance status label and colour.
 */
export function getAdvanceStatusInfo(status: string): { label: string; color: string; bg: string } {
  const statuses: Record<string, { label: string; color: string; bg: string }> = {
    not_started: { label: 'Not Started', color: 'text-gray-500', bg: 'bg-gray-500/10' },
    in_progress: { label: 'In Progress', color: 'text-blue-500', bg: 'bg-blue-500/10' },
    complete: { label: 'Complete', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    needs_review: { label: 'Needs Review', color: 'text-amber-500', bg: 'bg-amber-500/10' },
  };
  return statuses[status] || { label: status, color: 'text-gray-500', bg: 'bg-gray-500/10' };
}

/**
 * Truncate text to a maximum length with ellipsis.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * Generate a URL-friendly slug from text.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Check if a date string is stale (older than threshold).
 * Default threshold: 6 months.
 */
export function isStale(dateString: string, thresholdMonths: number = 6): boolean {
  const date = new Date(dateString);
  const threshold = new Date();
  threshold.setMonth(threshold.getMonth() - thresholdMonths);
  return date < threshold;
}

/**
 * Generate points along a great-circle arc between two coordinates.
 * Simpler than turn-by-turn, not a straight line — curved on the map.
 * Returns array of [lat, lng] for n segments (n+1 points).
 */
export function greatCirclePoints(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  segments: number = 24
): [number, number][] {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(lat1);
  const λ1 = toRad(lng1);
  const φ2 = toRad(lat2);
  const λ2 = toRad(lng2);
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((φ1 - φ2) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ1 - λ2) / 2) ** 2
  ));
  // Same point (or nearly so) — avoid division by zero in slerp
  if (Math.abs(d) < 1e-10) {
    return [[lat1, lng1], [lat2, lng2]];
  }
  const points: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const f = i / segments;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    const φi = Math.atan2(z, Math.sqrt(x * x + y * y));
    const λi = Math.atan2(y, x);
    points.push([toDeg(φi), toDeg(λi)]);
  }
  return points;
}

/**
 * Great-circle distance between two points in miles (Haversine).
 */
export function distanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3959; // Earth radius in miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lng2 - lng1);
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

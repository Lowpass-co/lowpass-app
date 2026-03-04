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
 * Generate a Lowpass Personnel ID.
 * Format: LP-00001, LP-00002, etc.
 */
export function generateLpId(sequence: number): string {
  return `LP-${String(sequence).padStart(5, '0')}`;
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
    radio: 'Radio Day',
    tv: 'TV Performance',
    festival: 'Festival',
  };
  return labels[dayType] || dayType;
}

/**
 * Get the colour class for a day type.
 * Returns Tailwind class names for background and text.
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
  return colors[dayType] || { bg: 'bg-gray-500/10', text: 'text-gray-500', dot: 'bg-gray-500' };
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

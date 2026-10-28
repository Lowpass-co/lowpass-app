/* Small display helpers for the Advance pages (dates in en-GB, cell words). */

import type { CellState } from '@/lib/advance/board';

const D = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);

export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return '';
  return D(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');
}

export function fmtLong(iso: string | null | undefined): string {
  if (!iso) return '';
  return D(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).replace(',', '');
}

export function fmtRange(a: string, b: string): string {
  return a === b ? fmtDay(a) : `${fmtDay(a)} – ${fmtDay(b)}`;
}

export function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

type CellLike = { answered: number; total: number; toReview: number } | null | undefined;

export function cellText(s: CellState, c: CellLike): string {
  switch (s) {
    case 'done': return '✓';
    case 'review': return String(c?.toReview ?? '');
    case 'asked': return 'Asked';
    case 'partial': return `${c?.answered ?? 0}/${c?.total ?? 0}`;
    case 'none': return '—';
    default: return 'off';
  }
}

export function stateWord(s: CellState, c: CellLike): string {
  switch (s) {
    case 'done': return 'all answered';
    case 'review': return `${c?.toReview} answers to review`;
    case 'asked': return 'asked the venue';
    case 'partial': return `${c?.answered} of ${c?.total} answered`;
    case 'none': return 'not started';
    default: return 'not on this day';
  }
}

export const DAY_TYPE_LABEL: Record<string, string> = {
  show: 'Show day',
  festival: 'Festival',
  rehearsal: 'Rehearsal',
  travel: 'Travel day',
  off: 'Day off',
  press: 'Press',
  radio: 'Radio',
  tv: 'TV',
};

export function dayTypeLabel(dayType: string): string {
  const first = (dayType || 'show').split(',')[0].trim().toLowerCase();
  return DAY_TYPE_LABEL[first] ?? first.charAt(0).toUpperCase() + first.slice(1);
}

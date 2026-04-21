/**
 * Commission percentage fields in `budget_commissions` (and some UI paths):
 * - modern: decimal 0.025 = 2.5%
 * - legacy: whole points 15 = 15% (migrated in memory to 0.15)
 */
export function normalizeCommissionPct(raw: number | null | undefined): number {
  const v = Number(raw);
  if (!Number.isFinite(v) || v <= 0) return 0;
  if (v > 1) return v / 100;
  return v;
}

/** One-decimal “percent point” for display, e.g. 0.025 -> "2.5" */
export function formatCommissionDisplayPercentString(stored: number | null | undefined): string {
  const norm = normalizeCommissionPct(stored);
  if (!norm) return '0';
  const x = (Math.round(norm * 1000) / 10).toFixed(1);
  return x.replace(/\.0$/, '');
}

/** User-editable “percent” field: 2.5 means 2.5% (stored 0.025) */
export function userPercentInputToStored(displayPercentPoints: number | string): number {
  const v = Number(displayPercentPoints);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return v / 100;
}

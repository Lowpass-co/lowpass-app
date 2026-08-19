/**
 * LOWPASS — Budget input parsing
 *
 * WHAT USED TO BE HERE, and why it is gone (2026-08-19).
 *
 * `computeBudgetSummary` — a full P&L, ~190 lines of Decimal.js arithmetic —
 * lived in this file with **zero importers**. It was a ninth payroll formula:
 * proposed salaries from pre-migration-261 arithmetic over legacy rate columns
 * that are 0 on every card with `personnel_rate_lines`, actual salaries from
 * `payroll_entries.total_fee`, a column that is empty until somebody paints a
 * day status. Both halves came out zero on live data.
 *
 * It was deleted rather than converged, because a reference count of ZERO is
 * the reason to delete: nothing runs it, so nothing can ever tell us it is
 * wrong. `/api/budget/summary` is the live P&L; `computeBudgetPnl.ts` is the
 * live client-side one.
 *
 * `parseBudgetAmountInput` is the only thing anything imported, and it has two
 * real callers (`InlineEditCell`, `_legacy/budget/IncomeTab`).
 */

/**
 * Parse amounts typed in budget forms (e.g. "70,000"). Commas/whitespace are stripped;
 * decimal dot is US-style. `null` = empty/invalid, caller may coerce to 0.
 */
export function parseBudgetAmountInput(raw: string): number | null {
  const t = raw.trim();
  if (t === '' || t === '.' || t === '-' || t === '-.') return null;
  const norm = t.replace(/,/g, '').replace(/\s+/g, '');
  if (norm === '' || norm === '.' || norm === '-' || norm === '-.') return null;
  const n = parseFloat(norm);
  return Number.isFinite(n) ? n : null;
}

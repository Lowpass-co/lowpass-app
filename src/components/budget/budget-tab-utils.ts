/* ============================================
   LOWPASS — Budget · tab utilities (server-safe)

   Pure helpers extracted from BudgetTabNav.tsx so the per-tour
   server page can resolve the active tab without crossing the
   server→client boundary (which Next 16 rejects with the digest
   2655211188 crash Adam saw on Vercel preview).

   Re-exported from BudgetTabNav.tsx for backward compat with any
   existing client-side imports.
   ============================================ */

/* Budget Phase 0 — the bar is SUMMARY | EXPENSES | INCOME | SETTINGS.
   'actuals' (Phase A) and 'reports' (Phase 0) are retired: their stale
   bookmarks redirect-by-resolution rather than 404 — 'reports' → 'summary'
   (its export lives on the context band), 'actuals'/unknown → 'budget'. */
export type BudgetTab =
  | 'budget'
  | 'income'
  /* RQ-6 — Receipts is a first-class tab, not a panel buried under the grid.
     IA_CANONICAL lists it as a Money-mode rail item "when RC-1 lands"; until
     the S-2 rail exists, the budget tab bar IS the Money rail. */
  | 'receipts'
  | 'settings';

export function resolveBudgetTab(
  raw: string | string[] | undefined,
): BudgetTab {
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  switch (candidate) {
    case 'income':
    case 'receipts':
    case 'settings':
      return candidate;
    // Oct 2026 — Summary merged into the budget sheet (totals + commissions on
    // top of the grid). Stale ?tab=summary / ?tab=reports links land there.
    case 'summary':
    case 'reports':
    case 'budget':
    default:
      return 'budget';
  }
}

/* ============================================
   LOWPASS — Budget · tab utilities (server-safe)

   Pure helpers extracted from BudgetTabNav.tsx so the per-tour
   server page can resolve the active tab without crossing the
   server→client boundary (which Next 16 rejects with the digest
   2655211188 crash Adam saw on Vercel preview).

   Re-exported from BudgetTabNav.tsx for backward compat with any
   existing client-side imports.
   ============================================ */

/* Budget Phase A §A2 — 'actuals' removed. Proposed / Actual /
   Variance now live side-by-side on the Budget tab grid. Stale
   bookmarks with ?tab=actuals fall through to 'summary' by the
   default branch below. */
export type BudgetTab =
  | 'summary'
  | 'budget'
  | 'reports'
  | 'settings';

export function resolveBudgetTab(
  raw: string | string[] | undefined,
): BudgetTab {
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  /* Budget is the landing tab — the TM almost always wants the line-item
     grid first. Summary/Reports/Settings are explicit; everything else
     (no ?tab, stale ?tab=actuals, unknown) falls through to Budget. */
  switch (candidate) {
    case 'summary':
    case 'reports':
    case 'settings':
      return candidate;
    case 'budget':
    default:
      return 'budget';
  }
}

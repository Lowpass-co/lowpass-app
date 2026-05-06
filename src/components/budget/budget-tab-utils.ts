/* ============================================
   LOWPASS — Budget · tab utilities (server-safe)

   Pure helpers extracted from BudgetTabNav.tsx so the per-tour
   server page can resolve the active tab without crossing the
   server→client boundary (which Next 16 rejects with the digest
   2655211188 crash Adam saw on Vercel preview).

   Re-exported from BudgetTabNav.tsx for backward compat with any
   existing client-side imports.
   ============================================ */

export type BudgetTab =
  | 'summary'
  | 'budget'
  | 'actuals'
  | 'reports'
  | 'settings';

export function resolveBudgetTab(
  raw: string | string[] | undefined,
): BudgetTab {
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  switch (candidate) {
    case 'budget':
    case 'actuals':
    case 'reports':
    case 'settings':
      return candidate;
    default:
      return 'summary';
  }
}

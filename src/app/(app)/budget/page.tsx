/* ============================================
   LOWPASS — Budget Page
   ============================================ */

import { Suspense } from 'react';
import { BudgetTourRedirect } from '@/components/budget/BudgetTourRedirect';
import { BUDGET_TABS, TabId } from '@/components/budget/budget-tabs';
import { TourBudgetAccordionDynamic } from '@/components/budget/TourBudgetAccordionDynamic';
import { BudgetDetailShell } from '@/components/budget/BudgetDetailShell';
import { BudgetOverviewToolbar } from '@/components/budget/BudgetOverviewToolbar';

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ tour_id?: string; tab?: string; view?: string }>;
}) {
  const params = await searchParams;
  const tourId = params.tour_id ?? null;
  const rawTab = params.tab;
  // Default to spreadsheet-style detail; use view=overview for accordion summary.
  const view = params.view ?? 'detail';

  const tab = (rawTab as TabId | undefined) ?? 'summary';
  const validTab = BUDGET_TABS.some((t) => t.id === tab) ? tab : 'summary';

  if (!tourId) {
    return (
      <>
        <Suspense fallback={null}>
          <BudgetTourRedirect />
        </Suspense>
        <div className="-mx-6 -my-6 flex h-[calc(100vh-4rem)] items-center justify-center p-8">
          <div className="max-w-md rounded-xl border border-lp-border bg-lp-surface p-6 text-center">
            <p className="text-lg font-semibold text-lp-text">Select a tour to open the Budget</p>
            <p className="mt-2 text-sm text-lp-text-secondary">
              Use the Artist and Tour selectors in the Finance section of the sidebar.
            </p>
          </div>
        </div>
      </>
    );
  }

  // ── New accordion overview (default) ──────────────────────────────────────
  if (view === 'overview') {
    return (
      <div className="lp-budget -mx-6 -my-6 h-[calc(100vh-4rem)] flex flex-col bg-transparent overflow-hidden">
        {/* Toolbar: title + "Detailed view" toggle */}
        <div
          className="shrink-0 flex flex-col gap-3 border-b border-lp-border/60 px-6 py-3 sm:flex-row sm:items-center sm:justify-between"
          style={{ background: 'var(--lp-dashboard-bg)' }}
        >
          <h1 className="text-[13px] font-semibold text-lp-text">Budget Overview</h1>
          <div className="flex flex-wrap items-center gap-4">
            <BudgetOverviewToolbar tourId={tourId} />
            <a
              href={`/budget?tour_id=${tourId}&view=detail&tab=summary`}
              className="text-[11px] text-lp-text-tertiary hover:text-lp-orange/80"
            >
              Spreadsheet budget →
            </a>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <TourBudgetAccordionDynamic tourId={tourId} />
        </div>
      </div>
    );
  }

  // ── Spreadsheet-style detail (tabs + grids + tour currency) ────────────────
  return (
    <div className="lp-budget -mx-6 -my-6 flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-transparent">
      <BudgetDetailShell tourId={tourId} activeTab={validTab} />
    </div>
  );
}

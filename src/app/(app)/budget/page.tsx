/* ============================================
   LOWPASS — Budget Page
   ============================================ */

import { Suspense } from 'react';
import { listAppPageShell, spreadsheetAppPageShell } from '@/components/shell/app-page-shells';
import { getBudgetSheetSections } from '@/lib/shell/rails/budgetSheetSections';
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

  const tab =
    rawTab === 'day-view'
      ? 'summary'
      : ((rawTab as TabId | undefined) ?? 'summary');
  const validTab = BUDGET_TABS.some((t) => t.id === tab) ? tab : 'summary';

  if (!tourId) {
    return listAppPageShell(
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
  if (view === 'overview' && tourId) {
    return spreadsheetAppPageShell(
      <div className="lp-budget -mx-6 -my-6 h-[calc(100vh-4rem)] flex flex-col bg-transparent overflow-hidden">
        <div
          className="shrink-0 flex flex-col gap-3 border-b border-lp-border/60 px-6 py-3 sm:flex-row sm:items-center sm:justify-between"
          style={{ background: 'var(--lp-dashboard-bg)' }}
        >
          <div className="flex items-center gap-3">
            <div className="shrink-0">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-lp-table-header-text">
                View Style
              </p>
              <div className="relative flex w-[14.5rem] rounded-xl border border-[var(--lp-sidebar-border)] p-1">
                <span
                  className="absolute bottom-1 top-1 w-[calc(50%-6px)] rounded-lg bg-lp-orange transition-[left,opacity] duration-200"
                  style={{ left: '4px', opacity: 1 }}
                />
                <a
                  href={`/budget?tour_id=${tourId}&view=overview`}
                  className="lp-label-caps relative z-10 flex flex-1 items-center justify-center rounded-md py-2 text-[11px] text-white transition-colors"
                >
                  Overview
                </a>
                <a
                  href={`/budget?tour_id=${tourId}&view=detail&tab=summary`}
                  className="lp-label-caps relative z-10 flex flex-1 items-center justify-center rounded-md py-2 text-[11px] text-[var(--lp-sidebar-text-muted)] transition-colors"
                >
                  Spreadsheet
                </a>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <BudgetOverviewToolbar tourId={tourId} />
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <TourBudgetAccordionDynamic tourId={tourId} />
        </div>
      </div>,
      getBudgetSheetSections(tourId, 'summary')
    );
  }

  // ── Spreadsheet-style detail (tabs + grids + tour currency) ────────────────
  return spreadsheetAppPageShell(
    <div className="lp-budget -mx-6 -my-6 flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-transparent">
      <BudgetDetailShell tourId={tourId} activeTab={validTab} />
    </div>,
    getBudgetSheetSections(tourId, validTab)
  );
}

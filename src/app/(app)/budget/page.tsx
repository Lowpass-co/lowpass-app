/* ============================================
   LOWPASS — Budget Page
   ============================================ */

import { Suspense } from 'react';
import { BudgetTourRedirect } from '@/components/budget/BudgetTourRedirect';
import { BudgetTabs } from '@/components/budget/BudgetTabs';
import { BUDGET_TABS, TabId } from '@/components/budget/budget-tabs';
import { BudgetFolderTabsNav } from '@/components/budget/BudgetFolderTabsNav';

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ tour_id?: string; tab?: string }>;
}) {
  const params = await searchParams;
  const tourId = params.tour_id ?? null;
  const rawTab = params.tab;
  const tab =
    rawTab === 'day-view'
      ? 'summary'
      : ((rawTab as TabId | undefined) ?? 'summary');
  const validTab = BUDGET_TABS.some((t) => t.id === tab) ? tab : 'summary';

  if (!tourId) {
    return (
      <>
        <Suspense fallback={null}>
          <BudgetTourRedirect />
        </Suspense>
        <div className="-mx-6 -my-6 flex h-[calc(100vh-4rem)] items-center justify-center p-8">
          <div className="max-w-md rounded-xl border border-lp-border bg-lp-surface p-6 text-center">
            <p className="text-lg font-semibold text-lp-text">Select tour to open Budget</p>
            <p className="mt-2 text-sm text-lp-text-secondary">
              Use the Artist and Tour selectors in the Finance section of the sidebar.
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="lp-budget -mx-6 -my-6 h-[calc(100vh-4rem)] px-0 py-0">
      <div className="flex h-full w-full flex-col bg-transparent">
        {validTab === 'summary' ? (
          <>
            <div className="px-6 pt-6">
              <BudgetFolderTabsNav tourId={tourId} activeTab={validTab} />
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-8">
              <div className="grid h-full min-h-0 flex-1 grid-cols-1 gap-x-8 gap-y-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <div className="min-h-0 min-w-0 overflow-auto">
                  <BudgetTabs tourId={tourId} activeTab={validTab} summarySlot="left" />
                </div>
                <div className="flex min-h-0 min-w-0 flex-col overflow-hidden" style={{ gridColumn: 2 }}>
                  <p className="shrink-0 pb-1 text-[11px] font-semibold uppercase tracking-wider text-black dark:text-white">
                    Breakdown
                  </p>
                  <div className="min-h-0 flex-1 overflow-hidden">
                    <BudgetTabs tourId={tourId} activeTab={validTab} summarySlot="right" />
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-auto">
              <header
                className="sticky top-0 z-30 shrink-0 px-6 pt-6 pb-3"
                style={{ background: 'var(--lp-dashboard-bg)' }}
              >
                <BudgetFolderTabsNav tourId={tourId} activeTab={validTab} />
              </header>
              <div className="px-8 pb-8 pt-0">
                <BudgetTabs tourId={tourId} activeTab={validTab} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

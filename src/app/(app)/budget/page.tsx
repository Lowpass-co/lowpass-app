/* ============================================
   LOWPASS — Budget Page
   ============================================ */

import { Suspense } from 'react';
import { cn } from '@/lib/utils';
import { BudgetTourLanding } from '@/components/budget/BudgetTourLanding';
import { BudgetTourRedirect } from '@/components/budget/BudgetTourRedirect';
import { BudgetTourSelector } from '@/components/budget/BudgetTourSelector';
import { BudgetTabs, BudgetTabsNav } from '@/components/budget/BudgetTabs';
import { BUDGET_TABS, TabId } from '@/components/budget/budget-tabs';

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ tour_id?: string; tab?: string }>;
}) {
  const params = await searchParams;
  const tourId = params.tour_id ?? null;
  const tab = (params.tab as TabId | undefined) ?? 'summary';
  const validTab = BUDGET_TABS.some((t) => t.id === tab) ? tab : 'summary';

  if (!tourId) {
    return (
      <>
        <Suspense fallback={null}>
          <BudgetTourRedirect />
        </Suspense>
        <div
          className="-mx-6 -my-6 flex h-[calc(100vh-4rem)] flex-col lp-dashboard-glass"
          style={{ background: 'var(--lp-dashboard-bg)' }}
        >
          <BudgetTourLanding />
        </div>
      </>
    );
  }

  return (
    <div
      className="-mx-6 -my-6 h-[calc(100vh-4rem)] px-0 py-0"
      style={{ background: 'var(--lp-dashboard-bg)' }}
    >
      <div
        className="flex h-full w-full"
        style={{
          background: 'var(--lp-budget-wrap-bg)',
        }}
      >
        {/* LEFT: Budget tab nav — extends visually from the collapsed sidebar */}
        <aside
          className={cn(
            'group/nav flex shrink-0 flex-col border-r transition-[width] duration-300 ease-out',
            'w-[52px] hover:w-[240px]',
            validTab === 'summary' ? 'py-8' : 'py-8'
          )}
          style={{ borderColor: 'var(--lp-budget-wrap-border)', background: 'var(--lp-budget-wrap-bg)' }}
        >
          <BudgetTabsNav tourId={tourId} activeTab={validTab} leftRail />
        </aside>

        {/* RIGHT: Main budget content */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div
            className={cn(
              'flex h-full min-w-0 flex-1 flex-col',
              validTab === 'summary' ? 'px-8 pb-8 pt-0' : 'p-8'
            )}
          >
            {validTab === 'summary' ? (
              <div className="grid h-full min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-x-8 gap-y-0" style={{ gridTemplateRows: 'auto 1fr' }}>
                <div className="min-w-0 pt-8">
                  <Suspense fallback={<div className="h-16 animate-pulse" />}>
                    <BudgetTourSelector basePath="/budget" defaultTab="summary" constrainTourName />
                  </Suspense>
                </div>
                <div className="min-h-0 min-w-0 overflow-auto">
                  <BudgetTabs tourId={tourId} activeTab={validTab} summarySlot="left" />
                </div>
                <div className="flex min-h-0 min-w-0 flex-col overflow-hidden" style={{ gridRow: '1 / -1', gridColumn: 2 }}>
                  <p className="shrink-0 pt-8 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Breakdown</p>
                  <div className="min-h-0 flex-1 overflow-hidden">
                    <BudgetTabs tourId={tourId} activeTab={validTab} summarySlot="right" />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <Suspense fallback={<div className="h-16 animate-pulse" />}>
                  <BudgetTourSelector basePath="/budget" defaultTab="summary" />
                </Suspense>
                <div className="mt-8 flex h-0 flex-1 gap-8">
                  <div className="min-w-0 flex-1 overflow-auto">
                    <BudgetTabs tourId={tourId} activeTab={validTab} />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

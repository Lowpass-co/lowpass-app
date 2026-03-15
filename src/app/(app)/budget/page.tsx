/* ============================================
   LOWPASS — Budget Page
   ============================================ */

import { Suspense } from 'react';
import { BudgetTourLanding } from '@/components/budget/BudgetTourLanding';
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
      <div
        className="-mx-6 -my-6 flex h-[calc(100vh-4rem)] flex-col lp-dashboard-glass"
        style={{ background: 'var(--lp-dashboard-bg)' }}
      >
        <BudgetTourLanding />
      </div>
    );
  }

  return (
    <div
      className="lp-dashboard-glass min-h-[60vh] rounded-2xl p-6 md:p-8"
      style={{ background: 'var(--lp-dashboard-bg)' }}
    >
      <div className="mx-auto flex max-w-7xl gap-8">
        <div className="min-w-0 flex-1 space-y-6">
          <Suspense fallback={<div className="h-16 animate-pulse" />}>
            <BudgetTourSelector basePath="/budget" defaultTab="summary" />
          </Suspense>
          <BudgetTabs tourId={tourId} activeTab={validTab} />
        </div>
        <aside className="w-44 shrink-0">
          <BudgetTabsNav tourId={tourId} activeTab={validTab} />
        </aside>
      </div>
    </div>
  );
}

/* ============================================
   LOWPASS — Budget Page
   ============================================ */

import { Suspense } from 'react';
import { BudgetTourLanding } from '@/components/budget/BudgetTourLanding';
import { BudgetTourSelector } from '@/components/budget/BudgetTourSelector';
import { BudgetTabs } from '@/components/budget/BudgetTabs';
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
      <div className="-mx-6 -my-6 flex h-[calc(100vh-4rem)] flex-col">
        <BudgetTourLanding />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Suspense fallback={<div className="h-16 animate-pulse" />}>
        <BudgetTourSelector basePath="/budget" defaultTab="summary" />
      </Suspense>
      <BudgetTabs tourId={tourId} activeTab={validTab} />
    </div>
  );
}

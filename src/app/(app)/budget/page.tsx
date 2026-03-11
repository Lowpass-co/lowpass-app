/* ============================================
   LOWPASS — Budget Page
   ============================================ */

import { Suspense } from 'react';
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

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Suspense fallback={<div className="h-16 animate-pulse" />}>
        <BudgetTourSelector basePath="/budget" defaultTab="summary" />
      </Suspense>

      {tourId ? (
        <BudgetTabs tourId={tourId} activeTab={validTab} />
      ) : (
        <div className="rounded-xl border border-lp-border bg-lp-surface p-8 text-center">
          <p className="text-lp-text-secondary">Select a tour above to view budget.</p>
        </div>
      )}
    </div>
  );
}

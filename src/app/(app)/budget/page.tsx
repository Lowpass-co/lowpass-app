/* ============================================
   LOWPASS — Budget Page
   ============================================ */

import { Suspense } from 'react';
import { BudgetTourSelector } from '@/components/budget/BudgetTourSelector';
import { BudgetTabs, BUDGET_TABS } from '@/components/budget/BudgetTabs';

type TabId = (typeof BUDGET_TABS)[number]['id'];

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ tour_id?: string; tab?: string }>;
}) {
  const params = await searchParams;
  const tourId = params.tour_id ?? null;
  const tab = (params.tab as TabId) ?? 'summary';
  const validTab = BUDGET_TABS.some((t) => t.id === tab) ? tab : 'summary';

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-lp-text">Budget</h1>
        <p className="mt-1 text-sm text-lp-text-secondary">
          Income, expenses, and P&L by tour.
        </p>
      </div>

      <Suspense fallback={<div className="h-20 rounded-xl border border-lp-border bg-lp-surface animate-pulse" />}>
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

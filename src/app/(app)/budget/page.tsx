/* ============================================
   LOWPASS — Budget Page
   ============================================ */

import { Suspense } from 'react';
import { BudgetTourRedirect } from '@/components/budget/BudgetTourRedirect';
import { BudgetTabs } from '@/components/budget/BudgetTabs';
import { BUDGET_TABS, TabId } from '@/components/budget/budget-tabs';
import { BudgetFolderTabsNav } from '@/components/budget/BudgetFolderTabsNav';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const TourBudgetAccordion = dynamic(
  () => import('@/components/budget/TourBudgetAccordion').then(m => ({ default: m.TourBudgetAccordion })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center gap-2 p-8 text-lp-text-secondary text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading budget…
      </div>
    ),
  }
);

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ tour_id?: string; tab?: string; view?: string }>;
}) {
  const params = await searchParams;
  const tourId = params.tour_id ?? null;
  const rawTab = params.tab;
  const view = params.view ?? 'overview'; // 'overview' = new accordion | 'detail' = old tabs

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
          className="shrink-0 flex items-center justify-between gap-4 px-6 py-3 border-b border-lp-border/60"
          style={{ background: 'var(--lp-dashboard-bg)' }}
        >
          <h1 className="text-[13px] font-semibold text-lp-text">Budget Overview</h1>
          <a
            href={`/budget?tour_id=${tourId}&view=detail&tab=summary`}
            className="text-[11px] text-lp-text-tertiary hover:text-lp-orange transition-colors"
          >
            Detailed view →
          </a>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <TourBudgetAccordion tourId={tourId} />
        </div>
      </div>
    );
  }

  // ── Legacy detailed tabs view (view=detail) ───────────────────────────────
  return (
    <div className="lp-budget -mx-6 -my-6 h-[calc(100vh-4rem)] px-0 py-0">
      <div className="flex h-full w-full flex-col bg-transparent">
        {/* Back to overview link */}
        <div
          className="shrink-0 flex items-center gap-4 px-6 pt-4 pb-2"
          style={{ background: 'var(--lp-dashboard-bg)' }}
        >
          <a
            href={`/budget?tour_id=${tourId}&view=overview`}
            className="text-[11px] text-lp-text-tertiary hover:text-lp-orange transition-colors"
          >
            ← Budget Overview
          </a>
        </div>

        {validTab === 'summary' ? (
          <>
            <div className="px-6 pt-2">
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
                className="sticky top-0 z-30 shrink-0 px-6 pt-4 pb-3"
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

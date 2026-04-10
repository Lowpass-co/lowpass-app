'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import React, { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BUDGET_TABS, type TabId } from './budget-tabs';
import { BudgetTabIcon } from './budget-tab-icons';

const SummaryTab = dynamic(
  () => import('@/components/budget/SummaryTab').then((m) => ({ default: m.SummaryTab })),
  { ssr: false }
);
const IncomeTab = dynamic(
  () => import('@/components/budget/IncomeTab').then((m) => ({ default: m.IncomeTab })),
  { ssr: false }
);
const SalariesTab = dynamic(
  () => import('@/components/budget/SalariesTab').then((m) => ({ default: m.SalariesTab })),
  { ssr: false }
);
const HotelsTab = dynamic(
  () => import('@/components/budget/HotelsTab').then((m) => ({ default: m.HotelsTab })),
  { ssr: false }
);
const FlightsTab = dynamic(
  () => import('@/components/budget/FlightsTab').then((m) => ({ default: m.FlightsTab })),
  { ssr: false }
);
const TransportationTab = dynamic(
  () => import('@/components/budget/TransportationTab').then((m) => ({ default: m.TransportationTab })),
  { ssr: false }
);
const ProductionTab = dynamic(
  () => import('@/components/budget/ProductionTab').then((m) => ({ default: m.ProductionTab })),
  { ssr: false }
);
const CommissionsTab = dynamic(
  () => import('@/components/budget/CommissionsTab').then((m) => ({ default: m.CommissionsTab })),
  { ssr: false }
);
const ReceiptsTab = dynamic(
  () => import('@/components/budget/ReceiptsTab').then((m) => ({ default: m.ReceiptsTab })),
  { ssr: false }
);
const SettlementTab = dynamic(
  () => import('@/components/budget/SettlementTab').then((m) => ({ default: m.SettlementTab })),
  { ssr: false }
);

function TabLoader() {
  return (
    <div className="lp-dashboard-glass-card flex items-center gap-2 rounded-xl p-8 text-lp-text-secondary">
      <Loader2 className="h-5 w-5 animate-spin" />
      Loading…
    </div>
  );
}

/**
 * Vertical tab list.
 * - Default: floating card with rounded border/shadow (original right-side rail)
 * - leftRail: flush full-height strip that extends from the sidebar
 */
export function BudgetTabsNav({ tourId, activeTab, leftRail }: { tourId: string; activeTab: string; leftRail?: boolean }) {
  return (
    <nav className="h-full w-full" aria-label="Budget sections">
      <div className={cn(
        'flex h-full flex-col overflow-hidden',
        leftRail
          ? 'bg-transparent'
          : 'rounded-xl border border-lp-border bg-lp-bg shadow-lg transition-shadow duration-200 ease-out hover:shadow-xl hover:shadow-[0_8px_30px_rgba(255,69,0,0.04)]'
      )}>
        <ul className="flex flex-1 flex-col justify-center gap-5 py-6 text-[13px] font-medium">
          {BUDGET_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <li key={tab.id} className="flex shrink-0">
                <Link
                  href={`/budget?tour_id=${tourId}&view=detail&tab=${tab.id}`}
                  className={cn(
                    'mx-auto flex w-[40px] flex-shrink-0 items-center justify-center gap-1 rounded-lg px-0 py-2 text-sm transition-[width,padding,margin,background-color,color] duration-300 ease-out group-hover/nav:mx-1 group-hover/nav:w-[calc(100%-8px)] group-hover/nav:justify-start group-hover/nav:gap-3 group-hover/nav:px-3',
                    isActive
                      ? 'border border-lp-orange bg-lp-orange text-lp-bg shadow-[0_0_0_1px_rgba(249,80,2,0.14)]'
                      : 'text-lp-text-tertiary hover:bg-lp-surface-hover hover:text-lp-text'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-xs',
                      isActive ? 'bg-lp-bg text-lp-orange' : 'bg-lp-bg-tertiary/40 text-lp-text-tertiary'
                    )}
                  >
                    <BudgetTabIcon tabId={tab.id as TabId} className="h-4 w-4" />
                  </span>
                  <span className="max-w-0 overflow-hidden whitespace-nowrap text-xs font-medium opacity-0 transition-[max-width,opacity] duration-300 ease-out group-hover/nav:max-w-[200px] group-hover/nav:opacity-100">
                    {tab.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

export function BudgetTabs({
  tourId,
  activeTab,
  summaryBreakdownHeading,
  summarySlot,
}: {
  tourId: string;
  activeTab: string;
  /** When 'outside', Summary tab omits the Breakdown heading (page renders it in line with Select Tour) */
  summaryBreakdownHeading?: 'inline' | 'outside';
  /** When 'left' or 'right', Summary tab renders only that column (for split layout with Breakdown at top) */
  summarySlot?: 'left' | 'right';
}) {
  const tabContent = () => {
    switch (activeTab) {
      case 'summary':
        return (
          <SummaryTab
            tourId={tourId}
            breakdownHeading={summaryBreakdownHeading ?? 'inline'}
            slot={summarySlot}
          />
        );
      case 'income': return <IncomeTab tourId={tourId} />;
      case 'salaries': return <SalariesTab tourId={tourId} />;
      case 'hotels': return <HotelsTab tourId={tourId} />;
      case 'flights': return <FlightsTab tourId={tourId} />;
      case 'transport': return <TransportationTab tourId={tourId} />;
      case 'production': return <ProductionTab tourId={tourId} />;
      case 'commissions': return <CommissionsTab tourId={tourId} />;
      case 'receipts': return <ReceiptsTab tourId={tourId} />;
      case 'settlement': return <SettlementTab tourId={tourId} />;
      default: return null;
    }
  };

  return (
    <Suspense fallback={<TabLoader />}>
      {tabContent()}
    </Suspense>
  );
}

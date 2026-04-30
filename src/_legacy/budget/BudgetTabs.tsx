'use client';

import Link from 'next/link';
import React from 'react';
import { cn } from '@/lib/utils';
import { BUDGET_TABS, type TabId } from './budget-tabs';
import { BudgetTabIcon } from './budget-tab-icons';
// Phase C of the budget redesign moved these tabs to _legacy/. Static
// imports replace next/dynamic — React 19's generic inference drops
// prop types through dynamic()'s loader, and code-splitting is a moot
// optimisation for the legacy quarantine surface.
import { SummaryTab } from '@/_legacy/budget/SummaryTab';
import { IncomeTab } from '@/_legacy/budget/IncomeTab';
import { SalariesTab } from '@/_legacy/budget/SalariesTab';
import { HotelsTab } from '@/_legacy/budget/HotelsTab';
import { FlightsTab } from '@/_legacy/budget/FlightsTab';
import { TransportationTab } from '@/_legacy/budget/TransportationTab';
import { ProductionTab } from '@/_legacy/budget/ProductionTab';
import { CommissionsTab } from '@/_legacy/budget/CommissionsTab';
import { ReceiptsTab } from '@/_legacy/budget/ReceiptsTab';
import { SettlementTab } from '@/_legacy/budget/SettlementTab';

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
  currency = 'GBP',
  summaryBreakdownHeading,
  summarySlot,
}: {
  tourId: string;
  activeTab: string;
  /** Tour currency (e.g. from budget shell); used by tabs that show amounts. */
  currency?: string;
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
            currency={currency}
            breakdownHeading={summaryBreakdownHeading ?? 'inline'}
            slot={summarySlot}
          />
        );
      case 'income': return <IncomeTab tourId={tourId} />;
      case 'salaries': return <SalariesTab tourId={tourId} currency={currency} />;
      case 'hotels': return <HotelsTab tourId={tourId} />;
      case 'flights': return <FlightsTab tourId={tourId} />;
      case 'transport': return <TransportationTab tourId={tourId} />;
      case 'production': return <ProductionTab tourId={tourId} />;
      case 'commissions': return <CommissionsTab tourId={tourId} />;
      case 'receipts': return <ReceiptsTab tourId={tourId} />;
      case 'settlement': return <SettlementTab tourId={tourId} currency={currency} />;
      default: return null;
    }
  };

  return <>{tabContent()}</>;
}

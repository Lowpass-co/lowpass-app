'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { BUDGET_TABS } from './budget-tabs';

/**
 * Minimal budget section nav: text + underline (active: orange; hover: bright text + subtle line).
 */
export function BudgetFolderTabsNav({ tourId, activeTab }: { tourId: string; activeTab: string }) {
  return (
    <nav className="w-full min-w-0" aria-label="Budget folder tabs">
      <ul className="flex flex-wrap items-end gap-x-6 gap-y-1 border-b border-lp-border/50 sm:gap-x-9">
        {BUDGET_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <li key={tab.id} className="shrink-0">
              <Link
                href={`/budget?tour_id=${tourId}&view=detail&tab=${tab.id}`}
                title={tab.label}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'inline-block border-b-2 pb-2.5 text-[15px] font-medium leading-snug tracking-tight transition-[color,border-color] duration-150 ease-out',
                  '-mb-px',
                  isActive
                    ? 'border-lp-orange font-semibold text-lp-orange'
                    : [
                        'border-transparent text-lp-text-secondary',
                        'hover:border-lp-border hover:text-lp-text dark:hover:border-white/35',
                        'focus-visible:outline-none focus-visible:border-lp-border focus-visible:text-lp-text dark:focus-visible:border-white/35',
                      ]
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

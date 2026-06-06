/* ============================================
   LOWPASS — Budget · Tab nav (Phase 3 §C.1)

   Five-tab nav at the top of the budget product, between the stats
   strip and the page content.

   Tab routing uses ?tab=… (no replace, scroll preserved). Default
   tab is Budget — empty / unknown ?tab= lands there. Every tab sets
   ?tab= explicitly. The active link picks up the brand-orange underline.
   ============================================ */

'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  type BudgetTab,
  resolveBudgetTab,
} from './budget-tab-utils';
import { BudgetDensityToggle } from './BudgetDensityToggle';

// Hotfix 3 §1 — type + helper moved to budget-tab-utils.ts (no
// 'use client') so the per-tour server page can call them without
// crossing the server→client boundary. Re-exported here for any
// existing client-side imports that read them off this module.
export { type BudgetTab, resolveBudgetTab };

/* Budget Phase A §A2 — Actuals tab removed. Proposed / Actual /
   Variance render side-by-side per row on the Budget tab grid. */
const TABS: ReadonlyArray<{ id: BudgetTab; label: string }> = [
  { id: 'summary', label: 'Summary' },
  { id: 'budget', label: 'Budget' },
  { id: 'income', label: 'Income' },
  { id: 'reports', label: 'Reports' },
  { id: 'settings', label: 'Settings' },
];

interface BudgetTabNavProps {
  active: BudgetTab;
}

export function BudgetTabNav({ active }: BudgetTabNavProps) {
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();

  function hrefFor(tab: BudgetTab): string {
    const params = new URLSearchParams(searchParams);
    // Budget is the default tab now, so every tab — including Summary —
    // must set ?tab= explicitly; otherwise the Summary link (no param)
    // falls through to Budget.
    params.set('tab', tab);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <nav
      className="flex items-end gap-1 border-b px-4"
      style={{
        borderColor: 'var(--lp-border-strong)',
        background: 'var(--lp-bg)',
      }}
      aria-label="Budget tabs"
    >
      <div className="flex flex-1 items-end gap-1">
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={hrefFor(tab.id)}
            scroll={false}
            className={cn('btn-transition relative px-3 py-2.5')}
            style={{
              fontSize: '13px',
              fontWeight: isActive ? 600 : 500,
              color: isActive ? 'var(--lp-text)' : 'var(--lp-text-secondary)',
            }}
            aria-current={isActive ? 'page' : undefined}
          >
            {tab.label}
            {isActive ? (
              <span
                aria-hidden
                className="absolute left-2 right-2"
                style={{
                  bottom: -1,
                  height: 2,
                  background: 'var(--color-lp-orange)',
                  borderRadius: 1,
                }}
              />
            ) : null}
          </Link>
        );
      })}
      </div>
      {/* §B4.2 — density toggle at the far right of the tab
          row. Outside the flex-1 container so it stays
          pinned right while tabs flow left. */}
      <div className="pb-1.5">
        <BudgetDensityToggle />
      </div>
    </nav>
  );
}

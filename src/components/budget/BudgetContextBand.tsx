'use client';

/* ============================================
   LOWPASS — <BudgetContextBand> (Fix 3 — collapse the budget top)

   ONE context band that merges the old tour-identity header + the
   Summary/Expenses/Income sub-bar into a single row, so the tabs sit WITH
   the budget and a whole stacked layer disappears. Left → right:

     [avatar · artist · tour]   [Summary · Expenses · Income]   … [Reports]
     [Settings]   [display-currency + Export]

   Routing is unchanged (?tab=…). Sticky so the tabs + actions stay put
   while the grid scrolls. Token-clean.
   ============================================ */

import { usePathname, useSearchParams } from 'next/navigation';
import { isShelledPath } from '@/lib/nav/ia';
import { ProductSubBar } from '@/components/shell-v2/ProductSubBar';
import { BudgetExportControls } from '@/components/budget/BudgetExportControls';
import { AppDensityToggle } from '@/lib/density/appDensity';
import { resolveBudgetTab, type BudgetTab } from './budget-tab-utils';
import { VersionSelector } from './versioning/VersionSelector';
import type { BudgetVersionVm } from './versioning/versionApi';
import type { BudgetLineItem } from '@/types';

interface BudgetContextBandProps {
  tourCurrency: string;
  lines: BudgetLineItem[];
  tourId: string;
  versions: BudgetVersionVm[];
  viewedVersionId: string | null;
  canApprove: boolean;
  /** RQ-6 — receipts still needing fields; drives the Receipts tab badge. */
  needsDetailsCount?: number;
}

export function BudgetContextBand({
  tourCurrency,
  tourId,
  versions,
  viewedVersionId,
  canApprove,
  needsDetailsCount = 0,
}: BudgetContextBandProps) {
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const active = resolveBudgetTab(searchParams.get('tab') ?? undefined);

  /* S-2b — on the canonical shell the Money RAIL carries Summary / Expenses /
     Income / Receipts / Reports, so these tabs would be a second nav saying the
     same thing. The band keeps its actions — version selector, density, export
     — because nothing else offers those; only the duplicated navigation goes.

     Asked of ia.ts rather than passed down as a prop, so the band can't get out
     of step with what is actually mounted. */
  const shelled = isShelledPath(pathname, `?${searchParams.toString()}`);

  const hrefFor = (tab: BudgetTab): string => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', tab);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  return (
    <div className="sticky top-0 z-30">
      <ProductSubBar
        ariaLabel="Budget tabs"
        scroll={false}
        /* G1-B #16 — the artist/tour identity is already shown by the persistent
           header switcher pills (ProductHeader → ArtistTourSwitcher); the second
           TourIdentityChip here was a duplicate picker. Removed — leftSlot keeps
           only the version selector. */
        leftSlot={
          <div className="flex items-center gap-3">
            <VersionSelector tourId={tourId} versions={versions} viewedVersionId={viewedVersionId} canApprove={canApprove} />
          </div>
        }
        /* Phase 0 — SUMMARY | EXPENSES | INCOME | SETTINGS as four equal tabs.
           Reports retired (export lives in rightSlot); Settings moved out of the
           corner into the main row, plain (no icon) to match the content tabs. */
        items={shelled ? [] : [
          { key: 'summary', label: 'Summary', href: hrefFor('summary'), active: active === 'summary' },
          { key: 'budget', label: 'Expenses', href: hrefFor('budget'), active: active === 'budget' },
          { key: 'income', label: 'Income', href: hrefFor('income'), active: active === 'income' },
          /* RQ-6 — the badge counts ONLY needs-details receipts: work the user
             has to do. Proposed is queued and Filed is done, so badging those
             would make the number meaningless. */
          {
            key: 'receipts',
            label: needsDetailsCount > 0 ? `Receipts (${needsDetailsCount})` : 'Receipts',
            href: hrefFor('receipts'),
            active: active === 'receipts',
          },
          /* S-2c — "Reports & workbook", not "Settings": Adam's call, and the
             right one — the old name described where the code lived, not what
             was behind the link. The ?tab= VALUE stays `settings` so nobody's
             bookmark breaks over a rename. */
          { key: 'settings', label: 'Reports & workbook', href: hrefFor('settings'), active: active === 'settings' },
        ]}
        rightSlot={
          <div className="flex items-center gap-2">
            {/* App-wide density toggle, re-mounted here (orphaned when
                BudgetTabNav/BudgetSubBar were retired and the budget bars
                collapsed into this band). Drives the same `lowpass:density`
                preference every grid reads via useAppDensity. */}
            <AppDensityToggle />
            <BudgetExportControls tourCurrency={tourCurrency} tourId={tourId} />
          </div>
        }
      />
    </div>
  );
}

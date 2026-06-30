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
import { ProductSubBar } from '@/components/shell-v2/ProductSubBar';
import { TourIdentityChip } from '@/components/shell-v2/TourIdentityChip';
import { BudgetExportControls } from '@/components/budget/BudgetExportControls';
import { AppDensityToggle } from '@/lib/density/appDensity';
import { resolveBudgetTab, type BudgetTab } from './budget-tab-utils';
import { VersionSelector } from './versioning/VersionSelector';
import type { BudgetVersionVm } from './versioning/versionApi';
import type { BudgetLineItem } from '@/types';

interface BudgetContextBandProps {
  artistName: string | null;
  artistLogoUrl: string | null;
  tourName: string;
  tourCurrency: string;
  lines: BudgetLineItem[];
  tourId: string;
  versions: BudgetVersionVm[];
  viewedVersionId: string | null;
}

export function BudgetContextBand({
  artistName,
  artistLogoUrl,
  tourName,
  tourCurrency,
  tourId,
  versions,
  viewedVersionId,
}: BudgetContextBandProps) {
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const active = resolveBudgetTab(searchParams.get('tab') ?? undefined);

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
        leftSlot={
          <div className="flex items-center gap-3">
            <TourIdentityChip
              artistName={artistName}
              artistLogoUrl={artistLogoUrl}
              tourName={tourName}
            />
            <VersionSelector tourId={tourId} versions={versions} viewedVersionId={viewedVersionId} />
          </div>
        }
        /* Phase 0 — SUMMARY | EXPENSES | INCOME | SETTINGS as four equal tabs.
           Reports retired (export lives in rightSlot); Settings moved out of the
           corner into the main row, plain (no icon) to match the content tabs. */
        items={[
          { key: 'summary', label: 'Summary', href: hrefFor('summary'), active: active === 'summary' },
          { key: 'budget', label: 'Expenses', href: hrefFor('budget'), active: active === 'budget' },
          { key: 'income', label: 'Income', href: hrefFor('income'), active: active === 'income' },
          { key: 'settings', label: 'Settings', href: hrefFor('settings'), active: active === 'settings' },
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

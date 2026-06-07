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
import { BarChart3, Settings } from 'lucide-react';
import { ProductSubBar } from '@/components/shell-v2/ProductSubBar';
import { TourIdentityChip } from '@/components/shell-v2/TourIdentityChip';
import { BudgetExportControls } from '@/components/budget/BudgetExportControls';
import { AppDensityToggle } from '@/lib/density/appDensity';
import { resolveBudgetTab, type BudgetTab } from './budget-tab-utils';
import type { BudgetLineItem } from '@/types';

interface BudgetContextBandProps {
  artistName: string | null;
  artistLogoUrl: string | null;
  tourName: string;
  tourCurrency: string;
  lines: BudgetLineItem[];
}

export function BudgetContextBand({
  artistName,
  artistLogoUrl,
  tourName,
  tourCurrency,
  lines,
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
          <TourIdentityChip
            artistName={artistName}
            artistLogoUrl={artistLogoUrl}
            tourName={tourName}
          />
        }
        items={[
          { key: 'summary', label: 'Summary', href: hrefFor('summary'), active: active === 'summary' },
          { key: 'budget', label: 'Expenses', href: hrefFor('budget'), active: active === 'budget' },
          { key: 'income', label: 'Income', href: hrefFor('income'), active: active === 'income' },
        ]}
        cornerItems={[
          { key: 'reports', label: 'Reports', href: hrefFor('reports'), active: active === 'reports', Icon: BarChart3, scroll: false },
          { key: 'settings', label: 'Settings', href: hrefFor('settings'), active: active === 'settings', Icon: Settings, scroll: false },
        ]}
        rightSlot={
          <div className="flex items-center gap-2">
            {/* Density scaler re-mounted here (regressed when the budget
                bars collapsed into this band). */}
            <AppDensityToggle />
            <BudgetExportControls lines={lines} tourCurrency={tourCurrency} tourName={tourName} />
          </div>
        }
      />
    </div>
  );
}

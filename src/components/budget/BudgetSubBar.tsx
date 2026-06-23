'use client';

/* ============================================
   LOWPASS — <BudgetSubBar> (two-bar shell, Budget Bar 2)

   Budget's sub-tab strip, rendered in ProductShell's Bar-2 slot. Routing
   is unchanged (?tab=…). Per the two-bar IA:
     - Equal tabs: Summary · Expenses · Income.
     - Corner icons (right-aligned, not equal tabs): Reports · Settings.
     - Density toggle pinned far right.
   "Expenses" is the old "Budget" tab (?tab=budget) renamed; routing value
   is unchanged.
   ============================================ */

import { usePathname, useSearchParams } from 'next/navigation';
import { Settings } from 'lucide-react';
import { ProductSubBar } from '@/components/shell-v2/ProductSubBar';
import { BudgetDensityToggle } from './BudgetDensityToggle';
import { resolveBudgetTab, type BudgetTab } from './budget-tab-utils';

export function BudgetSubBar() {
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
    <ProductSubBar
      ariaLabel="Budget tabs"
      scroll={false}
      items={[
        { key: 'summary', label: 'Summary', href: hrefFor('summary'), active: active === 'summary' },
        { key: 'budget', label: 'Expenses', href: hrefFor('budget'), active: active === 'budget' },
        { key: 'income', label: 'Income', href: hrefFor('income'), active: active === 'income' },
      ]}
      cornerItems={[
        {
          key: 'settings',
          label: 'Settings',
          href: hrefFor('settings'),
          active: active === 'settings',
          Icon: Settings,
          scroll: false,
        },
      ]}
      rightSlot={<BudgetDensityToggle />}
    />
  );
}

'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { IncomeGrid } from './IncomeGrid';
import { HotelsGrid } from './HotelsGrid';
import { FlightsGrid } from './FlightsGrid';
import { TransportGrid } from './TransportGrid';
import { ProductionGrid } from './ProductionGrid';
import { ReceiptsGrid } from './ReceiptsGrid';
import { CommissionsGrid } from './CommissionsGrid';
import type { SheetTab } from '@/app/(app)/tours/[id]/sheet/page';

const TABS: { id: SheetTab; label: string }[] = [
  { id: 'income', label: 'Routing & Income' },
  { id: 'hotels', label: 'Hotels' },
  { id: 'flights', label: 'Flights' },
  { id: 'transport', label: 'Transport' },
  { id: 'production', label: 'Production' },
  { id: 'receipts', label: 'Receipts' },
  { id: 'commissions', label: 'Commissions' },
];

interface SpreadsheetViewProps {
  tourId: string;
  tourName: string;
  currency: string;
  defaultTab: SheetTab;
}

export function SpreadsheetView({ tourId, tourName, currency, defaultTab }: SpreadsheetViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabFromUrl = (searchParams.get('tab') as SheetTab) || defaultTab;
  const activeTab = TABS.some((t) => t.id === tabFromUrl) ? tabFromUrl : defaultTab;

  const setTab = useCallback(
    (tab: SheetTab) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.set('tab', tab);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-lp-text">{tourName} — Spreadsheet</h1>
      </div>

      <nav className="flex flex-wrap gap-0 border-b border-lp-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'text-xs font-semibold uppercase tracking-wider px-3 py-2 transition-colors',
              activeTab === t.id
                ? 'border-b-2 border-lp-orange text-lp-orange'
                : 'text-lp-text-secondary hover:text-lp-text'
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="min-h-[400px]">
        {activeTab === 'income' && (
          <IncomeGrid tourId={tourId} currency={currency} />
        )}
        {activeTab === 'hotels' && (
          <HotelsGrid tourId={tourId} currency={currency} />
        )}
        {activeTab === 'flights' && (
          <FlightsGrid tourId={tourId} currency={currency} />
        )}
        {activeTab === 'transport' && (
          <TransportGrid tourId={tourId} currency={currency} />
        )}
        {activeTab === 'production' && (
          <ProductionGrid tourId={tourId} currency={currency} />
        )}
        {activeTab === 'receipts' && (
          <ReceiptsGrid tourId={tourId} currency={currency} />
        )}
        {activeTab === 'commissions' && (
          <CommissionsGrid tourId={tourId} currency={currency} />
        )}
      </div>
    </div>
  );
}

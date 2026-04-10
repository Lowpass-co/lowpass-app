'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { BudgetFolderTabsNav } from '@/components/budget/BudgetFolderTabsNav';
import { BUDGET_CURRENCY_OPTIONS } from '@/lib/budget-currency';
import { StyledSelect, type StyledSelectOption } from '@/components/ui/StyledSelect';
import { IncomeGrid } from '@/components/spreadsheet-view/IncomeGrid';
import { HotelsGrid } from '@/components/spreadsheet-view/HotelsGrid';
import { FlightsGrid } from '@/components/spreadsheet-view/FlightsGrid';
import { TransportGrid } from '@/components/spreadsheet-view/TransportGrid';
import { ProductionGrid } from '@/components/spreadsheet-view/ProductionGrid';
import { ReceiptsGrid } from '@/components/spreadsheet-view/ReceiptsGrid';
import { CommissionsGrid } from '@/components/spreadsheet-view/CommissionsGrid';
import type { TabId } from '@/components/budget/budget-tabs';

const SummaryTab = dynamic(
  () => import('@/components/budget/SummaryTab').then((m) => ({ default: m.SummaryTab })),
  { ssr: false, loading: () => <TabLoading label="Summary" /> }
);
const SalariesTab = dynamic(
  () => import('@/components/budget/SalariesTab').then((m) => ({ default: m.SalariesTab })),
  { ssr: false, loading: () => <TabLoading label="Salaries" /> }
);
const SettlementTab = dynamic(
  () => import('@/components/budget/SettlementTab').then((m) => ({ default: m.SettlementTab })),
  { ssr: false, loading: () => <TabLoading label="Settlement" /> }
);

function TabLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-lp-border bg-lp-surface px-6 py-10 text-sm text-lp-text-secondary">
      <Loader2 className="h-5 w-5 animate-spin shrink-0" />
      Loading {label}…
    </div>
  );
}

const CURRENCY_SELECT_OPTIONS: StyledSelectOption<string>[] = BUDGET_CURRENCY_OPTIONS.map((o) => ({
  value: o.code,
  label: o.label,
}));

export function BudgetDetailShell({ tourId, activeTab }: { tourId: string; activeTab: TabId }) {
  const [tourName, setTourName] = useState('');
  const [currency, setCurrency] = useState('GBP');
  const [loadingTour, setLoadingTour] = useState(true);
  const [savingCurrency, setSavingCurrency] = useState(false);

  const loadTour = useCallback(async () => {
    setLoadingTour(true);
    try {
      const res = await fetch(`/api/tours/${tourId}`);
      if (!res.ok) return;
      const t = await res.json();
      setTourName(typeof t.name === 'string' ? t.name : 'Tour');
      const c = typeof t.currency === 'string' && t.currency.trim() ? t.currency.trim().toUpperCase() : 'GBP';
      setCurrency(c);
    } finally {
      setLoadingTour(false);
    }
  }, [tourId]);

  useEffect(() => {
    void loadTour();
  }, [loadTour]);

  const onCurrencyChange = async (code: string) => {
    const next = code.toUpperCase();
    setCurrency(next);
    setSavingCurrency(true);
    try {
      await fetch(`/api/tours/${tourId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currency: next }),
      });
    } catch {
      void loadTour();
    } finally {
      setSavingCurrency(false);
    }
  };

  const sheet = { tourId, currency };

  const main = () => {
    switch (activeTab) {
      case 'summary':
        return <SummaryTab tourId={tourId} currency={currency} />;
      case 'income':
        return <IncomeGrid {...sheet} />;
      case 'salaries':
        return (
          <div className="space-y-3">
            <p className="text-[11px] text-lp-text-secondary">
              Day grid and rates use tour currency <span className="font-semibold text-lp-text">{currency}</span>.
            </p>
            <SalariesTab tourId={tourId} />
          </div>
        );
      case 'hotels':
        return <HotelsGrid {...sheet} />;
      case 'flights':
        return <FlightsGrid {...sheet} />;
      case 'transport':
        return <TransportGrid {...sheet} />;
      case 'production':
        return <ProductionGrid {...sheet} />;
      case 'commissions':
        return <CommissionsGrid {...sheet} />;
      case 'receipts':
        return <ReceiptsGrid {...sheet} />;
      case 'settlement':
        return <SettlementTab tourId={tourId} currency={currency} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className="shrink-0 border-b border-lp-border/70 px-4 py-3 sm:px-6"
        style={{ background: 'var(--lp-dashboard-bg)' }}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
            <Link
              href={`/budget?tour_id=${tourId}&view=overview`}
              className="text-[11px] text-lp-text-tertiary transition-colors hover:text-lp-orange"
            >
              ← Budget overview
            </Link>
            <div className="hidden h-4 w-px bg-lp-border sm:block" aria-hidden />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold text-lp-text">
                {loadingTour ? '…' : tourName}
              </h1>
              <p className="text-[10px] text-lp-text-tertiary">
                Spreadsheet-style budget · click cells to edit · all figures in tour currency unless noted
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <label className="text-[10px] font-bold uppercase tracking-wider text-lp-table-header-text whitespace-nowrap">
              Tour currency
            </label>
            <div className="flex items-center gap-2">
              <StyledSelect
                value={currency}
                onChange={(v) => void onCurrencyChange(v || 'GBP')}
                options={CURRENCY_SELECT_OPTIONS}
                placeholder="Currency"
                className="min-w-[11rem]"
              />
              {savingCurrency ? <Loader2 className="h-4 w-4 animate-spin text-lp-orange" aria-label="Saving" /> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 px-4 pt-3 sm:px-6" style={{ background: 'var(--lp-dashboard-bg)' }}>
        <BudgetFolderTabsNav tourId={tourId} activeTab={activeTab} />
      </div>

      <div className="lp-budget min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6 sm:py-5">{main()}</div>
    </div>
  );
}

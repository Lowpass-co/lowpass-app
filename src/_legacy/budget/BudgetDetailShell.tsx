'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { BudgetFolderTabsNav } from '@/_legacy/budget/BudgetFolderTabsNav';
import { BUDGET_CURRENCY_OPTIONS } from '@/lib/budget-currency';
import { StyledSelect, type StyledSelectOption } from '@/components/ui/StyledSelect';
import { HotelsGrid } from '@/components/spreadsheet-view/HotelsGrid';
import { FlightsGrid } from '@/components/spreadsheet-view/FlightsGrid';
import { TransportGrid } from '@/components/spreadsheet-view/TransportGrid';
import { ProductionGrid } from '@/components/spreadsheet-view/ProductionGrid';
import { ReceiptsGrid } from '@/components/spreadsheet-view/ReceiptsGrid';
import { CommissionsGrid } from '@/components/spreadsheet-view/CommissionsGrid';
// Phase C of the budget redesign moved these tabs to _legacy/. Static
// imports replace next/dynamic — React 19's generic inference drops
// prop types through dynamic()'s loader, and code-splitting is a moot
// optimisation for the legacy quarantine surface.
import { SummaryTab } from '@/_legacy/budget/SummaryTab';
import { IncomeTab } from '@/_legacy/budget/IncomeTab';
import { SalariesTab } from '@/_legacy/budget/SalariesTab';
import { SettlementTab } from '@/_legacy/budget/SettlementTab';
import type { TabId } from '@/_legacy/budget/budget-tabs';

const CURRENCY_SELECT_OPTIONS: StyledSelectOption<string>[] = BUDGET_CURRENCY_OPTIONS.map((o) => ({
  value: o.code,
  label: o.label,
}));

export function BudgetDetailShell({ tourId, activeTab }: { tourId: string; activeTab: TabId }) {
  const [currency, setCurrency] = useState('GBP');
  const [loadingTour, setLoadingTour] = useState(true);
  const [savingCurrency, setSavingCurrency] = useState(false);

  const loadTour = useCallback(async () => {
    setLoadingTour(true);
    try {
      const res = await fetch(`/api/tours/${tourId}`);
      if (!res.ok) return;
      const t = await res.json();
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
        return <IncomeTab tourId={tourId} />;
      case 'salaries':
        return <SalariesTab tourId={tourId} currency={currency} />;
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
          <div className="flex items-center gap-3">
            <div className="shrink-0">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-lp-table-header-text">
                View Style
              </p>
              <div className="relative flex w-[14.5rem] rounded-xl border border-[var(--lp-sidebar-border)] p-1">
                <span
                  className="absolute bottom-1 top-1 w-[calc(50%-6px)] rounded-lg bg-lp-orange transition-[left,opacity] duration-200"
                  style={{ left: 'calc(50% + 2px)', opacity: 1 }}
                />
                <a
                  href={`/budget?tour_id=${tourId}&view=overview`}
                  className="lp-label-caps relative z-10 flex flex-1 items-center justify-center rounded-md py-2 text-[11px] text-[var(--lp-sidebar-text-muted)] transition-colors"
                >
                  Overview
                </a>
                <a
                  href={`/budget?tour_id=${tourId}&view=detail&tab=${activeTab}`}
                  className="lp-label-caps relative z-10 flex flex-1 items-center justify-center rounded-md py-2 text-[11px] text-white transition-colors"
                >
                  Spreadsheet
                </a>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <label className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-lp-table-header-text">
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

      <div
        className={
          activeTab === 'income'
            ? 'lp-budget flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4 sm:px-6 sm:py-5'
            : 'lp-budget min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6 sm:py-5'
        }
      >
        {main()}
      </div>
    </div>
  );
}

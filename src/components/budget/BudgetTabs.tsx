'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BUDGET_TABS } from './budget-tabs';

const SummaryTab = dynamic(() => import('@/components/budget/SummaryTab').then(m => ({ default: m.SummaryTab })), { ssr: false });
const IncomeTab = dynamic(() => import('@/components/budget/IncomeTab').then(m => ({ default: m.IncomeTab })), { ssr: false });
const SalariesTab = dynamic(() => import('@/components/budget/SalariesTab').then(m => ({ default: m.SalariesTab })), { ssr: false });
const PayrollTab = dynamic(() => import('@/components/budget/PayrollTab').then(m => ({ default: m.PayrollTab })), { ssr: false });
const HotelsTab = dynamic(() => import('@/components/budget/HotelsTab').then(m => ({ default: m.HotelsTab })), { ssr: false });
const FlightsTab = dynamic(() => import('@/components/budget/FlightsTab').then(m => ({ default: m.FlightsTab })), { ssr: false });
const TransportationTab = dynamic(() => import('@/components/budget/TransportationTab').then(m => ({ default: m.TransportationTab })), { ssr: false });
const ProductionTab = dynamic(() => import('@/components/budget/ProductionTab').then(m => ({ default: m.ProductionTab })), { ssr: false });
const CommissionsTab = dynamic(() => import('@/components/budget/CommissionsTab').then(m => ({ default: m.CommissionsTab })), { ssr: false });
const ReceiptsTab = dynamic(() => import('@/components/budget/ReceiptsTab').then(m => ({ default: m.ReceiptsTab })), { ssr: false });
const SettlementTab = dynamic(() => import('@/components/budget/SettlementTab').then(m => ({ default: m.SettlementTab })), { ssr: false });

function TabLoader() {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-lp-border bg-lp-surface p-8 text-lp-text-secondary">
      <Loader2 className="h-5 w-5 animate-spin" />
      Loading…
    </div>
  );
}

export function BudgetTabs({ tourId, activeTab }: { tourId: string; activeTab: string }) {
  const tabContent = () => {
    switch (activeTab) {
      case 'summary': return <SummaryTab tourId={tourId} />;
      case 'income': return <IncomeTab tourId={tourId} />;
      case 'salaries': return <SalariesTab tourId={tourId} />;
      case 'payroll': return <PayrollTab tourId={tourId} />;
      case 'hotels': return <HotelsTab tourId={tourId} />;
      case 'flights': return <FlightsTab tourId={tourId} />;
      case 'transport': return <TransportationTab tourId={tourId} />;
      case 'production': return <ProductionTab tourId={tourId} />;
      case 'commissions': return <CommissionsTab tourId={tourId} />;
      case 'receipts': return <ReceiptsTab tourId={tourId} />;
      case 'settlement': return <SettlementTab tourId={tourId} />;
      default: return null;
    }
  };

  return (
    <>
      <nav className="flex gap-0 overflow-x-auto border-b border-lp-border" aria-label="Budget sections">
        {BUDGET_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <Link
              key={tab.id}
              href={`/budget?tour_id=${tourId}&tab=${tab.id}`}
              className={cn(
                'shrink-0 px-4 py-3 text-[11px] font-semibold tracking-widest uppercase transition-colors border-b-2',
                isActive
                  ? 'border-lp-orange text-white'
                  : 'border-transparent text-lp-text-tertiary hover:text-lp-text-secondary hover:border-lp-border'
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <Suspense fallback={<TabLoader />}>
        <div className="mt-4">
          {tabContent()}
        </div>
      </Suspense>
    </>
  );
}

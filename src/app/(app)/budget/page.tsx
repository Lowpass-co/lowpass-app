/* ============================================
   LOWPASS — Budget Page

   Tour selector + tab navigation (Summary, Income, Salaries, etc.).
   Uses dynamic imports so only the active tab's code is loaded.
   ============================================ */

import Link from 'next/link';
import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { BudgetTourSelector } from '@/components/budget/BudgetTourSelector';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ---------- lazy-loaded tab components ---------- */
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

const BUDGET_TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'income', label: 'Routing & Income' },
  { id: 'salaries', label: 'Salaries & Per Diem' },
  { id: 'payroll', label: 'Payroll' },
  { id: 'hotels', label: 'Hotels' },
  { id: 'flights', label: 'Flights' },
  { id: 'transport', label: 'Transportation' },
  { id: 'production', label: 'Production & Misc' },
  { id: 'receipts', label: 'Expense Receipts' },
  { id: 'commissions', label: 'Commissions' },
  { id: 'settlement', label: 'Settlement' },
] as const;

type TabId = (typeof BUDGET_TABS)[number]['id'];

function TabLoader() {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-lp-border bg-lp-surface p-8 text-lp-text-secondary">
      <Loader2 className="h-5 w-5 animate-spin" />
      Loading…
    </div>
  );
}

function BudgetTabs({
  tourId,
  activeTab,
}: {
  tourId: string;
  activeTab: string;
}) {
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
      <nav
        className="flex gap-1 overflow-x-auto border-b border-lp-border pb-px"
        aria-label="Budget sections"
      >
        {BUDGET_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <Link
              key={tab.id}
              href={`/budget?tour_id=${tourId}&tab=${tab.id}`}
              className={cn(
                'shrink-0 rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-lp-surface border border-lp-border border-b-transparent -mb-px text-lp-orange'
                  : 'text-lp-text-secondary hover:text-lp-text hover:bg-lp-surface-hover'
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

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ tour_id?: string; tab?: string }>;
}) {
  const params = await searchParams;
  const tourId = params.tour_id ?? null;
  const tab = (params.tab as TabId) ?? 'summary';
  const validTab = BUDGET_TABS.some((t) => t.id === tab) ? tab : 'summary';

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-lp-text">Budget</h1>
        <p className="mt-1 text-sm text-lp-text-secondary">
          Income, expenses, and P&L by tour.
        </p>
      </div>

      <Suspense fallback={<div className="h-20 rounded-xl border border-lp-border bg-lp-surface animate-pulse" />}>
        <BudgetTourSelector basePath="/budget" defaultTab="summary" />
      </Suspense>

      {tourId ? (
        <BudgetTabs tourId={tourId} activeTab={validTab} />
      ) : (
        <div className="rounded-xl border border-lp-border bg-lp-surface p-8 text-center">
          <p className="text-lp-text-secondary">Select a tour above to view budget.</p>
        </div>
      )}
    </div>
  );
}

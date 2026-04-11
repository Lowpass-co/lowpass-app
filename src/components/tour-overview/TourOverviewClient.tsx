'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { TourHeroBar } from './TourHeroBar';
import { BudgetSummaryCard } from './BudgetSummaryCard';
import { AdvanceSummaryCard } from './AdvanceSummaryCard';
import { SettlementSummaryCard } from './SettlementSummaryCard';
import { PayrollSummaryCard } from './PayrollSummaryCard';
import type { TourOverviewData } from './overview-utils';

const DayViewTab = dynamic(
  () => import('@/components/budget/DayViewTab').then((m) => ({ default: m.DayViewTab })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center gap-2 rounded-xl border border-lp-border bg-lp-surface p-8 text-sm text-lp-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading day view…
      </div>
    ),
  }
);

interface TourOverviewClientProps {
  tourId: string;
  artistName: string;
  tourName: string;
  startDate: string;
  endDate: string;
  status: string;
  currency: string;
  overview: TourOverviewData;
}

export function TourOverviewClient({
  tourId,
  artistName,
  tourName,
  startDate,
  endDate,
  status,
  currency,
  overview,
}: TourOverviewClientProps) {
  const { heroData, budgetData, advanceData, settlementData, payrollData } = overview;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <TourHeroBar
        artistName={artistName}
        tourName={tourName}
        startDate={startDate}
        endDate={endDate}
        status={status}
        heroData={heroData}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <BudgetSummaryCard data={budgetData} currency={currency} />
        <AdvanceSummaryCard data={advanceData} />
        <SettlementSummaryCard data={settlementData} currency={currency} />
      </div>

      <PayrollSummaryCard data={payrollData} currency={currency} />

      <section
        id="day-view"
        className="flex max-h-[min(520px,55vh)] min-h-[280px] flex-col overflow-hidden rounded-xl border border-lp-border bg-lp-surface p-4 shadow-sm"
        aria-labelledby="tour-overview-day-view-heading"
      >
        <h2
          id="tour-overview-day-view-heading"
          className="mb-3 shrink-0 text-[11px] font-semibold uppercase tracking-wider lp-table-header-text"
        >
          Day view
        </h2>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <DayViewTab tourId={tourId} />
        </div>
      </section>
    </div>
  );
}

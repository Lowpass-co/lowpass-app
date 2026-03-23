'use client';

import { TourHeroBar } from './TourHeroBar';
import { BudgetSummaryCard } from './BudgetSummaryCard';
import { AdvanceSummaryCard } from './AdvanceSummaryCard';
import { SettlementSummaryCard } from './SettlementSummaryCard';
import { RoomingSummaryCard } from './RoomingSummaryCard';
import { PayrollSummaryCard } from './PayrollSummaryCard';
import type { TourOverviewData } from './overview-utils';

interface TourOverviewClientProps {
  artistName: string;
  tourName: string;
  startDate: string;
  endDate: string;
  status: string;
  currency: string;
  overview: TourOverviewData;
}

export function TourOverviewClient({
  artistName,
  tourName,
  startDate,
  endDate,
  status,
  currency,
  overview,
}: TourOverviewClientProps) {
  const { heroData, budgetData, advanceData, settlementData, roomingData, payrollData } = overview;

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

      <div className="grid gap-4 md:grid-cols-2">
        <RoomingSummaryCard data={roomingData} />
        <PayrollSummaryCard data={payrollData} currency={currency} />
      </div>
    </div>
  );
}

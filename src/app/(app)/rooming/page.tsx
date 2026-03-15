/* ============================================
   LOWPASS — Rooming Page

   Tour selector + tabs: Master Grid, Per-Hotel Sheets.
   When no tour selected: same landing design as Budget (Select Tour Rooming).
   ============================================ */

import Link from 'next/link';
import { Suspense } from 'react';
import { BudgetTourLanding } from '@/components/budget/BudgetTourLanding';
import { BudgetTourSelector } from '@/components/budget/BudgetTourSelector';
import { cn } from '@/lib/utils';

const ROOMING_STORAGE_KEY = 'lowpass_selected_rooming_tour';
const ROOMING_TABS = [
  { id: 'grid', label: 'Master Grid' },
  { id: 'hotels', label: 'Per-Hotel Sheets' },
] as const;

type TabId = (typeof ROOMING_TABS)[number]['id'];

function TabPlaceholder({ name }: { name: string }) {
  return (
    <div className="rounded-xl border border-lp-border bg-lp-surface p-8 text-center">
      <p className="text-lp-text-secondary">{name} — Coming Soon</p>
    </div>
  );
}

function RoomingTabs({
  tourId,
  activeTab,
}: {
  tourId: string;
  activeTab: string;
}) {
  return (
    <>
      <nav
        className="flex gap-1 border-b border-lp-border pb-px"
        aria-label="Rooming sections"
      >
        {ROOMING_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <Link
              key={tab.id}
              href={`/rooming?tour_id=${tourId}&tab=${tab.id}`}
              className={cn(
                'rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors',
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
      <div className="mt-4">
        <TabPlaceholder name={ROOMING_TABS.find((t) => t.id === activeTab)?.label ?? activeTab} />
      </div>
    </>
  );
}

export default async function RoomingPage({
  searchParams,
}: {
  searchParams: Promise<{ tour_id?: string; tab?: string }>;
}) {
  const params = await searchParams;
  const tourId = params.tour_id ?? null;
  const tab = (params.tab as TabId) ?? 'grid';
  const validTab = ROOMING_TABS.some((t) => t.id === tab) ? tab : 'grid';

  if (!tourId) {
    return (
      <div className="-mx-6 -my-6 flex h-[calc(100vh-4rem)] flex-col">
        <BudgetTourLanding
          title="Select Tour Rooming"
          storageKey={ROOMING_STORAGE_KEY}
          basePath="/rooming"
          defaultTab="grid"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-lp-text">Rooming</h1>
        <p className="mt-1 text-sm text-lp-text-secondary">
          Person × date room matrix and per-hotel details.
        </p>
      </div>

      <Suspense fallback={<div className="h-20 rounded-xl border border-lp-border bg-lp-surface animate-pulse" />}>
        <BudgetTourSelector
          basePath="/rooming"
          defaultTab="grid"
          storageKey={ROOMING_STORAGE_KEY}
        />
      </Suspense>

      <RoomingTabs tourId={tourId} activeTab={validTab} />
    </div>
  );
}

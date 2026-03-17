'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { PayrollSummary } from './PayrollSummary';
import { PayrollWeekSheet } from './PayrollWeekSheet';
import { getWeekStart, formatWeekTabLabel } from './payroll-utils';

interface PayrollViewProps {
  tourId: string;
  tourName: string;
  currency: string;
  routingDates: { id: string; date: string; day_type?: string; venue_name?: string; city?: string }[];
  personnelRates: Record<string, unknown>[];
  payrollEntries: Record<string, unknown>[];
}

export function PayrollView({
  tourId,
  tourName,
  currency,
  routingDates,
  personnelRates,
  payrollEntries,
}: PayrollViewProps) {
  const weekStarts = useMemo(() => {
    const set = new Set<string>();
    for (const r of routingDates) {
      const d = (r.date ?? '').slice(0, 10);
      if (d) set.add(getWeekStart(d));
    }
    return Array.from(set).sort();
  }, [routingDates]);

  const tabs = useMemo(() => {
    const list: { id: string; label: string }[] = [{ id: 'summary', label: 'Summary' }];
    for (const ws of weekStarts) {
      list.push({ id: ws, label: formatWeekTabLabel(ws) });
    }
    return list;
  }, [weekStarts]);

  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? 'summary');

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-lp-text">{tourName} — Payroll</h1>

      <nav className="flex flex-wrap gap-0 border-b border-lp-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
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

      <div className="min-h-[300px]">
        {activeTab === 'summary' && (
          <PayrollSummary
            tourId={tourId}
            currency={currency}
            personnelRates={personnelRates}
            routingDates={routingDates}
            payrollEntries={payrollEntries}
          />
        )}
        {activeTab !== 'summary' && weekStarts.includes(activeTab) && (
          <PayrollWeekSheet
            tourId={tourId}
            weekStart={activeTab}
            personnelRates={personnelRates}
            routingDates={routingDates}
            payrollEntries={payrollEntries}
          />
        )}
      </div>
    </div>
  );
}

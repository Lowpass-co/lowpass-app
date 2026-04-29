'use client';

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { formatDayCardDate, formatCurrency } from '@/lib/utils';
import { DayAdvancePanel } from './DayAdvancePanel';
import { DayBudgetPanel } from './DayBudgetPanel';
import { cn } from '@/lib/utils';
import type { Tour } from '@/types';
import type { RoutingDate } from '@/types';
import type { DayType } from '@/types';

interface DayCardProps {
  tour: Tour;
  routingDate: RoutingDate;
  isExpanded: boolean;
  onToggle: () => void;
}

const DAY_TYPE_LABELS: Record<string, string> = {
  show: 'SHOW',
  off: 'OFF',
  travel: 'TRAVEL',
  rehearsal: 'REHEARSAL',
  press: 'PRESS',
  festival: 'FESTIVAL',
  radio: 'RADIO',
  tv: 'TV',
};

function dayTypeDotClass(dayType: DayType): string {
  if (dayType === 'show' || dayType === 'festival') return 'bg-[var(--color-lp-day-show)]';
  if (dayType === 'travel') return 'bg-[var(--color-lp-day-travel)]';
  return 'bg-[var(--color-lp-day-off)]';
}

export function DayCard({ tour, routingDate, isExpanded, onToggle }: DayCardProps) {
  const dateStr = routingDate.date ?? '';
  const dayType = (routingDate.day_type as DayType) ?? 'show';
  const venueLabel = [routingDate.venue_name, routingDate.city].filter(Boolean).join(', ') || '—';

  const [dayIncome, setDayIncome] = useState<number | null>(null);
  const [dayExpenses, setDayExpenses] = useState<number | null>(null);

  const dayPl = useMemo(() => {
    if (dayIncome == null || dayExpenses == null) return null;
    return dayIncome - dayExpenses;
  }, [dayIncome, dayExpenses]);

  const hasIncome = dayType === 'show' || dayType === 'festival';

  return (
    <div
      id={dateStr ? `day-${dateStr}` : undefined}
      className={cn(
        'rounded-lg border border-lp-border transition-colors',
        isExpanded
          ? 'bg-lp-surface/60 backdrop-blur-md rounded-xl p-6'
          : 'bg-lp-surface/80 backdrop-blur-sm px-4 py-3 cursor-pointer hover:bg-lp-surface'
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left flex items-center gap-3"
      >
        <span className="text-lg font-bold text-lp-text shrink-0">
          {formatDayCardDate(dateStr)}
        </span>
        <span
          className={cn(
            'h-2 w-2 shrink-0 rounded-full',
            dayTypeDotClass(dayType)
          )}
          aria-hidden
        />
        <span className="text-xs font-semibold tracking-wider text-lp-text-secondary uppercase shrink-0">
          {DAY_TYPE_LABELS[dayType] ?? dayType.toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-lp-text-secondary">
          {venueLabel}
        </span>
        {hasIncome && (
          <span className="text-sm font-semibold text-lp-text shrink-0">
            {dayIncome != null ? formatCurrency(dayIncome, tour.currency) : '—'}
          </span>
        )}
        <ChevronDown
          className={cn(
            'h-5 w-5 shrink-0 text-lp-text-secondary transition-transform duration-200',
            isExpanded && 'rotate-180'
          )}
        />
      </button>

      {isExpanded && (
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-lp-border/50 bg-lp-surface-hover p-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-lp-text-secondary">
              Advance
            </h3>
            <DayAdvancePanel tourId={tour.id} routingId={routingDate.id} />
          </div>
          <div className="rounded-lg border border-lp-border/50 bg-lp-surface-hover p-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-lp-text-secondary">
              Budget
            </h3>
            <DayBudgetPanel
              tourId={tour.id}
              routingId={routingDate.id}
              routingDate={routingDate}
              currency={tour.currency}
              onIncomeChange={setDayIncome}
              onExpensesChange={setDayExpenses}
            />
          </div>
        </div>
      )}

      {isExpanded && (dayIncome != null || dayExpenses != null) && (
        <div className="mt-4 flex flex-wrap items-center gap-6 rounded-lg bg-lp-surface/40 px-4 py-2 text-sm font-semibold">
          {hasIncome && dayIncome != null && (
            <span className="text-lp-text">
              INCOME: {formatCurrency(dayIncome, tour.currency)}
            </span>
          )}
          {dayExpenses != null && (
            <span className="text-lp-text">
              EXPENSES: {formatCurrency(dayExpenses, tour.currency)}
            </span>
          )}
          {dayPl != null && hasIncome && (
            <span
              className={cn(
                dayPl >= 0 ? 'text-[var(--color-lp-success)]' : 'text-[var(--color-lp-error)]'
              )}
            >
              P&L: {dayPl >= 0 ? '+' : ''}{formatCurrency(dayPl, tour.currency)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

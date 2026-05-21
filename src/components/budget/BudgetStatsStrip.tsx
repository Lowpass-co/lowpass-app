/* ============================================
   LOWPASS — Budget · Stats strip (Phase 3 §B.1)

   Sticky horizontal strip beneath <ProductHeader> showing the
   five top-line numbers: TOTAL BUDGET, COMMITTED, SPENT,
   REMAINING, VARIANCE. Lives ABOVE the §C tab nav so it stays
   visible regardless of which tab the user is on.

   Numbers come from the same `lines` array the rest of the page
   sees, computed client-side so display-currency ?display=USD
   conversions stay live without a server round-trip.

   Definitions (Adam's spec for this surface):
     TOTAL BUDGET = Σ proposed_cost                                (estimated outlay)
     COMMITTED    = Σ proposed_cost  WHERE status ∈
                    {quoted, approved, paid}                       (you said yes)
     SPENT        = Σ actual_cost    WHERE status = paid           (money out)
     REMAINING    = TOTAL − SPENT                                  (cash left)
     VARIANCE     = SPENT − COMMITTED                              (over/under what you said yes to)
   ============================================ */

'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { convertToCurrency } from '@/lib/budget/fx';
import { getEffectiveActual } from '@/lib/budget/transactions';
import type { BudgetLineItem } from '@/types';

interface BudgetStatsStripProps {
  lines: BudgetLineItem[];
  /** Tour's native currency. Display currency comes from ?display=. */
  tourCurrency: string;
}

function formatAbbrev(value: number, currency: string): string {
  const cur = currency.toUpperCase();
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  // Symbol resolution via Intl — falls back to the code if unsupported.
  const sym = (() => {
    try {
      return (0)
        .toLocaleString('en-GB', {
          style: 'currency',
          currency: cur,
          minimumFractionDigits: 0,
        })
        .replace(/[\d.,\s-]/g, '');
    } catch {
      return `${cur} `;
    }
  })();
  if (abs >= 1_000_000) {
    return `${sign}${sym}${(abs / 1_000_000).toFixed(2)}M`;
  }
  if (abs >= 10_000) {
    return `${sign}${sym}${Math.round(abs / 1_000)}K`;
  }
  return `${sign}${sym}${Math.round(abs).toLocaleString('en-GB')}`;
}

const COMMITTED_STATUSES = new Set(['quoted', 'approved', 'paid']);
const SPENT_STATUSES = new Set(['paid']);

export function BudgetStatsStrip({ lines, tourCurrency }: BudgetStatsStripProps) {
  const searchParams = useSearchParams();
  const displayCurrency = (
    searchParams.get('display') ?? tourCurrency
  ).toUpperCase();

  const stats = useMemo(() => {
    let total = 0;
    let committed = 0;
    let spent = 0;
    for (const line of lines) {
      const lineCurrency = (line.currency || tourCurrency).toUpperCase();
      const proposed = convertToCurrency(
        Number(line.proposed_cost ?? 0),
        lineCurrency,
        displayCurrency,
      );
      /* Budget Phase A §A2 — effective actual = sum of transactions
         when present, else actual_cost fallback. */
      const actual = convertToCurrency(
        getEffectiveActual(line),
        lineCurrency,
        displayCurrency,
      );
      total += proposed;
      const status = (line.status ?? '').toLowerCase();
      if (COMMITTED_STATUSES.has(status)) committed += proposed;
      if (SPENT_STATUSES.has(status)) spent += actual;
    }
    const remaining = total - spent;
    const variance = spent - committed;
    return { total, committed, spent, remaining, variance };
  }, [lines, tourCurrency, displayCurrency]);

  return (
    <div
      className="lp-budget-stats-strip sticky z-10 flex flex-wrap items-center gap-x-8 gap-y-1 border-b px-6 py-2"
      style={{
        // Sits beneath the 48px ProductHeader.
        top: 0,
        background: 'var(--lp-panel)',
        borderColor: 'var(--lp-border-strong)',
        minHeight: 40,
      }}
    >
      <Stat
        label="Total budget"
        value={formatAbbrev(stats.total, displayCurrency)}
      />
      <Stat
        label="Committed"
        value={formatAbbrev(stats.committed, displayCurrency)}
      />
      <Stat
        label="Spent"
        value={formatAbbrev(stats.spent, displayCurrency)}
      />
      <Stat
        label="Remaining"
        value={formatAbbrev(stats.remaining, displayCurrency)}
        tone={stats.remaining >= 0 ? 'good' : 'bad'}
      />
      <Stat
        label="Variance"
        value={
          (stats.variance >= 0 ? '+' : '') +
          formatAbbrev(stats.variance, displayCurrency).replace(/^-/, '−')
        }
        tone={stats.variance <= 0 ? 'good' : 'bad'}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'bad';
}) {
  const valueColor =
    tone === 'good'
      ? 'var(--color-lp-status-complete)'
      : tone === 'bad'
        ? 'var(--color-lp-error, #EF4444)'
        : 'var(--lp-text)';
  return (
    <div className="flex items-baseline gap-2">
      <span
        style={{
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--lp-text-tertiary)',
        }}
      >
        {label}
      </span>
      <span
        className="lp-mono"
        style={{
          fontSize: '15px',
          fontWeight: 600,
          color: valueColor,
          lineHeight: 1.1,
        }}
      >
        {value}
      </span>
    </div>
  );
}

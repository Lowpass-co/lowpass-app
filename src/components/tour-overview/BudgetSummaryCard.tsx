'use client';

import { formatCurrency } from '@/lib/utils';
import type { BudgetCardData } from './overview-utils';

interface BudgetSummaryCardProps {
  data: BudgetCardData | null;
  currency: string;
}

export function BudgetSummaryCard({ data, currency }: BudgetSummaryCardProps) {
  if (!data) {
    return (
      <div className="lp-dashboard-glass rounded-xl border border-lp-border p-4">
        <h3 className="mb-2 text-sm font-semibold text-lp-text">Budget</h3>
        <p className="text-sm text-lp-text-tertiary">No budget data yet.</p>
      </div>
    );
  }

  const { proposedIncome, actualIncome, proposedExpenses, actualExpenses } = data;
  const netProposed = proposedIncome - proposedExpenses;
  const netActual = actualIncome - actualExpenses;
  const spendPct = proposedExpenses > 0 ? Math.min(100, (actualExpenses / proposedExpenses) * 100) : 0;

  return (
    <div className="lp-dashboard-glass rounded-xl border border-lp-border p-4">
      <h3 className="mb-3 text-sm font-semibold text-lp-text">Budget</h3>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-lp-text-tertiary">P&amp;L (proposed)</span>
          <span className={netProposed >= 0 ? 'text-emerald-600' : 'text-red-600'}>
            {formatCurrency(netProposed, currency)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-lp-text-tertiary">P&amp;L (actual)</span>
          <span className={netActual >= 0 ? 'text-emerald-600' : 'text-red-600'}>
            {netActual < 0 ? '−' : ''}
            {formatCurrency(Math.abs(netActual), currency)}
          </span>
        </div>
        <div className="border-t border-lp-border pt-2">
          <div className="flex justify-between text-xs text-lp-text-tertiary">
            <span>Income</span>
            <span>
              {formatCurrency(proposedIncome, currency)} → {formatCurrency(actualIncome, currency)}
            </span>
          </div>
          <div className="mt-1 flex justify-between text-xs text-lp-text-tertiary">
            <span>Expenses</span>
            <span>
              {formatCurrency(proposedExpenses, currency)} → {formatCurrency(actualExpenses, currency)}
            </span>
          </div>
        </div>
        <div className="pt-2">
          <div className="mb-1 flex justify-between text-xs text-lp-text-tertiary">
            <span>Spend vs proposed</span>
            <span>{spendPct.toFixed(0)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-lp-bg">
            <div
              className="h-full rounded-full bg-lp-orange transition-all"
              style={{ width: `${spendPct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

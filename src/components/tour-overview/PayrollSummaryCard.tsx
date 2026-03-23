'use client';

import { formatCurrency } from '@/lib/utils';
import type { PayrollCardData } from './overview-utils';

interface PayrollSummaryCardProps {
  data: PayrollCardData | null;
  currency: string;
}

export function PayrollSummaryCard({ data, currency }: PayrollSummaryCardProps) {
  if (!data) {
    return (
      <div className="lp-dashboard-glass rounded-xl border border-lp-border p-4">
        <h3 className="mb-2 text-sm font-semibold text-lp-text">Payroll</h3>
        <p className="text-sm text-lp-text-tertiary">No payroll data.</p>
      </div>
    );
  }

  const { costToDate, perDiemTotal, weeksEntered, totalWeeks, crewCount, bandCount, projectedTotal } =
    data;
  const weekPct = totalWeeks > 0 ? Math.min(100, (weeksEntered / totalWeeks) * 100) : 0;

  return (
    <div className="lp-dashboard-glass rounded-xl border border-lp-border p-4">
      <h3 className="mb-3 text-sm font-semibold text-lp-text">Payroll</h3>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-lp-text-tertiary">Cost to date</span>
          <span className="font-semibold text-lp-text">{formatCurrency(costToDate, currency)}</span>
        </div>
        <div className="flex justify-between text-xs text-lp-text-tertiary">
          <span>Per diems (entered)</span>
          <span>{formatCurrency(perDiemTotal, currency)}</span>
        </div>
        <div className="pt-1">
          <div className="mb-1 flex justify-between text-xs text-lp-text-tertiary">
            <span>
              Weeks {weeksEntered} / {totalWeeks}
            </span>
            <span>{weekPct.toFixed(0)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-lp-bg">
            <div
              className="h-full rounded-full bg-lp-orange transition-all"
              style={{ width: `${weekPct}%` }}
            />
          </div>
        </div>
        <p className="text-xs text-lp-text-tertiary">
          {crewCount} crew · {bandCount} band/principal
        </p>
        <p className="text-xs text-lp-text-tertiary">
          Projected tour total:{' '}
          <span className="font-medium text-lp-text">{formatCurrency(projectedTotal, currency)}</span>
        </p>
      </div>
    </div>
  );
}

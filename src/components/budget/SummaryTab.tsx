'use client';

import { useState, useEffect, Fragment } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Single P&L line with proposed, actual, and variance (math spec §9, §14) */
export interface BudgetSummaryLine {
  label: string;
  proposed: number;
  actual: number;
  variancePct: number | null;
  varianceDisplay: string;
}

/** Section of the P&L (INCOME, EXPENSES, etc.) */
export interface BudgetSummarySection {
  title: string;
  lines: BudgetSummaryLine[];
  subtotal?: BudgetSummaryLine;
}

function varianceColor(proposed: number, actual: number): string {
  if (proposed === 0 && actual === 0) return 'text-lp-text-tertiary';
  if (proposed === 0) return 'text-lp-text-secondary';
  const pct = ((actual - proposed) / proposed) * 100;
  if (pct <= 0) return 'text-emerald-600 dark:text-emerald-400';
  if (pct <= 5) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

export function SummaryTab({ tourId }: { tourId: string }) {
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<BudgetSummarySection[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tourId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/budget/summary?tour_id=${tourId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load summary (${r.status})`);
        return r.json();
      })
      .then((data) => setSections(data.sections))
      .catch((err) => setError(err?.message ?? 'Failed to load summary'))
      .finally(() => setLoading(false));
  }, [tourId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-lp-border bg-lp-surface p-8 text-lp-text-secondary">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading summary…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-lp-border bg-lp-surface p-8 text-center text-red-600">
        {error}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-lp-border bg-lp-surface">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-lp-border">
            <th className="bg-lp-bg-tertiary/50 px-4 py-3 text-left font-semibold text-lp-text">Line</th>
            <th className="bg-lp-bg-tertiary/50 px-4 py-3 text-right font-semibold text-lp-text w-32">Proposed</th>
            <th className="bg-lp-bg-tertiary/50 px-4 py-3 text-right font-semibold text-lp-text w-32">Actual</th>
            <th className="bg-lp-bg-tertiary/50 px-4 py-3 text-right font-semibold text-lp-text w-24">Variance</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((section, idx) => (
            <Fragment key={idx}>
              <tr>
                <td colSpan={4} className="bg-lp-bg-tertiary/30 px-4 py-2 font-medium uppercase tracking-wider text-lp-text-secondary">
                  {section.title}
                </td>
              </tr>
              {section.lines.map((row, lineIdx) => (
                <tr key={`${idx}-${lineIdx}`} className="border-b border-lp-border/60">
                  <td className="px-4 py-2 text-lp-text">{row.label}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-lp-text">
                    {row.proposed.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-lp-text">
                    {row.actual.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className={cn('px-4 py-2 text-right tabular-nums font-medium', varianceColor(row.proposed, row.actual))}>
                    {row.varianceDisplay}
                  </td>
                </tr>
              ))}
              {section.subtotal && (
                <tr className="border-b border-lp-border bg-lp-bg-tertiary/20">
                  <td className="px-4 py-2 font-bold text-lp-text">{section.subtotal.label}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-bold text-lp-text">
                    {section.subtotal.proposed.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-bold text-lp-text">
                    {section.subtotal.actual.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className={cn('px-4 py-2 text-right tabular-nums font-bold', varianceColor(section.subtotal.proposed, section.subtotal.actual))}>
                    {section.subtotal.varianceDisplay}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

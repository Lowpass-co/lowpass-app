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

type Bucket = { sections: BudgetSummarySection[]; proposed: number; actual: number };

/** Categorise sections into Income / Expenses / Overheads buckets */
function bucketSections(sections: BudgetSummarySection[]): {
  income: Bucket;
  expenses: Bucket;
  overheads: Bucket;
} {
  const income: BudgetSummarySection[] = [];
  const expenses: BudgetSummarySection[] = [];
  const overheads: BudgetSummarySection[] = [];

  for (const s of sections) {
    const t = s.title.toUpperCase();
    if (t.includes('INCOME') || t.includes('REVENUE')) {
      income.push(s);
    } else if (
      t.includes('COMMISSION') || t.includes('OVERHEAD') ||
      t.includes('MANAGEMENT') || t.includes('BOOKING') || t.includes('LEGAL')
    ) {
      overheads.push(s);
    } else {
      expenses.push(s);
    }
  }

  const sum = (secs: BudgetSummarySection[]) => {
    let proposed = 0, actual = 0;
    for (const s of secs) {
      if (s.subtotal) { proposed += s.subtotal.proposed; actual += s.subtotal.actual; }
    }
    return { proposed, actual };
  };

  return {
    income: { sections: income, ...sum(income) },
    expenses: { sections: expenses, ...sum(expenses) },
    overheads: { sections: overheads, ...sum(overheads) },
  };
}

function fmt(n: number) {
  return n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtShort(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : n > 0 ? '+' : '';
  if (abs >= 1_000_000) return `${sign}£${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}£${(abs / 1_000).toFixed(0)}K`;
  return `${sign}£${abs.toFixed(0)}`;
}

function varianceColor(proposed: number, actual: number): string {
  if (proposed === 0 && actual === 0) return 'text-lp-text-tertiary';
  if (proposed === 0) return 'text-lp-text-secondary';
  const pct = ((actual - proposed) / proposed) * 100;
  if (pct <= 0) return 'text-emerald-500';
  if (pct <= 5) return 'text-amber-500';
  return 'text-red-500';
}

/** Three-segment proportional bar (income=teal, expenses=red, overheads=purple) */
function ThreeSegmentBar({
  income, expenses, overheads, label,
}: { income: number; expenses: number; overheads: number; label: string }) {
  const total = Math.max(income + expenses + overheads, 1);
  const iPct = (income / total) * 100;
  const ePct = (expenses / total) * 100;
  const oPct = (overheads / total) * 100;

  return (
    <div className="flex items-center gap-3">
      <span
        className="shrink-0 text-[10px] font-semibold uppercase tracking-widest w-16 text-right"
        style={{ color: 'rgba(255,255,255,0.25)' }}
      >
        {label}
      </span>
      <div className="flex h-5 flex-1 overflow-hidden rounded-sm gap-px">
        <div style={{ width: `${oPct}%`, background: '#7c3aed', opacity: 0.85 }} />
        <div style={{ width: `${ePct}%`, background: '#ef4444', opacity: 0.85 }} />
        <div style={{ width: `${iPct}%`, background: '#10b981', opacity: 0.9 }} />
      </div>
    </div>
  );
}

type DisplayLine = { label: string; actual: number; proposed: number };

/** Aggregate expense sections into the three combined display groups */
function aggregateExpensesLines(sections: BudgetSummarySection[]): DisplayLine[] {
  const groups: { label: string; keywords: string[] }[] = [
    { label: 'Salaries & Per Diems', keywords: ['SALARY', 'SALARIES', 'PAYROLL', 'PER DIEM', 'PERDIEM'] },
    { label: 'Hotels & Flights',     keywords: ['HOTEL', 'FLIGHT', 'ACCOMMODATION'] },
    { label: 'Transport & Production', keywords: ['TRANSPORT', 'PRODUCTION', 'FREIGHT', 'CARGO'] },
  ];

  return groups.map(({ label, keywords }) => {
    let proposed = 0, actual = 0;
    for (const s of sections) {
      const t = s.title.toUpperCase();
      if (keywords.some((k) => t.includes(k))) {
        if (s.subtotal) { proposed += s.subtotal.proposed; actual += s.subtotal.actual; }
        else { for (const l of s.lines) { proposed += l.proposed; actual += l.actual; } }
      }
    }
    return { label, actual, proposed };
  });
}

/** Summary card for one bucket — shows total + line items */
function BucketCard({
  label, dot, bucket, displayLines,
}: { label: string; dot: string; bucket: Bucket; displayLines?: DisplayLine[] }) {
  // Use overridden display lines if provided, otherwise collect up to 3 from sections
  const lines: DisplayLine[] = displayLines ?? (() => {
    const auto: DisplayLine[] = [];
    for (const s of bucket.sections) {
      for (const l of s.lines) {
        if (auto.length < 3) auto.push({ label: l.label, actual: l.actual, proposed: l.proposed });
      }
    }
    return auto;
  })();

  return (
    <div className="flex flex-col px-6 py-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: dot }} />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-lp-text-secondary">
          {label}
        </span>
      </div>
      <p className="text-2xl font-bold text-lp-text tabular-nums mb-1">
        £{fmt(bucket.actual)}
      </p>
      <p className="text-xs text-lp-text-tertiary mb-4">
        £{fmt(bucket.proposed)} proposed
      </p>
      {lines.length > 0 && (
        <div className="space-y-1.5 border-t border-lp-border/40 pt-3">
          {lines.map((l, i) => {
            const over = l.actual > l.proposed && l.proposed > 0;
            return (
              <div key={i} className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-lp-text-tertiary truncate">{l.label}</span>
                <span
                  className="text-xs tabular-nums shrink-0"
                  style={{ color: over ? '#FF4500' : 'rgba(255,255,255,0.65)' }}
                >
                  £{fmt(l.actual)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Dot colour for table section headers */
function sectionDotColor(title: string): string {
  const t = title.toUpperCase();
  if (t.includes('INCOME') || t.includes('REVENUE')) return '#10b981';
  if (t.includes('COMMISSION') || t.includes('OVERHEAD') || t.includes('MANAGEMENT') || t.includes('BOOKING') || t.includes('LEGAL')) return '#a78bfa';
  if (t.includes('SALARY') || t.includes('SALARIES') || t.includes('PAYROLL')) return '#a78bfa';
  if (t.includes('HOTEL')) return '#60a5fa';
  if (t.includes('FLIGHT')) return '#38bdf8';
  if (t.includes('TRANSPORT')) return '#34d399';
  if (t.includes('PRODUCTION')) return '#fb923c';
  return '#ef4444';
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
      <div className="rounded-xl border border-lp-border bg-lp-surface p-8 text-center text-red-500">
        {error}
      </div>
    );
  }

  const { income, expenses, overheads } = bucketSections(sections);
  const netActual = income.actual - expenses.actual - overheads.actual;
  const netProposed = income.proposed - expenses.proposed - overheads.proposed;
  const netIsPositive = netActual >= 0;

  return (
    <div className="space-y-6">

      {/* Hero block */}
      <div className="rounded-xl border border-lp-border bg-lp-surface overflow-hidden">

        {/* Net P&L + bar chart */}
        <div className="px-6 pt-6 pb-5 border-b border-lp-border/60 space-y-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary mb-1">
              Net Profit / Loss
            </p>
            <span
              className="text-4xl font-bold tracking-tight"
              style={{ color: netIsPositive ? '#10b981' : '#ef4444' }}
            >
              {fmtShort(netActual)}
            </span>
            {netProposed !== 0 && (
              <span className="ml-3 text-sm text-lp-text-tertiary">
                Actual vs Proposed
              </span>
            )}
          </div>

          {/* Two bars */}
          <div className="space-y-2.5">
            <ThreeSegmentBar
              income={income.proposed}
              expenses={expenses.proposed}
              overheads={overheads.proposed}
              label="Proposed"
            />
            <ThreeSegmentBar
              income={income.actual}
              expenses={expenses.actual}
              overheads={overheads.actual}
              label="Actual"
            />
          </div>

          {/* Legend */}
          <div className="flex items-center gap-6">
            {([
              { label: 'Income', color: '#10b981' },
              { label: 'Expenses', color: '#ef4444' },
              { label: 'Overheads', color: '#7c3aed' },
            ] as const).map(({ label, color }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                <span className="text-[10px] text-lp-text-tertiary uppercase tracking-wider">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Three bucket cards */}
        <div className="grid grid-cols-3 divide-x divide-lp-border/60">
          <BucketCard label="Income" dot="#10b981" bucket={income} />
          <BucketCard
            label="Direct Expenses"
            dot="#ef4444"
            bucket={expenses}
            displayLines={aggregateExpensesLines(expenses.sections)}
          />
          <BucketCard label="Overheads" dot="#7c3aed" bucket={overheads} />
        </div>
      </div>

      {/* Detailed P&L table */}
      <div className="overflow-x-auto rounded-xl border border-lp-border bg-lp-surface">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-lp-border">
              <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Line Item</th>
              <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary w-36">Proposed</th>
              <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary w-36">Actual</th>
              <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary w-28">Variance</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((section, idx) => (
              <Fragment key={idx}>
                <tr className="border-b border-lp-border/40">
                  <td colSpan={4} className="px-5 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ background: sectionDotColor(section.title) }}
                      />
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-lp-text-secondary">
                        {section.title}
                      </span>
                    </div>
                  </td>
                </tr>

                {section.lines.map((row, lineIdx) => (
                  <tr
                    key={`${idx}-${lineIdx}`}
                    className="border-b border-lp-border/30 hover:bg-lp-surface-hover transition-colors"
                  >
                    <td className="px-5 py-2 pl-9 text-lp-text-secondary">{row.label}</td>
                    <td className="px-5 py-2 text-right tabular-nums text-lp-text-tertiary">
                      {fmt(row.proposed)}
                    </td>
                    <td className="px-5 py-2 text-right tabular-nums text-lp-text font-medium">
                      {fmt(row.actual)}
                    </td>
                    <td className={cn('px-5 py-2 text-right tabular-nums text-xs font-medium', varianceColor(row.proposed, row.actual))}>
                      {row.varianceDisplay}
                    </td>
                  </tr>
                ))}

                {section.subtotal && (
                  <tr className="border-b border-lp-border/60">
                    <td className="px-5 py-2.5 pl-5 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">
                      {section.subtotal.label}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-bold text-lp-text">
                      £{fmt(section.subtotal.proposed)}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-bold text-lp-text">
                      £{fmt(section.subtotal.actual)}
                    </td>
                    <td className={cn('px-5 py-2.5 text-right tabular-nums font-bold', varianceColor(section.subtotal.proposed, section.subtotal.actual))}>
                      {section.subtotal.varianceDisplay}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}

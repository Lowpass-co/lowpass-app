'use client';

import { useState, useEffect } from 'react';
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

const INCOME_COLOR = '#166534';
const EXPENSES_COLOR = '#dc2626';
const OVERHEADS_COLOR = '#6d28d9';

const STANDARD_BAR_HEIGHT = 120;
const MAX_BAR_HEIGHT = 200;

/** Vertical stacked bar: only filled when totals present; height scales with value; empty = grey placeholder at standard height. */
function VerticalStackedBar({
  income: inc,
  expenses: exp,
  overheads: oh,
  label,
  valueAbove,
  valueAboveClassName,
  heightPx,
  hasData,
}: {
  income: number;
  expenses: number;
  overheads: number;
  label: string;
  valueAbove: string;
  valueAboveClassName?: string;
  heightPx: number;
  hasData: boolean;
}) {
  const total = Math.max(inc + exp + oh, 1e-9);
  const iPct = (inc / total) * 100;
  const ePct = (exp / total) * 100;
  const oPct = (oh / total) * 100;

  return (
    <div className="mx-auto flex min-w-0 max-w-[120px] flex-1 flex-col items-center justify-end">
      <span className={cn('mb-2 text-sm font-semibold tabular-nums', valueAboveClassName ?? 'text-lp-text')}>
        {valueAbove}
      </span>
      <div
        className="flex w-full flex-col overflow-hidden rounded-t-xl border border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-4px_12px_rgba(0,0,0,0.35)]"
        style={{
          height: heightPx,
          background: hasData ? undefined : 'rgba(255,255,255,0.06)',
        }}
      >
        {hasData && (
          <>
            <div className="w-full shrink-0" style={{ height: `${iPct}%`, background: INCOME_COLOR, minHeight: inc > 0 ? 1 : 0 }} />
            <div className="w-full shrink-0" style={{ height: `${ePct}%`, background: EXPENSES_COLOR, minHeight: exp > 0 ? 1 : 0 }} />
            <div className="w-full shrink-0" style={{ height: `${oPct}%`, background: OVERHEADS_COLOR, minHeight: oh > 0 ? 1 : 0 }} />
          </>
        )}
      </div>
      <span className="mt-2 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">
        {label}
      </span>
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

/** Breakdown block: gradient header + table + subtotal row. When fillHeight=false, section sizes to content (no gap below). */
function BreakdownSection({
  title,
  color,
  sections,
  currencySymbol = '£',
  fillHeight = false,
}: {
  title: string;
  color: string;
  sections: BudgetSummarySection[];
  currencySymbol?: string;
  fillHeight?: boolean;
}) {
  const lines: { label: string; proposed: number; actual: number; varianceDisplay: string }[] = [];
  let subtotalProposed = 0;
  let subtotalActual = 0;
  for (const s of sections) {
    for (const l of s.lines) {
      lines.push({ label: l.label, proposed: l.proposed, actual: l.actual, varianceDisplay: l.varianceDisplay });
    }
    if (s.subtotal) {
      subtotalProposed += s.subtotal.proposed;
      subtotalActual += s.subtotal.actual;
    } else {
      for (const l of s.lines) {
        subtotalProposed += l.proposed;
        subtotalActual += l.actual;
      }
    }
  }

  const gridCols = 'grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_4rem]';

  return (
    <div className={cn('flex min-h-0 flex-col rounded-xl overflow-hidden border border-lp-border/60 bg-lp-surface/50', fillHeight && 'h-full')}>
      {/* Header: title on left, then gradient line and dot */}
      <div className="flex shrink-0 items-center gap-2 px-3 py-2 border-b border-lp-border/50" style={{ background: `${color}18` }}>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-lp-text-secondary shrink-0">
          {title}
        </span>
        <div className="h-1 flex-1 rounded-full opacity-80" style={{ background: color }} />
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      </div>
      <div className={cn('min-h-0 overflow-y-auto flex flex-col', fillHeight && 'flex-1')}>
        <div className={cn('flex flex-col', fillHeight && 'min-h-full')}>
          {fillHeight ? (
            <>
              {/* Grid layout when fillHeight: headers and rows align, body rows spread evenly */}
              <div className={`grid ${gridCols} shrink-0 border-b border-lp-border/50 px-2 py-1.5 text-[11px] font-semibold text-lp-text-tertiary sticky top-0 z-10 bg-lp-surface/95`}>
                <span className="text-left">Line item</span>
                <span className="text-right">Proposed</span>
                <span className="text-right">Actual</span>
                <span className="text-right">Variance</span>
              </div>
              <div className="flex flex-1 min-h-0 flex-col justify-evenly">
                {lines.map((row, i) => (
                  <div key={i} className={`grid ${gridCols} border-b border-lp-border/30 px-2 py-1 text-[11px] items-center gap-0`}>
                    <span className="min-w-0 text-lp-text-secondary break-words">{row.label}</span>
                    <span className="text-right tabular-nums text-lp-text-tertiary">{currencySymbol}{fmt(row.proposed)}</span>
                    <span className="text-right tabular-nums text-lp-text">{currencySymbol}{fmt(row.actual)}</span>
                    <span className="text-right tabular-nums text-lp-text-tertiary">{row.varianceDisplay}</span>
                  </div>
                ))}
              </div>
              <div className={`grid ${gridCols} items-center gap-0 border-t border-lp-border/50 px-2 py-2 text-[11px] font-bold shrink-0 sticky bottom-0 z-10`} style={{ background: `${color}22` }}>
                <span className="text-lp-text-tertiary uppercase tracking-wider">Subtotal</span>
                <span className="text-right tabular-nums text-lp-text">{currencySymbol}{fmt(subtotalProposed)}</span>
                <span className="text-right tabular-nums text-lp-text">{currencySymbol}{fmt(subtotalActual)}</span>
                <span />
              </div>
            </>
          ) : (
            <>
              <table className="w-full shrink-0 border-collapse text-[11px] table-fixed min-w-0">
                <colgroup>
                  <col className="min-w-0" />
                  <col className="w-14" />
                  <col className="w-14" />
                  <col className="w-16" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-lp-surface/95">
                  <tr className="border-b border-lp-border/50">
                    <th className="px-2 py-1.5 text-left font-semibold text-lp-text-tertiary">Line item</th>
                    <th className="px-2 py-1.5 text-right font-semibold text-lp-text-tertiary">Proposed</th>
                    <th className="px-2 py-1.5 text-right font-semibold text-lp-text-tertiary">Actual</th>
                    <th className="px-2 py-1.5 text-right font-semibold text-lp-text-tertiary">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((row, i) => (
                    <tr key={i} className="border-b border-lp-border/30">
                      <td className="min-w-0 max-w-[140px] px-2 py-1 text-lp-text-secondary break-words">{row.label}</td>
                      <td className="px-2 py-1 text-right tabular-nums text-lp-text-tertiary">{currencySymbol}{fmt(row.proposed)}</td>
                      <td className="px-2 py-1 text-right tabular-nums text-lp-text">{currencySymbol}{fmt(row.actual)}</td>
                      <td className="px-2 py-1 text-right tabular-nums text-lp-text-tertiary">{row.varianceDisplay}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div
                className="sticky bottom-0 z-10 grid grid-cols-[1fr_3.5rem_3.5rem_4rem] items-center gap-0 border-t border-lp-border/50 px-2 py-2 text-[11px] font-bold shrink-0"
                style={{ background: `${color}22` }}
              >
                <span className="text-lp-text-tertiary uppercase tracking-wider">Subtotal</span>
                <span className="text-right tabular-nums text-lp-text">{currencySymbol}{fmt(subtotalProposed)}</span>
                <span className="text-right tabular-nums text-lp-text">{currencySymbol}{fmt(subtotalActual)}</span>
                <span />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function SummaryTab({
  tourId,
  breakdownHeading = 'inline',
  slot,
}: {
  tourId: string;
  /** When 'outside', the page renders the Breakdown heading; omit it here so it aligns with Select Tour */
  breakdownHeading?: 'inline' | 'outside';
  /** When 'left' or 'right', render only that column (for split layout) */
  slot?: 'left' | 'right';
}) {
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
  const currencySymbol = '£';

  const proposedTotal = income.proposed + expenses.proposed + overheads.proposed;
  const actualTotal = income.actual + expenses.actual + overheads.actual;
  const scaleMax = Math.max(proposedTotal, actualTotal, 1);
  const hasAnyData = proposedTotal > 0 || actualTotal > 0;
  const proposedBarHeight = hasAnyData
    ? Math.round((proposedTotal / scaleMax) * MAX_BAR_HEIGHT) || STANDARD_BAR_HEIGHT
    : STANDARD_BAR_HEIGHT;
  const actualBarHeight = hasAnyData
    ? Math.round((actualTotal / scaleMax) * MAX_BAR_HEIGHT) || STANDARD_BAR_HEIGHT
    : STANDARD_BAR_HEIGHT;

  const leftColumn = (
    <div className="mt-6 flex min-h-0 flex-1 flex-col rounded-xl border border-lp-border bg-lp-surface/50 p-4">
      <p className="shrink-0 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-lp-text">
        Net Profit / Loss
      </p>
      {/* GRAPH SECTION — mid-body: two vertical bar graphs; height scales with max(Proposed, Actual) when data present */}
      <div className="flex min-h-[140px] flex-1 items-end justify-center gap-6 px-2">
        <VerticalStackedBar
          income={income.proposed}
          expenses={expenses.proposed}
          overheads={overheads.proposed}
          label="Proposed"
          valueAbove={`${currencySymbol}${fmt(income.proposed)}`}
          heightPx={proposedBarHeight}
          hasData={proposedTotal > 0}
        />
        <VerticalStackedBar
          income={income.actual}
          expenses={expenses.actual}
          overheads={overheads.actual}
          label="Actual"
          valueAbove={`${currencySymbol}${fmt(income.actual)}`}
          valueAboveClassName={netIsPositive ? 'text-emerald-400' : 'text-red-400'}
          heightPx={actualBarHeight}
          hasData={actualTotal > 0}
        />
      </div>
      {/* Totals at bottom of graph section; P/L label white; Actual column green (profit) / red (loss) */}
      <div className="mt-auto shrink-0 rounded-lg border border-white/10 bg-[color-mix(in_srgb,var(--lp-budget-wrap-bg)_92%,#5c2a2a_8%)] px-3 py-3">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-white/20">
              <th className="py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-lp-orange">
                Totals
              </th>
              <th className="py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-lp-orange">
                Proposed
              </th>
              <th className="py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-lp-orange">
                Actual
              </th>
            </tr>
          </thead>
          <tbody className="text-lp-text">
            <tr className="border-b border-white/15">
              <td className="py-1.5">Income</td>
              <td className="py-1.5 text-right tabular-nums">{currencySymbol}{fmt(income.proposed)}</td>
              <td className="py-1.5 text-right tabular-nums">{currencySymbol}{fmt(income.actual)}</td>
            </tr>
            <tr className="border-b border-white/15">
              <td className="py-1.5">Expenses</td>
              <td className="py-1.5 text-right tabular-nums">{currencySymbol}{fmt(expenses.proposed)}</td>
              <td className="py-1.5 text-right tabular-nums">{currencySymbol}{fmt(expenses.actual)}</td>
            </tr>
            <tr className="border-t-2 border-white/25">
              <td className="py-2 font-medium text-white">P / L</td>
              <td className="py-2 text-right tabular-nums font-medium text-white">{currencySymbol}{fmt(netProposed)}</td>
              <td
                className="py-2 text-right tabular-nums font-semibold"
                style={{ color: netIsPositive ? INCOME_COLOR : EXPENSES_COLOR }}
              >
                {currencySymbol}{fmt(netActual)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );

  const rightColumn = (
    <div className="flex min-h-0 h-full flex-1 flex-col overflow-hidden">
      {breakdownHeading === 'inline' && (
        <p className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">
          Breakdown
        </p>
      )}
      {/* Income: content height. Direct Expenses: fills middle. Overheads: content height at bottom. A couple of pixels between boxes. */}
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
        <div className="shrink-0 overflow-hidden">
          <BreakdownSection title="Income" color={INCOME_COLOR} sections={income.sections} currencySymbol={currencySymbol} fillHeight={false} />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <BreakdownSection title="Direct Expenses" color={EXPENSES_COLOR} sections={expenses.sections} currencySymbol={currencySymbol} fillHeight />
        </div>
        <div className="shrink-0 overflow-hidden">
          <BreakdownSection title="Overheads" color={OVERHEADS_COLOR} sections={overheads.sections} currencySymbol={currencySymbol} fillHeight={false} />
        </div>
      </div>
    </div>
  );

  if (slot === 'left') return <div className="flex h-full min-h-0 flex-col overflow-hidden">{leftColumn}</div>;
  if (slot === 'right') {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden pt-2">
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
          <div className="shrink-0 overflow-hidden">
            <BreakdownSection title="Income" color={INCOME_COLOR} sections={income.sections} currencySymbol={currencySymbol} fillHeight={false} />
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <BreakdownSection title="Direct Expenses" color={EXPENSES_COLOR} sections={expenses.sections} currencySymbol={currencySymbol} fillHeight />
          </div>
          <div className="shrink-0 overflow-hidden">
            <BreakdownSection title="Overheads" color={OVERHEADS_COLOR} sections={overheads.sections} currencySymbol={currencySymbol} fillHeight={false} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {leftColumn}
        {rightColumn}
      </div>
    </div>
  );
}

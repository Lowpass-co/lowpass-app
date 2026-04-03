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
    const t = s.title.toUpperCase().trim();
    // Roll-up section for APIs (e.g. dashboard snapshot); not a direct-expense category
    if (t === 'TOTALS') continue;
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

/** P&L display: explicit +/− and £ (graph + tables) */
function fmtSignedPl(n: number, currencySymbol: string) {
  const abs = Math.abs(n);
  const body = `${currencySymbol}${abs.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (n > 0) return `+${body}`;
  if (n < 0) return `−${body}`;
  return `${currencySymbol}0.00`;
}

/** Tailwind classes: profit (≥0 green — 0 is break-even) / loss (red) */
function plTextClass(n: number): string {
  if (n > 0) return 'text-emerald-600 dark:text-emerald-400';
  if (n < 0) return 'text-red-600 dark:text-red-400';
  return 'text-lp-text';
}

/**
 * Bar heights for Proposed vs Actual net: higher net = taller bar (e.g. −£5k vs −£8.5k → former is taller).
 * Maps [min(netP, netA), max(...)] → [STANDARD_BAR_HEIGHT, MAX_BAR_HEIGHT].
 */
function netProfitBarHeights(netProposed: number, netActual: number): { proposed: number; actual: number } {
  const minN = Math.min(netProposed, netActual);
  const maxN = Math.max(netProposed, netActual);
  const span = maxN - minN;
  if (span === 0 || !Number.isFinite(span)) {
    return { proposed: STANDARD_BAR_HEIGHT, actual: STANDARD_BAR_HEIGHT };
  }
  const lo = STANDARD_BAR_HEIGHT;
  const hi = MAX_BAR_HEIGHT;
  const t = (v: number) => lo + ((v - minN) / span) * (hi - lo);
  return {
    proposed: Math.round(t(netProposed)),
    actual: Math.round(t(netActual)),
  };
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

/** Breakdown tables: line item column uses remaining space; amount cols fixed ch so headers sit left of far-right edge */
const BREAKDOWN_GRID_COLS =
  'grid-cols-[minmax(0,1.4fr)_minmax(11ch,1fr)_minmax(11ch,1fr)_minmax(9ch,0.9fr)]';

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
    <div className="mx-auto flex min-w-[7rem] max-w-[min(100%,22rem)] flex-1 flex-col items-center justify-end px-0.5">
      <span
        className={cn(
          'mb-2 max-w-full text-center text-sm font-semibold tabular-nums whitespace-nowrap',
          valueAboveClassName ?? 'text-lp-text'
        )}
      >
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
      <span className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-black dark:text-white">
        {label}
      </span>
    </div>
  );
}

type DisplayLine = { label: string; actual: number; proposed: number };

/** Aggregate expense sections into the three combined display groups */
function aggregateExpensesLines(sections: BudgetSummarySection[]): DisplayLine[] {
  const groups: { label: string; keywords: string[] }[] = [
    { label: 'Salary & Per Diems', keywords: ['SALARY', 'SALARIES', 'PAYROLL', 'PER DIEM', 'PERDIEM'] },
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
        <span className="text-[11px] font-semibold uppercase tracking-wider text-black dark:text-white">
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
                  className={cn(
                    'text-xs tabular-nums shrink-0',
                    over ? '' : 'text-lp-text-secondary dark:text-white/70'
                  )}
                  style={over ? { color: '#FF4500' } : undefined}
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

  /** Opaque-enough footer so scrolled rows never show through at high zoom */
  const subtotalBg = `color-mix(in srgb, var(--lp-surface) 78%, ${color} 22%)`;

  const columnHeader = (
    <div
      className={cn(
        'grid w-full shrink-0 border-b border-lp-border/50 bg-lp-surface px-2 py-1.5 text-[11px] font-semibold text-black dark:text-white',
        BREAKDOWN_GRID_COLS
      )}
    >
      <span className="min-w-0 text-left">Line Item</span>
      <span className="whitespace-nowrap text-center">Proposed</span>
      <span className="whitespace-nowrap text-center">Actual</span>
      <span className="whitespace-nowrap text-center">Variance</span>
    </div>
  );

  const rowGrid = (row: (typeof lines)[0], i: number) => (
    <div
      key={i}
      className={cn(
        'grid w-full items-center gap-x-2 border-b border-lp-border/30 px-2 py-1.5 text-[11px]',
        BREAKDOWN_GRID_COLS
      )}
    >
      <span className="min-w-0 text-lp-text break-words pr-1">{row.label}</span>
      <span className="whitespace-nowrap text-center tabular-nums text-lp-text-tertiary">
        {currencySymbol}
        {fmt(row.proposed)}
      </span>
      <span className="whitespace-nowrap text-center tabular-nums text-lp-text">
        {currencySymbol}
        {fmt(row.actual)}
      </span>
      <span className="whitespace-nowrap text-center tabular-nums text-lp-text-tertiary">{row.varianceDisplay}</span>
    </div>
  );

  const subtotalRow = (
    <div
      className={cn(
        'grid w-full shrink-0 items-center gap-x-2 border-t border-lp-border/60 px-2 py-2.5 text-[11px] font-bold',
        BREAKDOWN_GRID_COLS
      )}
      style={{ background: subtotalBg }}
    >
      <span className="min-w-0 uppercase tracking-wider text-black dark:text-white">Subtotal</span>
      <span className="whitespace-nowrap text-center tabular-nums text-black dark:text-white">
        {currencySymbol}
        {fmt(subtotalProposed)}
      </span>
      <span className="whitespace-nowrap text-center tabular-nums text-black dark:text-white">
        {currencySymbol}
        {fmt(subtotalActual)}
      </span>
      <span />
    </div>
  );

  return (
    <div
      className={cn(
        'flex min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-xl border border-lp-border/60 bg-lp-surface',
        fillHeight && 'h-full'
      )}
    >
      {/* Section title */}
      <div
        className="flex shrink-0 items-center gap-2 border-b border-lp-border/50 px-3 py-2"
        style={{ background: `${color}18` }}
      >
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-black dark:text-white">
          {title}
        </span>
        <div className="h-1 min-w-0 flex-1 rounded-full opacity-80" style={{ background: color }} />
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      </div>

      {/* Column header + scrollable body + subtotal (subtotal never inside scroll — avoids overlap at zoom) */}
      <div className={cn('flex min-h-0 w-full min-w-0 flex-col', fillHeight ? 'min-h-0 flex-1' : '')}>
        {columnHeader}
        <div
          className={cn(
            'min-h-0 min-w-0 overflow-y-auto overflow-x-auto overscroll-contain',
            fillHeight ? 'flex min-h-0 flex-1 flex-col' : 'max-h-[min(50vh,26rem)]'
          )}
        >
          <div
            className={cn(
              'w-full min-w-0',
              // Direct Expenses: grow to fill middle slot and space rows evenly; scroll when lines exceed area
              fillHeight && 'flex min-h-0 flex-1 flex-col justify-evenly'
            )}
          >
            {lines.map((row, i) => rowGrid(row, i))}
          </div>
        </div>
        {subtotalRow}
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
  /** Positive = actual outcome better than proposed (e.g. smaller loss or larger profit). */
  const netVariance = netActual - netProposed;
  const currencySymbol = '£';

  const proposedTotal = income.proposed + expenses.proposed + overheads.proposed;
  const actualTotal = income.actual + expenses.actual + overheads.actual;
  const { proposed: proposedBarHeight, actual: actualBarHeight } = netProfitBarHeights(
    netProposed,
    netActual
  );

  const leftColumn = (
    <div className="mt-6 flex min-h-0 flex-1 flex-col rounded-xl border border-lp-border bg-lp-surface/50 p-4">
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-2 gap-y-1 px-1 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-lp-text">
          Net Profit / Loss
        </p>
        <span className="text-[11px] font-normal normal-case tracking-normal text-lp-text-tertiary">
          –
        </span>
        <span className="inline-flex flex-wrap items-baseline justify-center gap-x-1.5">
          <span className={cn('text-[11px] font-semibold tabular-nums tracking-tight', plTextClass(netVariance))}>
            {fmtSignedPl(netVariance, currencySymbol)}
          </span>
          <span className="text-[11px] font-normal italic normal-case tracking-normal text-lp-text-tertiary">
            variance
          </span>
        </span>
      </div>
      {/* GRAPH SECTION — bar *heights* reflect net (higher net = taller); stacks still show income/expense/overhead mix */}
      <div className="flex min-h-[140px] min-w-0 flex-1 items-end justify-center gap-6 overflow-x-auto px-2">
        <VerticalStackedBar
          income={income.proposed}
          expenses={expenses.proposed}
          overheads={overheads.proposed}
          label="Proposed"
          valueAbove={fmtSignedPl(netProposed, currencySymbol)}
          valueAboveClassName={plTextClass(netProposed)}
          heightPx={proposedBarHeight}
          hasData={proposedTotal > 0}
        />
        <VerticalStackedBar
          income={income.actual}
          expenses={expenses.actual}
          overheads={overheads.actual}
          label="Actual"
          valueAbove={fmtSignedPl(netActual, currencySymbol)}
          valueAboveClassName={plTextClass(netActual)}
          heightPx={actualBarHeight}
          hasData={actualTotal > 0}
        />
      </div>
      {/* Totals at bottom of graph section; P/L label white; Actual column green (profit) / red (loss) */}
      <div className="mt-auto min-w-0 shrink-0 overflow-x-auto rounded-lg border border-lp-border bg-lp-budget-card px-3 py-3 dark:border-white/10">
        <table className="min-w-max w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-white/20 dark:border-white/15">
              <th className="py-1.5 text-left text-[10px] font-bold uppercase tracking-wider text-black dark:text-white">
                Totals
              </th>
              <th className="whitespace-nowrap py-1.5 text-right text-[10px] font-bold uppercase tracking-wider text-black dark:text-white">
                Proposed
              </th>
              <th className="whitespace-nowrap py-1.5 text-right text-[10px] font-bold uppercase tracking-wider text-black dark:text-white">
                Actual
              </th>
            </tr>
          </thead>
          <tbody className="text-lp-text">
            <tr className="border-b border-white/15">
              <td className="py-1.5">Income</td>
              <td className="whitespace-nowrap py-1.5 text-right tabular-nums">
                {currencySymbol}
                {fmt(income.proposed)}
              </td>
              <td className="whitespace-nowrap py-1.5 text-right tabular-nums">
                {currencySymbol}
                {fmt(income.actual)}
              </td>
            </tr>
            <tr className="border-b border-white/15">
              <td className="py-1.5">Expenses</td>
              <td className="whitespace-nowrap py-1.5 text-right tabular-nums">
                {currencySymbol}
                {fmt(expenses.proposed)}
              </td>
              <td className="whitespace-nowrap py-1.5 text-right tabular-nums">
                {currencySymbol}
                {fmt(expenses.actual)}
              </td>
            </tr>
            <tr className="border-t-2 border-white/25">
              <td className="py-2 font-medium text-lp-text">P / L</td>
              <td
                className={cn(
                  'whitespace-nowrap py-2 text-right tabular-nums font-medium',
                  plTextClass(netProposed)
                )}
              >
                {fmtSignedPl(netProposed, currencySymbol)}
              </td>
              <td
                className={cn(
                  'whitespace-nowrap py-2 text-right tabular-nums font-semibold',
                  plTextClass(netActual)
                )}
              >
                {fmtSignedPl(netActual, currencySymbol)}
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
        <p className="shrink-0 text-[11px] font-semibold uppercase tracking-wider lp-table-header-text">
          Breakdown
        </p>
      )}
      {/* Income: content height. Direct Expenses: fills middle. Overheads: content height at bottom. A couple of pixels between boxes. */}
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
        <div className="w-full min-w-0 shrink-0">
          <BreakdownSection title="Income" color={INCOME_COLOR} sections={income.sections} currencySymbol={currencySymbol} fillHeight={false} />
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <BreakdownSection title="Direct Expenses" color={EXPENSES_COLOR} sections={expenses.sections} currencySymbol={currencySymbol} fillHeight />
        </div>
        <div className="w-full min-w-0 shrink-0">
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
          <div className="w-full min-w-0 shrink-0">
            <BreakdownSection title="Income" color={INCOME_COLOR} sections={income.sections} currencySymbol={currencySymbol} fillHeight={false} />
          </div>
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            <BreakdownSection title="Direct Expenses" color={EXPENSES_COLOR} sections={expenses.sections} currencySymbol={currencySymbol} fillHeight />
          </div>
          <div className="w-full min-w-0 shrink-0">
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

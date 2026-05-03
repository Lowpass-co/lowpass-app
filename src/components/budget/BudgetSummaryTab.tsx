/* ============================================
   LOWPASS — Budget · Summary tab (Phase 3 §C.2)

   The big-picture surface. Hosts MacroAllocation donut + Burn Rate
   chart (moved out of the line-item view in §B), plus a variance
   summary card (top over- + under-budget categories), top spend
   categories list, and the recent activity feed (last 5 line-item
   touches).

   Pure client component because it derives all stats from the
   already-loaded `lines` array (no extra round-trips). The recent
   activity feed comes in via prop from the page.
   ============================================ */

'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowDown, ArrowUp, History } from 'lucide-react';
import { BudgetOverviewPanels } from '@/components/budget/BudgetOverviewPanels';
import { convertToCurrency } from '@/lib/budget/fx';
import type { BudgetLineItem } from '@/types';
import type {
  AllocationSegment,
  BurnBucket,
} from '@/server/budget/getBudgetPanelData';
import type { BurnPhaseBoundary } from '@/components/budget/BurnRateChart';

const CATEGORY_LABEL: Record<string, string> = {
  production: 'Production',
  logistics: 'Logistics',
  travel: 'Travel',
  crew: 'Crew',
  accommodation: 'Accommodation',
  catering: 'Catering',
  marketing: 'Marketing',
  insurance: 'Insurance',
  contingency: 'Contingency',
};

function labelFor(category: string): string {
  const norm = (category ?? 'other').toLowerCase();
  return (
    CATEGORY_LABEL[norm] ??
    norm.charAt(0).toUpperCase() + norm.slice(1)
  );
}

function formatCurrency(value: number, currency: string): string {
  try {
    return value.toLocaleString('en-GB', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  } catch {
    return `${currency} ${Math.round(value)}`;
  }
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 30) return `${diffD}d ago`;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export interface BudgetSummaryTabProps {
  tourId: string;
  lines: BudgetLineItem[];
  allocation: AllocationSegment[];
  burn: BurnBucket[];
  phaseBoundaries: BurnPhaseBoundary[];
  tourCurrency: string;
}

export function BudgetSummaryTab({
  tourId,
  lines,
  allocation,
  burn,
  phaseBoundaries,
  tourCurrency,
}: BudgetSummaryTabProps) {
  const searchParams = useSearchParams();
  const displayCurrency = (
    searchParams.get('display') ?? tourCurrency
  ).toUpperCase();

  const stats = useMemo(() => {
    type CatAgg = {
      category: string;
      proposed: number;
      actual: number;
      delta: number;
      pct: number | null;
      count: number;
    };
    const byCat = new Map<string, CatAgg>();
    let totalProposed = 0;
    let totalActual = 0;
    for (const line of lines) {
      const lineCurrency = (line.currency || tourCurrency).toUpperCase();
      const proposed = convertToCurrency(
        Number(line.proposed_cost ?? 0),
        lineCurrency,
        displayCurrency,
      );
      const actual = convertToCurrency(
        Number(line.actual_cost ?? 0),
        lineCurrency,
        displayCurrency,
      );
      totalProposed += proposed;
      totalActual += actual;
      const cat = (line.category ?? 'other').toLowerCase();
      const agg = byCat.get(cat) ?? {
        category: cat,
        proposed: 0,
        actual: 0,
        delta: 0,
        pct: null,
        count: 0,
      };
      agg.proposed += proposed;
      agg.actual += actual;
      agg.count += 1;
      byCat.set(cat, agg);
    }
    const cats: CatAgg[] = [];
    byCat.forEach((agg) => {
      agg.delta = agg.actual - agg.proposed;
      agg.pct = agg.proposed === 0 ? null : (agg.delta / agg.proposed) * 100;
      cats.push(agg);
    });
    const overBudget = cats
      .filter((c) => c.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 3);
    const underBudget = cats
      .filter((c) => c.delta < 0)
      .sort((a, b) => a.delta - b.delta)
      .slice(0, 3);
    const topSpend = [...cats]
      .filter((c) => c.actual > 0 || c.proposed > 0)
      .sort((a, b) => Math.max(b.actual, b.proposed) - Math.max(a.actual, a.proposed))
      .slice(0, 8);
    return {
      totalProposed,
      totalActual,
      totalDelta: totalActual - totalProposed,
      overBudget,
      underBudget,
      topSpend,
      maxBarValue: topSpend.reduce(
        (max, c) => Math.max(max, c.actual, c.proposed),
        0,
      ),
    };
  }, [lines, tourCurrency, displayCurrency]);

  const recent = useMemo(() => {
    return [...lines]
      .filter((l) => l.updated_at)
      .sort((a, b) =>
        (b.updated_at ?? '').localeCompare(a.updated_at ?? ''),
      )
      .slice(0, 5);
  }, [lines]);

  function categoryHref(cat: string): string {
    const params = new URLSearchParams(searchParams);
    params.set('tab', 'budget');
    params.set('category', cat);
    return `/budget/${tourId}?${params.toString()}`;
  }

  return (
    <div className="space-y-6">
      {/* Charts moved here from the line-item view */}
      <BudgetOverviewPanels
        allocation={allocation}
        burn={burn}
        phaseBoundaries={phaseBoundaries}
        currency={tourCurrency}
      />

      {/* Variance summary card */}
      <section
        className="rounded-lg border p-4"
        style={{
          borderColor: 'var(--lp-border-strong)',
          background: 'var(--lp-surface)',
        }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="lp-h3">Variance</h2>
          <span
            className="lp-mono"
            style={{
              fontSize: '20px',
              fontWeight: 600,
              color:
                stats.totalDelta > 0
                  ? 'var(--color-lp-error, #EF4444)'
                  : stats.totalDelta < 0
                    ? 'var(--color-lp-status-complete)'
                    : 'var(--lp-text)',
            }}
          >
            {stats.totalDelta >= 0 ? '+' : ''}
            {formatCurrency(stats.totalDelta, displayCurrency)}
          </span>
        </div>
        <p
          className="mt-1"
          style={{
            fontSize: '13px',
            color: 'var(--lp-text-secondary)',
          }}
        >
          Across the whole budget — actuals vs estimate. Click a category
          to drill into the line items.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <VariancePanel
            title="Over budget"
            tone="bad"
            items={stats.overBudget}
            currency={displayCurrency}
            categoryHref={categoryHref}
          />
          <VariancePanel
            title="Under budget"
            tone="good"
            items={stats.underBudget}
            currency={displayCurrency}
            categoryHref={categoryHref}
          />
        </div>
      </section>

      {/* Top spend categories */}
      <section
        className="rounded-lg border p-4"
        style={{
          borderColor: 'var(--lp-border-strong)',
          background: 'var(--lp-surface)',
        }}
      >
        <h2 className="lp-h3">Top spend categories</h2>
        <p
          className="mt-1"
          style={{
            fontSize: '13px',
            color: 'var(--lp-text-secondary)',
          }}
        >
          Sorted by the larger of estimate vs actual.
        </p>
        {stats.topSpend.length === 0 ? (
          <p
            className="mt-3"
            style={{
              fontSize: '13px',
              color: 'var(--lp-text-tertiary)',
            }}
          >
            No spend yet — add line items to see this.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {stats.topSpend.map((c) => (
              <li key={c.category}>
                <Link
                  href={categoryHref(c.category)}
                  className="btn-transition flex items-center gap-3 rounded-md px-2 py-1.5"
                  style={{ background: 'var(--lp-bg-deep)' }}
                >
                  <span
                    style={{
                      fontSize: '13px',
                      fontWeight: 500,
                      color: 'var(--lp-text)',
                      minWidth: 140,
                    }}
                  >
                    {labelFor(c.category)}
                  </span>
                  <SpendBar
                    actual={c.actual}
                    proposed={c.proposed}
                    max={stats.maxBarValue}
                  />
                  <span
                    className="lp-mono"
                    style={{
                      fontSize: '12px',
                      color: 'var(--lp-text-secondary)',
                      minWidth: 100,
                      textAlign: 'right',
                    }}
                  >
                    {formatCurrency(c.actual, displayCurrency)}
                    <span
                      style={{
                        color: 'var(--lp-text-tertiary)',
                        marginLeft: 6,
                      }}
                    >
                      / {formatCurrency(c.proposed, displayCurrency)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recent activity */}
      <section
        className="rounded-lg border p-4"
        style={{
          borderColor: 'var(--lp-border-strong)',
          background: 'var(--lp-surface)',
        }}
      >
        <div className="flex items-baseline justify-between">
          <h2 className="lp-h3 inline-flex items-center gap-2">
            <History
              className="h-4 w-4"
              style={{ color: 'var(--lp-text-tertiary)' }}
            />
            Recent activity
          </h2>
          <span
            style={{
              fontSize: '11px',
              color: 'var(--lp-text-tertiary)',
            }}
          >
            last 5 line-item changes
          </span>
        </div>
        {recent.length === 0 ? (
          <p
            className="mt-3"
            style={{
              fontSize: '13px',
              color: 'var(--lp-text-tertiary)',
            }}
          >
            No activity yet.
          </p>
        ) : (
          <ul className="mt-3 divide-y" style={{ borderColor: 'var(--lp-border-subtle)' }}>
            {recent.map((line) => (
              <li
                key={line.id}
                className="flex items-baseline justify-between gap-3 py-2"
                style={{
                  borderTopColor: 'var(--lp-border-subtle)',
                }}
              >
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate"
                    style={{
                      fontSize: '13px',
                      color: 'var(--lp-text)',
                      fontWeight: 500,
                    }}
                  >
                    {line.label || '(untitled)'}
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'var(--lp-text-tertiary)',
                    }}
                  >
                    {labelFor(line.category as string)} · {(line.status ?? 'draft').toString()}
                  </div>
                </div>
                <span
                  className="lp-mono shrink-0"
                  style={{
                    fontSize: '11px',
                    color: 'var(--lp-text-tertiary)',
                  }}
                >
                  {formatRelative(line.updated_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SpendBar({
  actual,
  proposed,
  max,
}: {
  actual: number;
  proposed: number;
  max: number;
}) {
  const safeMax = max > 0 ? max : 1;
  const propPct = Math.min(100, (proposed / safeMax) * 100);
  const actPct = Math.min(100, (actual / safeMax) * 100);
  const overrun = actual > proposed && proposed > 0;
  return (
    <div
      className="relative flex-1"
      style={{
        height: 8,
        borderRadius: 4,
        background: 'var(--lp-bg)',
        overflow: 'hidden',
      }}
      aria-hidden
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: `${propPct}%`,
          background:
            'color-mix(in srgb, var(--lp-text-tertiary) 30%, transparent)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: `${actPct}%`,
          background: overrun
            ? 'var(--color-lp-error, #EF4444)'
            : 'var(--color-lp-orange)',
          borderRight: overrun
            ? '1px solid var(--color-lp-error, #EF4444)'
            : 'none',
        }}
      />
    </div>
  );
}

function VariancePanel({
  title,
  tone,
  items,
  currency,
  categoryHref,
}: {
  title: string;
  tone: 'good' | 'bad';
  items: Array<{
    category: string;
    proposed: number;
    actual: number;
    delta: number;
    pct: number | null;
  }>;
  currency: string;
  categoryHref: (cat: string) => string;
}) {
  const headerColor =
    tone === 'good'
      ? 'var(--color-lp-status-complete)'
      : 'var(--color-lp-error, #EF4444)';
  const Icon = tone === 'good' ? ArrowDown : ArrowUp;
  return (
    <div
      className="rounded-md border p-3"
      style={{
        borderColor: 'var(--lp-border-subtle)',
        background: 'var(--lp-bg-deep)',
      }}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5" style={{ color: headerColor }} />
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: headerColor,
          }}
        >
          {title}
        </span>
      </div>
      {items.length === 0 ? (
        <p
          className="mt-2"
          style={{
            fontSize: '12px',
            color: 'var(--lp-text-tertiary)',
          }}
        >
          Nothing.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {items.map((c) => (
            <li key={c.category}>
              <Link
                href={categoryHref(c.category)}
                className="btn-transition flex items-baseline justify-between gap-2 rounded px-1.5 py-1"
              >
                <span
                  className="truncate"
                  style={{
                    fontSize: '13px',
                    color: 'var(--lp-text)',
                    fontWeight: 500,
                  }}
                >
                  {labelFor(c.category)}
                </span>
                <span
                  className="lp-mono shrink-0"
                  style={{
                    fontSize: '12px',
                    color: headerColor,
                  }}
                >
                  {c.delta >= 0 ? '+' : ''}
                  {formatCurrency(c.delta, currency)}
                  {c.pct !== null ? (
                    <span
                      style={{ color: 'var(--lp-text-tertiary)', marginLeft: 6 }}
                    >
                      {c.pct >= 0 ? '+' : ''}
                      {c.pct.toFixed(0)}%
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

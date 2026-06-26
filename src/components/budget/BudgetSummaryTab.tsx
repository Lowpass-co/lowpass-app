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
import { getEffectiveActual } from '@/lib/budget/transactions';
import {
  computeBudgetPnl,
  type BudgetPnl,
  type IncomeInput,
  type CommissionInput,
  type PnlSettingsInput,
} from '@/lib/budget/computeBudgetPnl';
import type { BudgetLineItem, BudgetSection } from '@/types';
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
  /** Phase E — section backbone for the per-section rollup table. */
  sections?: BudgetSection[];
  /** Stage 3 — P&L inputs. */
  income?: IncomeInput[];
  commissions?: CommissionInput[];
  settings?: PnlSettingsInput | null;
  allocation: AllocationSegment[];
  burn: BurnBucket[];
  phaseBoundaries: BurnPhaseBoundary[];
  tourCurrency: string;
  /** Phase 2 — per-tour FX map for converting per-show foreign income to tour ccy. */
  fxRates?: Record<string, number>;
  /** Phase 4 — the viewed version is approved → the Projected column is the
   *  APPROVED baseline (variance reads vs it), not a working draft. */
  versionApproved?: boolean;
  /** Phase 4 — e.g. "v3" for the baseline badge. */
  versionLabel?: string | null;
}

export function BudgetSummaryTab({
  tourId,
  lines,
  sections = [],
  income = [],
  commissions = [],
  settings = null,
  allocation,
  burn,
  phaseBoundaries,
  tourCurrency,
  fxRates = {},
  versionApproved = false,
  versionLabel = null,
}: BudgetSummaryTabProps) {
  const searchParams = useSearchParams();
  const displayCurrency = (
    searchParams.get('display') ?? tourCurrency
  ).toUpperCase();

  /* Stage 3 — the P&L waterfall, recomputed live from the (optimistic)
     line overlay via the shared pure helper. Single source of truth. */
  const pnl = useMemo(
    () =>
      computeBudgetPnl({
        lines,
        income,
        commissions,
        settings,
        tourCurrency,
        fxRates,
      }),
    [lines, income, commissions, settings, tourCurrency, fxRates],
  );

  /* Phase E — per-section rollup mirroring the GN sheet's SUMMARY tab.
     Each section's proposed / actual / variance + a grand total. Lines
     with no (or a stale) section_id fall into "Uncategorised". */
  const sectionRollup = useMemo(() => {
    const sorted = [...sections].sort(
      (a, b) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name),
    );
    const known = new Set(sorted.map((s) => s.id));
    // Immutable accumulation (no in-place mutation) — sum matching lines
    // into a fresh object each step.
    const sumFor = (pred: (l: BudgetLineItem) => boolean) =>
      lines.reduce(
        (acc, line) => {
          if (!pred(line)) return acc;
          const cur = (line.currency || tourCurrency).toUpperCase();
          return {
            proposed:
              acc.proposed +
              convertToCurrency(
                Number(line.proposed_cost ?? 0),
                cur,
                displayCurrency,
              ),
            actual:
              acc.actual +
              convertToCurrency(getEffectiveActual(line), cur, displayCurrency),
          };
        },
        { proposed: 0, actual: 0 },
      );

    const rows = sorted.map((s) => {
      const t = sumFor((l) => l.section_id === s.id);
      return { id: s.id, name: s.name, ...t, delta: t.actual - t.proposed };
    });
    const orphanT = sumFor((l) => !l.section_id || !known.has(l.section_id));
    if (orphanT.proposed !== 0 || orphanT.actual !== 0) {
      rows.push({
        id: '__uncat__',
        name: 'Uncategorised',
        ...orphanT,
        delta: orphanT.actual - orphanT.proposed,
      });
    }
    const grand = rows.reduce(
      (acc, r) => ({
        proposed: acc.proposed + r.proposed,
        actual: acc.actual + r.actual,
      }),
      { proposed: 0, actual: 0 },
    );
    return { rows, grand: { ...grand, delta: grand.actual - grand.proposed } };
  }, [sections, lines, tourCurrency, displayCurrency]);

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

      {/* Phase 4 — headline P&L cards + the refreshed income/expense report. */}
      <PnlHeadlineCards pnl={pnl} versionApproved={versionApproved} versionLabel={versionLabel} />
      <PnlReport pnl={pnl} versionApproved={versionApproved} versionLabel={versionLabel} />

      {/* Phase E — per-section rollup (GN SUMMARY tab) */}
      {sectionRollup.rows.length > 0 ? (
        <section
          className="rounded-lg border p-4"
          style={{
            borderColor: 'var(--lp-border-strong)',
            background: 'var(--lp-surface)',
          }}
        >
          <h2 className="lp-h3">Section summary</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="lp-dense w-full" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {(['Section', 'Estimate', 'Actual', 'Variance'] as const).map(
                    (h, i) => (
                      <th
                        key={h}
                        style={{
                          textAlign: i === 0 ? 'left' : 'right',
                          fontSize: 'var(--lp-text-2xs)',
                          fontWeight: 'var(--lp-weight-semibold)',
                          letterSpacing: 'var(--lp-tracking-caps)',
                          textTransform: 'uppercase',
                          color: 'var(--lp-text-tertiary)',
                          padding: '6px 8px',
                          borderBottom: '1px solid var(--lp-border-subtle)',
                        }}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {sectionRollup.rows.map((r) => (
                  <tr key={r.id}>
                    <td
                      style={{
                        padding: '6px 8px',
                        color: 'var(--lp-text)',
                        borderBottom: '1px solid var(--lp-border-subtle)',
                      }}
                    >
                      {r.name}
                    </td>
                    <td
                      className="lp-mono"
                      style={{
                        textAlign: 'right',
                        padding: '6px 8px',
                        color: 'var(--lp-text-secondary)',
                        borderBottom: '1px solid var(--lp-border-subtle)',
                      }}
                    >
                      {formatCurrency(r.proposed, displayCurrency)}
                    </td>
                    <td
                      className="lp-mono"
                      style={{
                        textAlign: 'right',
                        padding: '6px 8px',
                        color: 'var(--lp-text)',
                        borderBottom: '1px solid var(--lp-border-subtle)',
                      }}
                    >
                      {formatCurrency(r.actual, displayCurrency)}
                    </td>
                    <td
                      className="lp-mono"
                      style={{
                        textAlign: 'right',
                        padding: '6px 8px',
                        borderBottom: '1px solid var(--lp-border-subtle)',
                        color:
                          r.delta > 0
                            ? 'var(--color-lp-error)'
                            : r.delta < 0
                              ? 'var(--color-lp-status-complete)'
                              : 'var(--lp-text-tertiary)',
                      }}
                    >
                      {r.delta >= 0 ? '+' : ''}
                      {formatCurrency(r.delta, displayCurrency)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td
                    style={{
                      padding: '8px',
                      fontWeight: 'var(--lp-weight-bold)',
                      color: 'var(--lp-text)',
                      borderTop: '2px solid var(--lp-border-strong)',
                    }}
                  >
                    Total
                  </td>
                  <td
                    className="lp-mono"
                    style={{
                      textAlign: 'right',
                      padding: '8px',
                      fontWeight: 'var(--lp-weight-semibold)',
                      color: 'var(--lp-text)',
                      borderTop: '2px solid var(--lp-border-strong)',
                    }}
                  >
                    {formatCurrency(sectionRollup.grand.proposed, displayCurrency)}
                  </td>
                  <td
                    className="lp-mono"
                    style={{
                      textAlign: 'right',
                      padding: '8px',
                      fontWeight: 'var(--lp-weight-semibold)',
                      color: 'var(--lp-text)',
                      borderTop: '2px solid var(--lp-border-strong)',
                    }}
                  >
                    {formatCurrency(sectionRollup.grand.actual, displayCurrency)}
                  </td>
                  <td
                    className="lp-mono"
                    style={{
                      textAlign: 'right',
                      padding: '8px',
                      fontWeight: 'var(--lp-weight-bold)',
                      borderTop: '2px solid var(--lp-border-strong)',
                      color:
                        sectionRollup.grand.delta > 0
                          ? 'var(--color-lp-error)'
                          : sectionRollup.grand.delta < 0
                            ? 'var(--color-lp-status-complete)'
                            : 'var(--lp-text)',
                    }}
                  >
                    {sectionRollup.grand.delta >= 0 ? '+' : ''}
                    {formatCurrency(sectionRollup.grand.delta, displayCurrency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      ) : null}

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
                  ? 'var(--color-lp-error)'
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
            ? 'var(--color-lp-error)'
            : 'var(--color-lp-orange)',
          borderRight: overrun
            ? '1px solid var(--color-lp-error)'
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
      : 'var(--color-lp-error)';
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

/* ============================================
   Phase 4 — P&L / Summary visual refresh. Headline cards (Gross · Expenses ·
   Net) + a grouped income/expense report surfacing the Phase-3 income
   breakdown (Guarantee / Overage / Merch / VIP), Projected · Actual · Δ. The
   P&L is a read-only report (NOT a Grid — D-PNL). Single source of truth stays
   `computeBudgetPnl` — these components only present its values; no money math
   lives here. Variance is version-aware (Projected = the approved baseline when
   a version is approved). The % inputs live in Settings; line totals on Budget.
   ============================================ */

const BASIS_LABEL: Record<string, string> = {
  gross: 'gross',
  net: 'net',
  gross_merch: 'merch',
  net_merch: 'net merch',
  gross_minus_tax: 'pre-tax',
};

/* Phase 1 — overhead base labels (insurance / contingency / accountancy). */
const OVERHEAD_BASIS_LABEL: Record<string, string> = {
  income_gross: 'gross income',
  expenses_total: 'total expenses',
  expenses_pre_contingency: 'expenses',
};

function pctLabel(frac: number): string {
  const p = frac * 100;
  return `${p % 1 === 0 ? p.toFixed(0) : p.toFixed(1)}%`;
}

const netColor = (v: number) =>
  v > 0
    ? 'var(--color-lp-status-complete)'
    : v < 0
      ? 'var(--color-lp-error)'
      : 'var(--lp-text)';

/** Δ colour by direction: income/net are good when actual ≥ projected; expenses
 *  are good when actual ≤ projected (under budget). 0 reads neutral. */
function deltaColor(delta: number, goodWhenPositive: boolean): string {
  if (delta === 0) return 'var(--lp-text-tertiary)';
  const good = goodWhenPositive ? delta > 0 : delta < 0;
  return good ? 'var(--color-lp-status-complete)' : 'var(--color-lp-error)';
}

function formatDelta(delta: number, currency: string): string {
  return `${delta >= 0 ? '+' : ''}${formatCurrency(delta, currency)}`;
}

/* ---- Phase 4 — headline cards: Gross income · Total expenses · Net ---- */
function PnlHeadlineCards({
  pnl,
  versionApproved,
  versionLabel,
}: {
  pnl: BudgetPnl;
  versionApproved: boolean;
  versionLabel: string | null;
}) {
  const cur = pnl.currency;
  const cards: Array<{ key: string; label: string; pair: { projected: number; actual: number }; good: boolean; tone?: boolean }> = [
    { key: 'gross', label: 'Gross income', pair: pnl.grossIncome, good: true },
    { key: 'exp', label: 'Total expenses', pair: pnl.totalExpenses, good: false },
    { key: 'net', label: 'Net (P&L)', pair: pnl.net, good: true, tone: true },
  ];
  const projectedLabel = versionApproved && versionLabel ? `Approved ${versionLabel}` : 'Projected';
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {cards.map((c) => {
        const delta = c.pair.actual - c.pair.projected;
        const bigColor = c.tone ? netColor(c.pair.projected) : 'var(--lp-text)';
        return (
          <section
            key={c.key}
            className="rounded-lg border p-4"
            style={{ borderColor: 'var(--lp-border-strong)', background: 'var(--lp-surface)' }}
          >
            <div
              style={{
                fontSize: 'var(--lp-text-2xs)', fontWeight: 'var(--lp-weight-semibold)',
                letterSpacing: 'var(--lp-tracking-caps)', textTransform: 'uppercase',
                color: 'var(--lp-text-tertiary)',
              }}
            >
              {c.label}
            </div>
            <div
              className="lp-mono mt-1"
              style={{ fontSize: '22px', fontWeight: 'var(--lp-weight-bold)', color: bigColor, fontVariantNumeric: 'tabular-nums' }}
            >
              {formatCurrency(c.pair.projected, cur)}
            </div>
            <div style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>{projectedLabel}</div>
            <div className="mt-1.5 flex items-baseline justify-between gap-2" style={{ fontSize: 'var(--lp-text-xs)' }}>
              <span style={{ color: 'var(--lp-text-secondary)' }}>
                Actual{' '}
                <span className="lp-mono" style={{ color: c.tone ? netColor(c.pair.actual) : 'var(--lp-text)' }}>
                  {formatCurrency(c.pair.actual, cur)}
                </span>
              </span>
              <span className="lp-mono" style={{ color: deltaColor(delta, c.good), fontWeight: 'var(--lp-weight-semibold)' }}>
                {formatDelta(delta, cur)}
              </span>
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ---- Phase 4 — the income/expense report (refresh of the P&L waterfall) ----
   Income breakdown (the Phase-3 components: Guarantee / Overage / Merch / VIP)
   → Gross subtotal; then expenses (line items, commissions, overheads) → Total;
   then Net. Projected · Actual · Δ. Read-only. Source = computeBudgetPnl. */
type ReportRowDef = {
  key: string;
  label: string;
  sub?: string;
  pair: { projected: number; actual: number };
  kind: 'line' | 'subtotal' | 'net';
  /** Δ good-direction: true = more is better (income/net), false = expenses. */
  good: boolean;
};

function ReportRow({ r, cur }: { r: ReportRowDef; cur: string }) {
  const delta = r.pair.actual - r.pair.projected;
  const isTotal = r.kind === 'subtotal' || r.kind === 'net';
  const topBorder = isTotal ? '2px solid var(--lp-border-strong)' : '1px solid var(--lp-border-subtle)';
  const weight = isTotal ? 'var(--lp-weight-bold)' : 'var(--lp-weight-medium)';
  const labelColor = r.kind === 'net' ? netColor(r.pair.actual || r.pair.projected) : 'var(--lp-text)';
  const numColor = r.kind === 'net'
    ? { p: netColor(r.pair.projected), a: netColor(r.pair.actual) }
    : { p: 'var(--lp-text-secondary)', a: 'var(--lp-text)' };
  const cell: React.CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: weight };
  return (
    <div
      style={{
        display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 116px 116px 116px',
        alignItems: 'baseline', gap: 8, padding: '5px 8px', borderTop: topBorder,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <span style={{ color: labelColor, fontWeight: weight, fontSize: 'var(--lp-text-sm)' }}>{r.label}</span>
        {r.sub ? (
          <span className="ml-2" style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>{r.sub}</span>
        ) : null}
      </div>
      <span className="lp-mono" style={{ ...cell, color: numColor.p }}>{formatCurrency(r.pair.projected, cur)}</span>
      <span className="lp-mono" style={{ ...cell, color: numColor.a }}>{formatCurrency(r.pair.actual, cur)}</span>
      <span className="lp-mono" style={{ ...cell, color: deltaColor(delta, r.good) }}>{formatDelta(delta, cur)}</span>
    </div>
  );
}

function GroupHeader({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: '8px 8px 4px', fontSize: 'var(--lp-text-2xs)', fontWeight: 'var(--lp-weight-semibold)',
        letterSpacing: 'var(--lp-tracking-caps)', textTransform: 'uppercase', color: 'var(--lp-text-tertiary)',
      }}
    >
      {label}
    </div>
  );
}

function PnlReport({
  pnl,
  versionApproved,
  versionLabel,
}: {
  pnl: BudgetPnl;
  versionApproved: boolean;
  versionLabel: string | null;
}) {
  const cur = pnl.currency;
  const b = pnl.incomeBreakdown;

  // Income side — the Phase-3 components (post-tax), then the gross subtotal.
  const incomeRows: ReportRowDef[] = [
    { key: 'guarantee', label: 'Guarantee', sub: 'post-tax', pair: b.guarantee, kind: 'line', good: true },
    { key: 'overage', label: 'Overage', sub: 'post-tax', pair: b.overage, kind: 'line', good: true },
    { key: 'merch', label: 'Merch', pair: b.merch, kind: 'line', good: true },
    { key: 'vip', label: 'VIP', pair: b.vip, kind: 'line', good: true },
    ...(b.deductions.actual !== 0
      ? [{ key: 'deductions', label: 'Deductions', sub: 'settlement', pair: b.deductions, kind: 'line' as const, good: false }]
      : []),
    { key: 'gross', label: 'Gross income', pair: pnl.grossIncome, kind: 'subtotal', good: true },
  ];

  // Expense side — line items, commissions, overheads, then the total.
  const expenseRows: ReportRowDef[] = [
    { key: 'base', label: 'Line-item expenses', pair: pnl.baseExpenses, kind: 'line', good: false },
    ...pnl.commissionRows.map((c) => ({
      key: `comm-${c.id}`,
      label: c.label || 'Commission',
      sub: `${pctLabel(c.pct)} · ${BASIS_LABEL[c.basis] ?? c.basis}`,
      pair: { projected: c.projected, actual: c.actual },
      kind: 'line' as const,
      good: false,
    })),
    { key: 'insurance', label: 'Insurance', sub: `${pctLabel(pnl.pct.insurance)} of ${OVERHEAD_BASIS_LABEL[pnl.basis.insurance]}`, pair: pnl.insurance, kind: 'line', good: false },
    { key: 'contingency', label: 'Contingency', sub: `${pctLabel(pnl.pct.contingency)} of ${OVERHEAD_BASIS_LABEL[pnl.basis.contingency]}`, pair: pnl.contingency, kind: 'line', good: false },
    ...(pnl.pct.accountancy > 0
      ? [{ key: 'accountancy', label: 'Accountancy', sub: `${pctLabel(pnl.pct.accountancy)} of ${OVERHEAD_BASIS_LABEL[pnl.basis.accountancy]}`, pair: pnl.accountancy, kind: 'line' as const, good: false }]
      : []),
    ...(pnl.pct.merchCogs > 0
      ? [{ key: 'cogs', label: 'Merch COGS', sub: `${pctLabel(pnl.pct.merchCogs)} of merch`, pair: pnl.cogs, kind: 'line' as const, good: false }]
      : []),
    { key: 'total', label: 'Total expenses', pair: pnl.totalExpenses, kind: 'subtotal', good: false },
  ];

  const netRow: ReportRowDef = { key: 'net', label: 'Net (profit / loss)', pair: pnl.net, kind: 'net', good: true };
  const projectedHeader = versionApproved && versionLabel ? `Approved ${versionLabel}` : 'Projected';

  return (
    <section
      className="rounded-lg border p-4"
      style={{ borderColor: 'var(--lp-border-strong)', background: 'var(--lp-surface)' }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="lp-h3">Profit &amp; loss</h2>
        {versionApproved && versionLabel ? (
          <span
            className="shrink-0 rounded-full px-2 py-0.5"
            style={{
              fontSize: 'var(--lp-text-2xs)', fontWeight: 'var(--lp-weight-semibold)',
              letterSpacing: 'var(--lp-tracking-caps)', textTransform: 'uppercase',
              color: 'var(--color-lp-orange)',
              background: 'color-mix(in srgb, var(--color-lp-orange) 12%, transparent)',
            }}
          >
            Baseline {versionLabel}
          </span>
        ) : null}
      </div>
      <p className="mt-1" style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>
        Income breakdown − expenses − commissions − overheads. Read-only, computed
        live from `computeBudgetPnl`.{' '}
        {versionApproved && versionLabel
          ? `Variance reads Actual vs the approved baseline (${versionLabel}).`
          : 'Variance reads Actual vs the working projection.'}
      </p>

      <div className="mt-3 overflow-x-auto">
        <div style={{ minWidth: 520 }}>
          {/* column header */}
          <div
            style={{
              display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 116px 116px 116px', gap: 8,
              padding: '6px 8px', borderBottom: '1px solid var(--lp-border-subtle)',
            }}
          >
            <span />
            {[projectedHeader, 'Actual', 'Δ'].map((h) => (
              <span
                key={h}
                style={{
                  textAlign: 'right', fontSize: 'var(--lp-text-2xs)', fontWeight: 'var(--lp-weight-semibold)',
                  letterSpacing: 'var(--lp-tracking-caps)', textTransform: 'uppercase', color: 'var(--lp-text-tertiary)',
                }}
              >
                {h}
              </span>
            ))}
          </div>

          <GroupHeader label="Income" />
          {incomeRows.map((r) => <ReportRow key={r.key} r={r} cur={cur} />)}

          <GroupHeader label="Expenses" />
          {expenseRows.map((r) => <ReportRow key={r.key} r={r} cur={cur} />)}

          <ReportRow r={netRow} cur={cur} />
        </div>
      </div>
    </section>
  );
}

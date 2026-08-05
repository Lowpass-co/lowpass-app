/* ============================================
   LOWPASS — Budget · Burn bar (grid system Phase 4)

   Replaces the five-stat KPI strip with one bespoke, finance-tool burn
   bar — the single home for the est/act/var summary (section headers are
   now NAME · count only).

   Reads:
     Remaining  = TOTAL − SPENT          (the runway, led large)
     TOTAL      = Σ proposed_cost
     SPENT      = Σ effective actual WHERE status = paid
     COMMITTED  = Σ proposed_cost  WHERE status ∈ {quoted, approved, paid}
     Variance   = SPENT − COMMITTED      (actuals vs what you committed to)

   The meter fills spent / budget; a thin marker shows where Committed
   sits on the same scale; the fill turns red once spent crosses 100%.
   Numbers compute client-side so ?display= currency conversions stay
   live. Token-clean; works light + dark.
   ============================================ */

'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { convertVia, type FxRateMap } from '@/lib/budget/fxRates';
import { getEffectiveActual } from '@/lib/budget/transactions';
import type { BudgetLineItem } from '@/types';

interface BudgetBurnBarProps {
  lines: BudgetLineItem[];
  /** Tour's native currency. Display currency comes from ?display=. */
  tourCurrency: string;
  /** FX unify (Stage 2) — the tour's budget_fx_rates map; display conversions
   *  pivot through the tour currency via convertVia. */
  fxRates?: FxRateMap;
  /** Bar-consolidation — render as the flexible MIDDLE of the budget toolbar
   *  (no frame of its own: no border, padding or background; flex-1 min-w-0)
   *  instead of a standalone full-width bar. The band owns the frame now. */
  inline?: boolean;
}

const COMMITTED_STATUSES = new Set(['quoted', 'approved', 'paid']);
const SPENT_STATUSES = new Set(['paid']);

function symbolFor(currency: string): string {
  try {
    return (0)
      .toLocaleString('en-GB', {
        style: 'currency',
        currency: currency.toUpperCase(),
        minimumFractionDigits: 0,
      })
      .replace(/[\d.,\s-]/g, '');
  } catch {
    return `${currency.toUpperCase()} `;
  }
}

/** Full money, 0 decimals — for the large runway + budget figures. */
function formatMoney(value: number, currency: string): string {
  const sym = symbolFor(currency);
  const sign = value < 0 ? '−' : '';
  return `${sign}${sym}${Math.round(Math.abs(value)).toLocaleString('en-GB')}`;
}

/** Abbreviated money — for the dense inline meter labels. */
function formatAbbrev(value: number, currency: string): string {
  const sym = symbolFor(currency);
  const sign = value < 0 ? '−' : '';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${sign}${sym}${Math.round(abs / 1_000)}K`;
  return `${sign}${sym}${Math.round(abs).toLocaleString('en-GB')}`;
}

const clampPct = (n: number) => Math.max(0, Math.min(100, n));

export function BudgetBurnBar({ lines, tourCurrency, fxRates = {}, inline = false }: BudgetBurnBarProps) {
  const searchParams = useSearchParams();
  const displayCurrency = (
    searchParams.get('display') ?? tourCurrency
  ).toUpperCase();

  const m = useMemo(() => {
    let total = 0;
    let committed = 0;
    let spent = 0;
    for (const line of lines) {
      const cur = (line.currency || tourCurrency).toUpperCase();
      const proposed = convertVia(
        Number(line.proposed_cost ?? 0),
        cur,
        displayCurrency,
        tourCurrency,
        fxRates,
      );
      const actual = convertVia(
        getEffectiveActual(line),
        cur,
        displayCurrency,
        tourCurrency,
        fxRates,
      );
      total += proposed;
      const status = (line.status ?? '').toLowerCase();
      if (COMMITTED_STATUSES.has(status)) committed += proposed;
      if (SPENT_STATUSES.has(status)) spent += actual;
    }
    const remaining = total - spent;
    const variance = spent - committed;
    const pctUsed = total > 0 ? (spent / total) * 100 : 0;
    const committedPct = total > 0 ? clampPct((committed / total) * 100) : 0;
    return {
      total,
      committed,
      spent,
      remaining,
      variance,
      pctUsed,
      committedPct,
      over: spent > total && total > 0,
    };
  }, [lines, tourCurrency, displayCurrency]);

  const fillPct = clampPct(m.pctUsed);
  const fillColor = m.over ? 'var(--color-lp-error)' : 'var(--color-lp-orange)';
  const varianceOver = m.variance > 0; // spent more than committed
  const VarianceIcon = varianceOver ? ArrowUp : ArrowDown;
  const varianceColor = varianceOver
    ? 'var(--color-lp-error)'
    : 'var(--color-lp-status-complete)';

  return (
    /* #27 — ONE status line. The old three stacked column-blocks (big Runway
       number · meter · Variance block) collapsed into a single inline row, so
       "Remaining $X of $Y" reads exactly once and the bar is half the height. */
    <div
      className={
        inline
          ? 'lp-budget-burn-bar flex min-w-0 flex-1 items-center gap-4'
          : 'lp-budget-burn-bar flex items-center gap-4 border-b px-6 py-2'
      }
      style={
        inline
          ? undefined
          : {
              background: 'var(--lp-panel)',
              borderColor: 'var(--lp-border-strong)',
            }
      }
    >
      {/* Remaining — the single runway figure, inline (no stacked label). */}
      <span className="shrink-0 whitespace-nowrap" style={{ fontSize: '12px', color: 'var(--lp-text-tertiary)' }}>
        <span style={{ fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '10px' }}>
          Remaining
        </span>{' '}
        <span
          className="lp-mono"
          style={{
            fontSize: '15px',
            fontWeight: 700,
            color: m.remaining >= 0 ? 'var(--lp-text)' : 'var(--color-lp-error)',
          }}
        >
          {formatMoney(m.remaining, displayCurrency)}
        </span>{' '}
        <span style={{ color: 'var(--lp-text-secondary)' }}>of {formatMoney(m.total, displayCurrency)}</span>
      </span>

      {/* Meter — spent / budget, with the committed marker. The caption sits
          inline to the right of the bar (no third stacked line). */}
      <div
        role="progressbar"
        aria-valuenow={Math.round(m.pctUsed)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Budget spent"
        className="relative min-w-0 flex-1 overflow-visible rounded-full"
        style={{
          height: 8,
          background: 'color-mix(in srgb, var(--lp-text) 8%, transparent)',
        }}
      >
        <div
          className="absolute left-0 top-0 h-full rounded-full"
          style={{
            width: `${fillPct}%`,
            background: fillColor,
            transition: 'width var(--lp-duration-slow) var(--lp-ease-standard)',
          }}
        />
        {/* Committed marker — thin line on the same scale. */}
        {m.committed > 0 ? (
          <div
            className="absolute"
            title={`Committed ${formatMoney(m.committed, displayCurrency)}`}
            style={{
              left: `${m.committedPct}%`,
              top: -3,
              height: 14,
              width: 2,
              borderRadius: 1,
              background: 'var(--lp-text-secondary)',
              transform: 'translateX(-1px)',
            }}
          />
        ) : null}
      </div>

      {/* Spent / used caption + committed — inline. */}
      <span className="shrink-0 whitespace-nowrap" style={{ fontSize: '11px', color: 'var(--lp-text-secondary)' }}>
        <span className="lp-mono" style={{ color: 'var(--lp-text)', fontWeight: 600 }}>
          {formatAbbrev(m.spent, displayCurrency)}
        </span>{' '}
        spent · {Math.round(m.pctUsed)}% · committed{' '}
        <span className="lp-mono" style={{ color: 'var(--lp-text-secondary)' }}>
          {formatAbbrev(m.committed, displayCurrency)}
        </span>
      </span>

      {m.over ? (
        <span className="shrink-0" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-lp-error)' }}>
          Over budget
        </span>
      ) : null}

      {/* vs Committed — actuals vs what you committed to. Distinct from the
          grid's "Variance" (actuals vs estimate) so one word doesn't name two
          metrics. Inline, end of the row. */}
      <span
        className="lp-mono inline-flex shrink-0 items-center gap-1 whitespace-nowrap"
        title={varianceOver ? 'over committed' : 'under committed'}
        style={{ fontSize: '13px', fontWeight: 700, color: varianceColor }}
      >
        <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--lp-text-tertiary)' }}>
          vs Committed
        </span>
        <VarianceIcon className="h-3.5 w-3.5" aria-hidden />
        {formatAbbrev(Math.abs(m.variance), displayCurrency)}
      </span>
    </div>
  );
}

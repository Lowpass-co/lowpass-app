/* ============================================
   LOWPASS — Burn Rate Chart (Phase B budget redesign)

   Pure-SVG bar chart showing daily/weekly spend across the tour with
   phase boundaries marked. Bars within the active phase render in
   brand orange; other phases render muted. Hovering shows a peak-day
   tooltip.

   Buckets are computed by the caller (server) — this component is
   presentational. Dataset shape:
     {
       buckets: [{ key: 'YYYY-MM-DD', amount: 0..N }, ...],
       phaseBoundaries: [{ key, label, startIso }],
       activePhaseKey: 'show-days' | null,
     }

   No chart library; the audit (BUDGET_REDESIGN_AUDIT.md §7) chose
   hand-rolled SVG.
   ============================================ */

'use client';

import { useMemo, useState } from 'react';
import type { TourPhaseKey } from '@/server/budget/computeTourPhases';

export type BurnBucket = {
  /** YYYY-MM-DD for daily, or ISO week for weekly. */
  key: string;
  /** Sum of actual_cost on this bucket, in tour currency. */
  amount: number;
};

export type BurnPhaseBoundary = {
  key: TourPhaseKey;
  label: string;
  startIso: string;
};

export type BurnRateChartProps = {
  buckets: BurnBucket[];
  phaseBoundaries: BurnPhaseBoundary[];
  activePhaseKey: TourPhaseKey | null;
  /** ISO 4217 currency code for tooltip / peak label. Default GBP. */
  currency?: string;
};

function abbreviate(value: number, currency: string): string {
  const sym: Record<string, string> = { GBP: '£', USD: '$', EUR: '€' };
  const s = sym[currency.toUpperCase()] ?? `${currency} `;
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${s}${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${s}${(value / 1_000).toFixed(1)}K`;
  return `${s}${Math.round(value)}`;
}

function formatBucketKey(key: string): string {
  // Daily key → "Mar 15"; weekly key (YYYY-Www) → "W12 ’26".
  if (/^\d{4}-W\d{1,2}$/.test(key)) return key.replace('-W', ' W');
  const d = new Date(`${key}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export function BurnRateChart({
  buckets,
  phaseBoundaries,
  activePhaseKey,
  currency = 'GBP',
}: BurnRateChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const { peak, peakIndex } = useMemo(() => {
    let peak = 0;
    let peakIndex = -1;
    buckets.forEach((b, i) => {
      if (b.amount > peak) {
        peak = b.amount;
        peakIndex = i;
      }
    });
    return { peak, peakIndex };
  }, [buckets]);

  // Map each bucket to its phase. We resolve by walking the
  // phaseBoundaries in order and picking the latest one whose
  // startIso <= bucket.key. (Buckets always sort ascending.)
  const phaseForBucket = useMemo(() => {
    const sorted = [...phaseBoundaries].sort((a, b) =>
      a.startIso.localeCompare(b.startIso),
    );
    return buckets.map((b) => {
      let cur: TourPhaseKey | null = null;
      for (const p of sorted) {
        if (p.startIso <= b.key) cur = p.key;
        else break;
      }
      return cur;
    });
  }, [buckets, phaseBoundaries]);

  // SVG viewBox uses a fixed coordinate space; the rendered size is
  // controlled via CSS (width:100% height:240px).
  const VIEW_W = 800;
  const VIEW_H = 240;
  const PADDING_X = 24;
  const PADDING_TOP = 16;
  const PADDING_BOTTOM = 28;
  const chartW = VIEW_W - PADDING_X * 2;
  const chartH = VIEW_H - PADDING_TOP - PADDING_BOTTOM;

  const slot = buckets.length > 0 ? chartW / buckets.length : chartW;
  const barW = Math.max(2, slot * 0.7);

  return (
    <div
      className="flex flex-col gap-4 rounded-xl border p-4"
      style={{
        borderColor: 'var(--lp-border)',
        background: 'var(--lp-surface)',
      }}
    >
      <div className="flex items-baseline justify-between">
        <h3
          style={{
            color: 'var(--lp-text-tertiary)',
            fontSize: 'var(--lp-text-xs)',
            fontWeight: 'var(--lp-weight-semibold)',
            letterSpacing: 'var(--lp-tracking-caps)',
            textTransform: 'uppercase',
          }}
        >
          Burn rate · daily spend
        </h3>
        {peak > 0 && peakIndex >= 0 ? (
          <span
            className="text-xs"
            style={{ color: 'var(--lp-text-tertiary)' }}
          >
            Peak {abbreviate(peak, currency)} · {formatBucketKey(buckets[peakIndex].key)}
          </span>
        ) : null}
      </div>

      <div className="relative">
        <svg
          width="100%"
          height={VIEW_H}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Daily burn rate"
        >
          {/* Phase boundary verticals */}
          {phaseBoundaries.map((p, i) => {
            const idx = buckets.findIndex((b) => b.key >= p.startIso);
            if (idx < 0 || buckets.length === 0) return null;
            const x = PADDING_X + idx * slot;
            return (
              <g key={`boundary-${p.key}-${i}`}>
                <line
                  x1={x}
                  x2={x}
                  y1={PADDING_TOP}
                  y2={PADDING_TOP + chartH}
                  stroke="var(--lp-border)"
                  strokeDasharray="3 3"
                />
                <text
                  x={x + 4}
                  y={PADDING_TOP + 12}
                  fontSize={10}
                  fill="var(--lp-text-tertiary)"
                  fontFamily="var(--font-sans)"
                >
                  {p.label.toUpperCase()}
                </text>
              </g>
            );
          })}

          {/* Bars */}
          {buckets.map((b, i) => {
            const h = peak > 0 ? (b.amount / peak) * chartH : 0;
            const x = PADDING_X + i * slot + (slot - barW) / 2;
            const y = PADDING_TOP + chartH - h;
            const phaseKey = phaseForBucket[i];
            const isActivePhase =
              activePhaseKey === null
                ? phaseKey !== null
                : phaseKey === activePhaseKey;
            const isHover = hoverIndex === i;
            const fill = isActivePhase
              ? 'var(--color-lp-orange)'
              : 'var(--lp-text-tertiary)';
            const opacity = activePhaseKey === null
              ? 1
              : isActivePhase
                ? 1
                : 0.35;

            return (
              <rect
                key={`bar-${b.key}-${i}`}
                x={x}
                y={y}
                width={barW}
                height={Math.max(0, h)}
                fill={fill}
                opacity={isHover ? 1 : opacity}
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() =>
                  setHoverIndex((cur) => (cur === i ? null : cur))
                }
                style={{ transition: 'opacity 100ms ease' }}
              />
            );
          })}

          {/* Baseline */}
          <line
            x1={PADDING_X}
            x2={PADDING_X + chartW}
            y1={PADDING_TOP + chartH}
            y2={PADDING_TOP + chartH}
            stroke="var(--lp-border)"
          />
        </svg>

        {/* Hover tooltip — positioned absolutely above the chart in DOM
            so it doesn't clip on the right edge. */}
        {hoverIndex !== null && buckets[hoverIndex] ? (
          <div
            className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full rounded-md border px-3 py-1.5 text-xs whitespace-nowrap"
            style={{
              borderColor: 'var(--lp-border)',
              background: 'var(--lp-surface)',
              color: 'var(--lp-text)',
              boxShadow: 'var(--lp-shadow-md)',
            }}
            role="tooltip"
          >
            <div style={{ color: 'var(--lp-text-tertiary)' }}>
              {formatBucketKey(buckets[hoverIndex].key)}
            </div>
            <div className="mt-0.5 tabular-nums">
              {abbreviate(buckets[hoverIndex].amount, currency)}
            </div>
          </div>
        ) : null}
      </div>

      {buckets.length === 0 ? (
        <p
          className="text-sm"
          style={{ color: 'var(--lp-text-tertiary)' }}
        >
          No spend recorded for this tour yet.
        </p>
      ) : null}
    </div>
  );
}

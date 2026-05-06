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

/** Sprint 7 §1.D — pure helper. Decides which phase-boundary
 *  text labels to render. Drops a label whose x position is
 *  within 56px (viewBox units) of the previous drawn label.
 *  Lives at file scope so the running `lastX` reassignment is in
 *  a plain JS function, not in a React render or hook body —
 *  React 19's compiler rejects in-render variable reassignment. */
function computeLabelVisibility(
  boundaries: BurnPhaseBoundary[],
  buckets: BurnBucket[],
  paddingX: number,
  slot: number,
): boolean[] {
  let lastX = -Infinity;
  return boundaries.map((p) => {
    const idx = buckets.findIndex((b) => b.key >= p.startIso);
    if (idx < 0 || buckets.length === 0) return false;
    const x = paddingX + idx * slot;
    if (x - lastX >= 56) {
      lastX = x;
      return true;
    }
    return false;
  });
}

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

  // F2.1 round 2: tighter sizing. The X2 attempt capped barW but the
  // CHART HEIGHT (240px viewBox + container that filled its grid cell)
  // still produced a tall single-bar render that read as a giant
  // block. Cap container height at 180px AND make slot/bar widths
  // proportional in real pixels rather than scaling with bucket count.
  // For 1-bucket datasets we pad the X-axis with empty slots so the
  // visible bar sits at a sensible proportion of the chart width.
  const PADDING_X = 16;
  const PADDING_TOP = 12;
  const PADDING_BOTTOM = 24;
  const VIEW_H = 180;
  const SLOT_W = 14;
  const MIN_VIEW_W = 320;
  // Pad sparse datasets out to at least 14 slots so a 1-bucket render
  // doesn't dominate. Logical buckets stay at the true count for the
  // hover/peak/iteration logic — only the slot count expands.
  const slotCount = Math.max(buckets.length, 14);
  const VIEW_W = Math.max(
    MIN_VIEW_W,
    PADDING_X * 2 + slotCount * SLOT_W,
  );
  const chartW = VIEW_W - PADDING_X * 2;
  const chartH = VIEW_H - PADDING_TOP - PADDING_BOTTOM;

  const slot = chartW / slotCount;
  // Bar width capped at 10px (viewBox units) so dense datasets stay
  // readable; min 2px so very long tours don't collapse.
  const barW = Math.min(10, Math.max(2, slot * 0.6));

  // Sprint 7 §1.D — decide which phase boundary text labels to
  // render. Labels collide when phases are tightly spaced (short
  // tours); we drop a label whose x is within 56px (viewBox
  // units) of the previous drawn one. The vertical line itself
  // is always drawn — it's narrow enough not to overlap visually.
  // The decision logic lives in computeLabelVisibility (file-
  // scope, below) so the running `lastX` reassignment is in a
  // plain JS function, not inside a React render or hook body
  // (React 19's compiler rejects in-render variable reassignment).
  const boundaryLabelVisibility = useMemo<boolean[]>(
    () =>
      computeLabelVisibility(
        phaseBoundaries,
        buckets,
        PADDING_X,
        slot,
      ),
    [phaseBoundaries, buckets, slot],
  );

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

      <div
        className="relative overflow-x-auto"
        style={{ maxHeight: 200 }}
      >
        <svg
          width="100%"
          height={VIEW_H}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="xMinYMid meet"
          role="img"
          aria-label="Daily burn rate"
          style={{ display: 'block', maxHeight: 180 }}
        >
          {/* Phase boundary verticals
              Sprint 7 §1.D — labels can collide when phases are
              close together (short tours). Truncate to 8 chars +
              ellipsis, and skip a label whose x is within 56px
              of the previous drawn label. The vertical line is
              still drawn (it's narrow, doesn't overlap); only
              the text label is suppressed for the colliding
              boundary. The visibility decisions are computed in
              boundaryLabelVisibility (useMemo above) so the
              loop's running lastX doesn't mutate during render
              (React 19 compiler restriction). */}
          {phaseBoundaries.map((p, i) => {
            const idx = buckets.findIndex((b) => b.key >= p.startIso);
            if (idx < 0 || buckets.length === 0) return null;
            const x = PADDING_X + idx * slot;
            const showLabel = boundaryLabelVisibility[i] ?? false;
            const truncated =
              p.label.length > 8
                ? `${p.label.slice(0, 8)}…`
                : p.label;
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
                {showLabel ? (
                  <text
                    x={x + 4}
                    y={PADDING_TOP + 12}
                    fontSize={10}
                    fill="var(--lp-text-tertiary)"
                    fontFamily="var(--font-sans)"
                  >
                    {truncated.toUpperCase()}
                  </text>
                ) : null}
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

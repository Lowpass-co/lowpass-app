/* ============================================
   LOWPASS — Macro Allocation Donut (Phase B budget redesign)

   Pure-SVG donut chart with center total + legend. No chart library;
   the audit (BUDGET_REDESIGN_AUDIT.md §7) resolved the spec
   contradiction by hand-rolling. Each segment is a stroked arc; the
   center label shows abbreviated total spent; the legend below shows
   colour swatch + category name + percentage.

   Brand palette pulls from --color-lp-day-* tokens (existing 8-colour
   set used elsewhere in the app), so adding a new --color-lp-cat-*
   token series isn't necessary for v1.
   ============================================ */

'use client';

import { useMemo, useState } from 'react';

// Order matters — we cycle through this list in iteration order. Pulled
// from the existing day-type palette in globals.css so the page reads
// as one visual system.
const SEGMENT_TOKENS: string[] = [
  'var(--color-lp-day-show)',
  'var(--color-lp-day-travel)',
  'var(--color-lp-day-rehearsal)',
  'var(--color-lp-day-press)',
  'var(--color-lp-day-radio)',
  'var(--color-lp-day-tv)',
  'var(--color-lp-day-festival)',
  'var(--color-lp-day-off)',
];

export type AllocationSegment = {
  /** Display label, e.g. "Production". */
  label: string;
  /** Sum of actual_cost for this category, in tour currency. */
  amount: number;
};

export type MacroAllocationDonutProps = {
  segments: AllocationSegment[];
  /** ISO 4217 currency code for the center total label. Default GBP. */
  currency?: string;
  /** Total displayed at the center; defaults to sum of segments. */
  totalLabel?: string;
};

/** Tight currency abbreviation: £42K, $1.2M, etc. */
function abbreviate(value: number, currency: string): string {
  const sym: Record<string, string> = { GBP: '£', USD: '$', EUR: '€' };
  const s = sym[currency.toUpperCase()] ?? `${currency} `;
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${s}${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${s}${Math.round(value / 1_000)}K`;
  return `${s}${Math.round(value)}`;
}

export function MacroAllocationDonut({
  segments,
  currency = 'GBP',
  totalLabel,
}: MacroAllocationDonutProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const { total, slices } = useMemo(() => {
    const total = segments.reduce((sum, s) => sum + Math.max(0, s.amount), 0);
    if (total <= 0) {
      return { total: 0, slices: [] as Array<AllocationSegment & { start: number; end: number; pct: number; color: string }> };
    }
    let cursor = 0;
    const slices = segments
      .filter((s) => s.amount > 0)
      .map((s, i) => {
        const pct = (s.amount / total) * 100;
        const start = cursor;
        cursor += pct;
        return {
          ...s,
          start,
          end: cursor,
          pct,
          color: SEGMENT_TOKENS[i % SEGMENT_TOKENS.length],
        };
      });
    return { total, slices };
  }, [segments]);

  // X2.2 fix: previous version pinned the donut at 200×200px inside a
  // grid cell that gave it ~1/3 of the panel width — the result was a
  // tiny donut floating in dead space. Now the SVG uses viewBox + a
  // max-w cap so it scales up with the container but never balloons
  // beyond a sensible reading size on huge viewports.
  const VIEWBOX_SIZE = 200;
  const stroke = 28;
  const radius = (VIEWBOX_SIZE - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      className="flex flex-col gap-4 rounded-xl border p-4"
      style={{
        borderColor: 'var(--lp-border)',
        background: 'var(--lp-surface)',
      }}
    >
      <div>
        <h3
          style={{
            color: 'var(--lp-text-tertiary)',
            fontSize: 'var(--lp-text-xs)',
            fontWeight: 'var(--lp-weight-semibold)',
            letterSpacing: 'var(--lp-tracking-caps)',
            textTransform: 'uppercase',
          }}
        >
          Macro allocation
        </h3>
      </div>

      <div className="flex items-center justify-center">
        {/* F2.2 round 2: previous attempt used a percentage-width
            wrapper with aspect-ratio 1:1, which let the donut grow
            with the column width — Adam's screenshot still showed it
            huge in a wide grid cell. Lock to an explicit 200×200 box
            and centre it; the legend stacks below as a separate flex
            item so it never inflates the donut. */}
        <div
          className="relative"
          style={{ width: 200, height: 200 }}
        >
          <svg
            width={200}
            height={200}
            viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
            className="-rotate-90"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden
          >
            {/* Track ring — also serves as the empty state when total = 0. */}
            <circle
              cx={VIEWBOX_SIZE / 2}
              cy={VIEWBOX_SIZE / 2}
              r={radius}
              fill="none"
              stroke="var(--lp-border)"
              strokeWidth={stroke}
            />
            {slices.map((slice, i) => {
              const dash = (circumference * slice.pct) / 100;
              const offset = -((circumference * slice.start) / 100);
              const isHover = hoverIndex === i;
              return (
                <circle
                  key={`${slice.label}-${i}`}
                  cx={VIEWBOX_SIZE / 2}
                  cy={VIEWBOX_SIZE / 2}
                  r={radius}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth={isHover ? stroke + 2 : stroke}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={offset}
                  style={{ transition: 'stroke-width 150ms ease' }}
                  onMouseEnter={() => setHoverIndex(i)}
                  onMouseLeave={() =>
                    setHoverIndex((cur) => (cur === i ? null : cur))
                  }
                />
              );
            })}
          </svg>
          {/* Center label — pseudo-3D over the SVG. Uses an absolute
              fill so it tracks the donut at any size. */}
          <div
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
            aria-hidden
          >
            <span
              style={{
                color: 'var(--lp-text)',
                fontSize: 'var(--lp-text-2xl)',
                fontWeight: 'var(--lp-weight-semibold)',
                lineHeight: 'var(--lp-leading-tight)',
              }}
            >
              {totalLabel ?? abbreviate(total, currency)}
            </span>
            <span
              className="mt-1"
              style={{
                color: 'var(--lp-text-tertiary)',
                fontSize: 'var(--lp-text-2xs)',
                fontWeight: 'var(--lp-weight-medium)',
                letterSpacing: 'var(--lp-tracking-caps)',
                textTransform: 'uppercase',
              }}
            >
              Total spent
            </span>
          </div>
        </div>
      </div>

      <ul className="space-y-1.5">
        {slices.length === 0 ? (
          <li
            className="text-sm"
            style={{ color: 'var(--lp-text-tertiary)' }}
          >
            No spend recorded yet.
          </li>
        ) : (
          slices.map((slice, i) => {
            const isHover = hoverIndex === i;
            return (
              <li
                key={`${slice.label}-legend-${i}`}
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() =>
                  setHoverIndex((cur) => (cur === i ? null : cur))
                }
                className="flex items-center gap-2 rounded-md px-2 py-1 transition-colors"
                style={{
                  background: isHover
                    ? 'var(--lp-surface-hover)'
                    : 'transparent',
                  cursor: 'default',
                }}
              >
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: slice.color }}
                />
                <span
                  className="min-w-0 flex-1 truncate text-sm"
                  style={{ color: 'var(--lp-text)' }}
                >
                  {slice.label}
                </span>
                <span
                  className="shrink-0 text-sm tabular-nums"
                  style={{ color: 'var(--lp-text-secondary)' }}
                >
                  {slice.pct.toFixed(1)}%
                </span>
                <span
                  className="shrink-0 text-sm tabular-nums"
                  style={{ color: 'var(--lp-text-tertiary)' }}
                >
                  {abbreviate(slice.amount, currency)}
                </span>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

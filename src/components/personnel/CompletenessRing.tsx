'use client';

/* ============================================
   LOWPASS — <CompletenessRing> (Sprint 9 §13.B.2)

   Small donut + percentage rendered next to each personnel row
   in the workspace grid. Color thresholds per spec:
     - Red    < 30%
     - Amber  30–70%
     - Green  > 70%

   The ring is presentation-only — completeness scoring lives in
   src/lib/personnel-extended-profile.ts (computeCompleteness).
   The grid passes the result down + handles click-through to
   the slide-over scrolled to the first missing section.

   Per Q5: the percentage already reflects re-normalisation for
   non-admin viewers (Pay weight excluded). The ring just
   renders whatever number the caller computed.
   ============================================ */

import type { ReactNode } from 'react';

interface CompletenessRingProps {
  percent: number;
  /** Labels of missing sections — rendered as a tooltip + the
   *  list of "to-do" items the operator can click through to. */
  missingLabels: string[];
  /** Optional click handler. Wires the spec's
   *  "Click → opens detail panel scrolled to first missing
   *  section" behaviour at the call site. */
  onClick?: () => void;
  /** Optional override on size. Default 28px. */
  size?: number;
  /** Optional inline label rendered to the right of the ring.
   *  Defaults to the percentage. Pass null to hide it. */
  label?: ReactNode | null;
  /** Optional aria-label override. Defaults to a description
   *  including the percent. */
  ariaLabel?: string;
}

function colorForPercent(percent: number): string {
  if (percent < 30) return 'var(--color-lp-error)';
  if (percent <= 70) return 'var(--color-lp-warning, #c97a1d)';
  return 'var(--color-lp-success, #1f8a4c)';
}

export function CompletenessRing({
  percent,
  missingLabels,
  onClick,
  size = 28,
  label,
  ariaLabel,
}: CompletenessRingProps) {
  // SVG geometry: stroke runs along a circle inscribed in the
  // box. Radius = (size / 2) - stroke / 2 so the stroke doesn't
  // clip at the edges.
  const stroke = Math.max(2, Math.round(size * 0.12));
  const radius = size / 2 - stroke / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  const dash = (clamped / 100) * circumference;
  const color = colorForPercent(clamped);
  const tooltip =
    missingLabels.length > 0
      ? `${clamped}% complete — missing: ${missingLabels.join(', ')}`
      : `${clamped}% complete`;
  const aria = ariaLabel ?? tooltip;

  const visualLabel = label === null ? null : (label ?? `${clamped}%`);

  const ring = (
    <span
      aria-hidden
      style={{
        position: 'relative',
        display: 'inline-flex',
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ display: 'block' }}
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="var(--lp-border)"
          strokeWidth={stroke}
          fill="none"
        />
        {/* Progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          // Start at 12 o'clock and run clockwise.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
    </span>
  );

  const wrapperStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  };

  if (onClick) {
    return (
      <button
        type="button"
        onClick={(e) => {
          // Keep the click from bubbling to the row's
          // onRowClick handler — the ring is its own click
          // target.
          e.stopPropagation();
          onClick();
        }}
        title={tooltip}
        aria-label={aria}
        className="btn-transition"
        style={{
          ...wrapperStyle,
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: 'var(--lp-text)',
        }}
      >
        {ring}
        {visualLabel !== null ? (
          <span
            style={{
              fontSize: 'var(--lp-text-xs)',
              fontWeight: 'var(--lp-weight-medium)',
              color,
            }}
          >
            {visualLabel}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <span style={wrapperStyle} title={tooltip} aria-label={aria}>
      {ring}
      {visualLabel !== null ? (
        <span
          style={{
            fontSize: 'var(--lp-text-xs)',
            fontWeight: 'var(--lp-weight-medium)',
            color,
          }}
        >
          {visualLabel}
        </span>
      ) : null}
    </span>
  );
}

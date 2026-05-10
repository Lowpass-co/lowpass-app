'use client';

/* ============================================
   LOWPASS — <CompletenessRing> (Sprint 9 §13.B.2 + §14.8 + §14.9)

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

   Sprint 9 §14.8 — switched the native title="" tooltip to the
   shared <Tooltip> primitive so the hover surface matches the
   rest of the app (dark panel, rounded, structured content
   instead of OS-default browser chrome).

   Sprint 9 §14.9 — added a discoverability cue when the ring
   is interactive: cursor: pointer (was already present), a
   subtle scale-on-hover (1.0 → 1.06 over 120ms), and a
   "Click to fix" suffix in the tooltip body. The whole row
   click handling moved to the data-table row click in the
   parent — this component just owns its own ring click.
   ============================================ */

import { useState, type ReactNode } from 'react';
import { Tooltip } from '@/components/ui/Tooltip';

interface CompletenessRingProps {
  percent: number;
  /** Labels of missing sections — rendered inside the tooltip
   *  + (when present) suffixed with a "Click to fix" hint. */
  missingLabels: string[];
  /** Optional click handler. When provided, the ring becomes a
   *  discoverable button: cursor: pointer + hover scale +
   *  tooltip "Click to fix" hint. */
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
  const [hovered, setHovered] = useState(false);

  const summary = `${clamped}% complete`;
  // Sprint 9 §14.8 — structured tooltip body. Lists missing
  // sections (capped at 6 to avoid an unwieldy popover) and
  // surfaces the click affordance when the ring is clickable.
  const tooltipNode: ReactNode = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontWeight: 600 }}>{summary}</div>
      {missingLabels.length > 0 ? (
        <div style={{ opacity: 0.85 }}>
          Missing: {missingLabels.slice(0, 6).join(', ')}
          {missingLabels.length > 6 ? ` +${missingLabels.length - 6} more` : ''}
        </div>
      ) : null}
      {onClick ? (
        <div style={{ marginTop: 2, opacity: 0.7 }}>Click to fix →</div>
      ) : null}
    </div>
  );
  const aria =
    ariaLabel ??
    (missingLabels.length > 0
      ? `${summary} — missing: ${missingLabels.join(', ')}`
      : summary);

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
        transform: hovered && onClick ? 'scale(1.06)' : 'scale(1)',
        transition: 'transform 120ms ease-out',
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

  const inner = onClick ? (
    <button
      type="button"
      onClick={(e) => {
        // Keep the click from bubbling to the row's
        // onRowClick handler — the ring is its own click target
        // (the parent wires the row click to the same slide-
        // over but without a scrollToSection target).
        e.stopPropagation();
        onClick();
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
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
  ) : (
    <span style={wrapperStyle} aria-label={aria}>
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

  return <Tooltip content={tooltipNode}>{inner}</Tooltip>;
}

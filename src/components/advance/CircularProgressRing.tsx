/* ============================================
   LOWPASS — Advance · Circular progress ring (Variant parity §A)

   Pure SVG ring shown on the right of the show-header progress
   strip. Mono-numeric percent label centred. No animation —
   value is static per render.
   ============================================ */

interface CircularProgressRingProps {
  /** 0–100. Clamped server-side. */
  percent: number;
  /** Outer diameter in pixels. Default 64. */
  size?: number;
  /** Stroke width. Default 6. */
  strokeWidth?: number;
}

export function CircularProgressRing({
  percent,
  size = 64,
  strokeWidth = 6,
}: CircularProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);
  const cx = size / 2;
  const cy = size / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${clamped}% complete`}
    >
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="var(--lp-border-strong)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="var(--color-lp-orange)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--lp-mono-font)"
        fontSize={size <= 48 ? 11 : 14}
        fontWeight={500}
        fill="var(--lp-text)"
      >
        {clamped}%
      </text>
    </svg>
  );
}

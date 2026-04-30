/* ============================================
   LOWPASS — Tour Primary CTA Card (Tour Hub X3)

   The big Advance + Budget cards on the Tour Hub. 2px brand-orange
   border, 4% orange-tinted background, big metric, sub-line,
   capped progress bar, "Open … →" CTA. Whole card is a Link.
   ============================================ */

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export type TourPrimaryCTACardProps = {
  label: string;
  /** Big metric, e.g. "12 / 28" or "£42K / £85K". */
  primaryMetric: string;
  /** Below the metric, e.g. "shows complete · 43%" or "spent · 49%". */
  subLabel: string;
  /** 0–100. */
  progressPercent: number;
  /** Bar fill colour. Defaults to brand orange; Budget overrides
   *  based on burn rate (green / amber / red). */
  progressColor?: string;
  /** Cap the bar fill at 100% so over-budget tours don't bleed. */
  barWidthPercent?: number;
  ctaText: string;
  href: string;
};

export function TourPrimaryCTACard({
  label,
  primaryMetric,
  subLabel,
  progressPercent,
  progressColor = 'var(--color-lp-orange)',
  barWidthPercent,
  ctaText,
  href,
}: TourPrimaryCTACardProps) {
  const fillPct = Math.max(0, Math.min(100, barWidthPercent ?? progressPercent));
  return (
    <Link
      href={href}
      className="lp-tour-cta group flex flex-col gap-3 rounded-lg p-5 transition-colors"
      style={{
        // F2.5 round 2: softened from "2px solid var(--color-lp-orange)"
        // to a 1px tinted border (35% mix with --lp-border). The CTA
        // text below stays full brand orange, so the card still reads
        // as a primary action without "screaming". Hover intensifies
        // the border to full orange via the lp-tour-cta:hover style
        // emitted in globals (no-op until the global ships, harmless
        // selector otherwise).
        border:
          '1px solid color-mix(in srgb, var(--color-lp-orange) 35%, var(--lp-border))',
        background: 'color-mix(in srgb, var(--color-lp-orange) 4%, transparent)',
      }}
    >
      <div
        style={{
          color: 'var(--lp-text-tertiary)',
          fontSize: 'var(--lp-text-sm)',
          fontWeight: 'var(--lp-weight-medium)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: 'var(--lp-text)',
          fontSize: 'var(--lp-text-2xl)',
          fontWeight: 'var(--lp-weight-medium)',
          lineHeight: 'var(--lp-leading-tight)',
        }}
      >
        {primaryMetric}
      </div>
      <div
        style={{
          color: 'var(--lp-text-secondary)',
          fontSize: 'var(--lp-text-sm)',
        }}
      >
        {subLabel}
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: 'color-mix(in srgb, var(--lp-border) 80%, transparent)' }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{
            width: `${fillPct}%`,
            background: progressColor,
          }}
        />
      </div>
      <div
        className="mt-1 inline-flex items-center gap-1.5 transition-transform group-hover:translate-x-0.5"
        style={{
          color: 'var(--color-lp-orange)',
          fontSize: 'var(--lp-text-base)',
          fontWeight: 'var(--lp-weight-medium)',
        }}
      >
        {ctaText}
        <ArrowRight className="h-4 w-4" />
      </div>
    </Link>
  );
}

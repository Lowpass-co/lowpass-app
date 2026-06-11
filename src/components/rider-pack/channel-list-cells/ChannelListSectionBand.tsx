'use client';

/* ============================================
   LOWPASS — <ChannelListSectionBand> (§CL-FIX-5a)

   Polished section divider for the channel-list editor's three
   logical zones (Inputs · Outputs · Inventory). Replaces the
   prior weak dividers (smoke CHL-06). Full-width band with a
   brand-orange left edge accent + subtle orange tint + an
   uppercase tracking label and optional count pill, matching
   the Advance section-header language (border-l accent +
   uppercase tracking) without the fragile cross-section sticky
   behaviour (deferred to Phase 4 with the glass-hero header,
   when the real operations page defines the scroll container).
   ============================================ */

import type { ReactNode } from 'react';

interface ChannelListSectionBandProps {
  label: string;
  /** Optional count pill (e.g. number of input / output rows). */
  count?: number;
  /** Optional right-aligned actions (e.g. "+ Add output"). */
  actions?: ReactNode;
}

export function ChannelListSectionBand({ label, count, actions }: ChannelListSectionBandProps) {
  return (
    <div
      className="flex items-center justify-between gap-2 px-3 py-2"
      style={{
        borderLeft: '3px solid var(--lp-orange)',
        borderBottom: '1px solid var(--lp-border)',
        background: 'color-mix(in srgb, var(--lp-orange) 5%, var(--lp-panel))',
      }}
    >
      <h4
        className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider"
        style={{ color: 'var(--lp-text-secondary)' }}
      >
        <span>{label}</span>
        {typeof count === 'number' ? (
          <span
            className="inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] tabular-nums"
            style={{
              background: 'color-mix(in srgb, var(--lp-orange) 14%, transparent)',
              color: 'var(--lp-text)',
            }}
          >
            {count}
          </span>
        ) : null}
      </h4>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

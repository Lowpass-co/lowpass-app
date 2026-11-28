'use client';

/* ============================================
   LOWPASS — rental status pills (Nov 2026)

   One look for a job's status and a stock item's status, from tokens only —
   the old STATUS_STYLES / INVENTORY_STATUS_STYLES maps were hardcoded hex.
   The tint is the tone at 12% over transparent (color-mix), so it reads on
   light and dark alike.
   ============================================ */

import type { ReactNode } from 'react';

export type PillTone = 'neutral' | 'accent' | 'success' | 'info' | 'violet' | 'warning';

const TONE: Record<PillTone, string> = {
  neutral: 'var(--lp-text-tertiary)',
  accent: 'var(--lp-orange)',
  success: 'var(--color-lp-success)',
  info: 'var(--color-lp-info)',
  violet: 'var(--lp-violet)',
  warning: 'var(--color-lp-warning)',
};

export const JOB_STATUS_TONE: Record<string, PillTone> = {
  draft: 'neutral',
  confirmed: 'success',
  invoiced: 'info',
  completed: 'violet',
};

export const STOCK_STATUS_TONE: Record<string, PillTone> = {
  available: 'success',
  in_use: 'accent',
  maintenance: 'warning',
  retired: 'neutral',
};

export function StatusPill({ tone, children, title }: { tone: PillTone; children: ReactNode; title?: string }) {
  const c = TONE[tone];
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full"
      style={{
        padding: '2px 10px 2px 8px',
        fontSize: 'var(--lp-text-xs)',
        fontWeight: 'var(--lp-weight-medium)',
        color: `color-mix(in srgb, ${c} 82%, var(--lp-text))`,
        backgroundColor: `color-mix(in srgb, ${c} 12%, transparent)`,
      }}
    >
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: c }} />
      {children}
    </span>
  );
}

'use client';

/* ============================================
   LOWPASS — ConflictBanner (Sprint 9 §6)

   Inline warning rendered under a personnel row when the
   /conflicts API returns one or more cross-tour assignments
   overlapping with this assignment's window. Shows up to 2
   conflicts inline; collapses to a "view all" disclosure if 3+.
   ============================================ */

import { useState } from 'react';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import type { ConflictRow } from '@/lib/personnel/types';

function formatRange(start: string | null, end: string | null): string {
  if (!start && !end) return '';
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  if (start && end) {
    return start === end ? fmt(start) : `${fmt(start)}–${fmt(end)}`;
  }
  return fmt((start ?? end) as string);
}

interface ConflictBannerProps {
  personName: string;
  conflicts: ConflictRow[];
}

export function ConflictBanner({ personName, conflicts }: ConflictBannerProps) {
  const [expanded, setExpanded] = useState(false);
  if (conflicts.length === 0) return null;

  const inline = expanded ? conflicts : conflicts.slice(0, 2);
  const hasMore = conflicts.length > 2;

  return (
    <div
      role="alert"
      style={{
        marginTop: 'var(--lp-space-1)',
        padding: 'var(--lp-space-2) var(--lp-space-3)',
        fontSize: 'var(--lp-text-xs)',
        color: 'var(--lp-text)',
        background: 'color-mix(in srgb, var(--color-lp-orange) 6%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-lp-orange) 30%, transparent)',
        borderRadius: 'var(--lp-radius-md)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      {inline.map((c, i) => (
        <div
          key={`${c.tour_id}-${c.start_date ?? ''}-${i}`}
          className="flex items-start"
          style={{ gap: 6 }}
        >
          <AlertTriangle
            size={12}
            strokeWidth={2.4}
            style={{
              color: 'var(--color-lp-orange)',
              flexShrink: 0,
              marginTop: 2,
            }}
            aria-hidden
          />
          <span style={{ flex: 1, minWidth: 0, lineHeight: 1.5 }}>
            <strong>{personName}</strong> is also assigned to{' '}
            <strong>{c.tour_name}</strong> as <strong>{c.role}</strong> in{' '}
            <strong>{c.workspace_name}</strong>
            {formatRange(c.start_date, c.end_date)
              ? ` on ${formatRange(c.start_date, c.end_date)}`
              : ''}
            {' '}
            <span
              style={{
                fontSize: 'var(--lp-text-2xs)',
                color: 'var(--lp-text-secondary)',
                fontStyle: 'italic',
              }}
            >
              (status: {c.status})
            </span>
          </span>
        </div>
      ))}
      {hasMore && !expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="btn-transition inline-flex items-center"
          style={{
            alignSelf: 'flex-start',
            gap: 4,
            padding: 0,
            fontSize: 'var(--lp-text-2xs)',
            fontWeight: 'var(--lp-weight-medium)',
            color: 'var(--color-lp-orange)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <ChevronDown size={10} strokeWidth={2.4} />
          View all {conflicts.length} conflicts
        </button>
      ) : null}
    </div>
  );
}

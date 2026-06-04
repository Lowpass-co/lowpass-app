'use client';

/* ============================================
   LOWPASS — <AiUsageFilters> (§AI-4)

   Month prev/next + workspace selector for the site-admin AI
   usage dashboard. Month controls are plain <Link>s (server
   navigation). The workspace <select> is client-side so it can
   router.push on change while preserving the active month.
   ============================================ */

import Link from 'next/link';
import { useRouter } from 'next/navigation';

export interface AiUsageFiltersProps {
  month: string; // YYYY-MM
  prevMonth: string; // YYYY-MM
  nextMonth: string; // YYYY-MM
  monthLabel: string; // e.g. "May 2026"
  workspaceId: string | null;
  workspaces: { id: string; name: string }[];
  /** True when nextMonth would be in the future — disable forward nav. */
  nextDisabled: boolean;
}

function hrefFor(month: string, workspaceId: string | null): string {
  const params = new URLSearchParams({ month });
  if (workspaceId) params.set('workspace', workspaceId);
  return `/admin/ai-usage?${params.toString()}`;
}

export function AiUsageFilters({
  month,
  prevMonth,
  nextMonth,
  monthLabel,
  workspaceId,
  workspaces,
  nextDisabled,
}: AiUsageFiltersProps) {
  const router = useRouter();

  const navBtnStyle: React.CSSProperties = {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--lp-text)',
    border: '1px solid var(--lp-border-strong)',
    background: 'var(--lp-surface)',
    borderRadius: 8,
    padding: '6px 10px',
    lineHeight: 1,
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1">
        <Link
          href={hrefFor(prevMonth, workspaceId)}
          className="btn-transition"
          style={navBtnStyle}
          aria-label="Previous month"
        >
          ←
        </Link>
        <span
          className="lp-mono px-2 text-center"
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--lp-text)',
            minWidth: 110,
          }}
        >
          {monthLabel}
        </span>
        {nextDisabled ? (
          <span
            aria-disabled
            style={{ ...navBtnStyle, opacity: 0.4, cursor: 'not-allowed' }}
          >
            →
          </span>
        ) : (
          <Link
            href={hrefFor(nextMonth, workspaceId)}
            className="btn-transition"
            style={navBtnStyle}
            aria-label="Next month"
          >
            →
          </Link>
        )}
      </div>

      <select
        value={workspaceId ?? ''}
        onChange={(e) => {
          const value = e.target.value || null;
          router.push(hrefFor(month, value));
        }}
        className="lp-input"
        style={{
          fontSize: '13px',
          color: 'var(--lp-text)',
          border: '1px solid var(--lp-border-strong)',
          background: 'var(--lp-surface)',
          borderRadius: 8,
          padding: '6px 10px',
        }}
        aria-label="Workspace filter"
      >
        <option value="">All workspaces</option>
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    </div>
  );
}

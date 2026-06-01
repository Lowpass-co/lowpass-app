'use client';

/* ============================================
   LOWPASS — <PageHeader> + <Toolbar> canonical chrome
   (UX Audit 2026 — reference template)

   Every workspace/product page hand-rolls its own title +
   subtitle + action-row markup with slightly different
   spacing, font sizes, and alignment. This is the single
   page-chrome template so headers are uniform + predictable:

     - title (h1) at a fixed scale + weight (skill:
       weight-hierarchy)
     - optional subtitle
     - actions slot, right-aligned (toolbar)
     - optional eyebrow (small caps label above the title,
       e.g. "Account · per-user feature")

   <Toolbar> is the thin filter/action bar used below a
   PageHeader or above a grid (search + filters + view
   controls). Consistent height + gap so toolbars line up
   across Budget / Equipment / Personnel / Operations.

   Token-clean. Responsive: actions wrap below the title on
   narrow widths.
   ============================================ */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Small uppercase label above the title. */
  eyebrow?: string;
  /** Right-aligned action controls (Button[], toggles, etc.). */
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-lp-text-tertiary">
            {eyebrow}
          </p>
        ) : null}
        {/* Canonical page-title scale: 24px / bold / display
            font / tight tracking — matches the established
            majority (Equipment, Venues, Bugs, workspace
            dashboard) so adopting PageHeader doesn't resize
            existing pages. */}
        <h1 className="font-display text-2xl font-bold leading-tight tracking-tight text-lp-text">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-lp-text-secondary">{subtitle}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

interface ToolbarProps {
  /** Left cluster — usually search + filters. */
  start?: ReactNode;
  /** Right cluster — usually view controls / density / add. */
  end?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function Toolbar({ start, end, children, className }: ToolbarProps) {
  return (
    <div
      className={cn(
        'flex min-h-9 flex-wrap items-center gap-2 border-b px-1 pb-2',
        className,
      )}
      style={{ borderColor: 'var(--lp-border)' }}
    >
      {children ?? (
        <>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{start}</div>
          <div className="flex shrink-0 items-center gap-2">{end}</div>
        </>
      )}
    </div>
  );
}

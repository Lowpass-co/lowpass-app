'use client';

/* ============================================
   LOWPASS — <ProductSubBar> (two-bar shell, Bar 2)

   Generic per-product sub-tab strip rendered directly under the top
   product bar. Same visual language as BudgetTabNav / WorkspaceTabs /
   OperationsSubNav (orange active underline, token-clean), so every
   product's Bar 2 reads identically.

   - `items`: the equal-weight tabs (left).
   - `cornerItems`: right-aligned corner destinations (e.g. Budget's
     Reports + Settings) rendered as compact icon buttons, not tabs.
   - `rightSlot`: any extra control pinned far right (e.g. a toggle).
   ============================================ */

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SubBarItem {
  key: string;
  label: string;
  href: string;
  active: boolean;
}

export interface SubBarCornerItem extends SubBarItem {
  Icon: LucideIcon;
  /** Preserve scroll on same-page (?tab=) navigations. */
  scroll?: boolean;
}

interface ProductSubBarProps {
  items: SubBarItem[];
  cornerItems?: SubBarCornerItem[];
  rightSlot?: React.ReactNode;
  /** Context-band mode — content shown left of the tabs (e.g. compact
   *  tour identity), so the sub-tabs sit WITH the product and a separate
   *  tour-header layer collapses away. */
  leftSlot?: React.ReactNode;
  ariaLabel: string;
  /** Pass false for tab strips that route via ?param= and want to keep
   *  scroll position (Budget). Defaults to true. */
  scroll?: boolean;
}

export function ProductSubBar({
  items,
  cornerItems,
  rightSlot,
  leftSlot,
  ariaLabel,
  scroll = true,
}: ProductSubBarProps) {
  return (
    <nav
      className="flex shrink-0 items-stretch gap-2 border-b px-4"
      style={{
        borderColor: 'var(--lp-border-strong)',
        background: 'var(--lp-bg)',
      }}
      aria-label={ariaLabel}
    >
      {leftSlot ? (
        <div className="flex shrink-0 items-center gap-2 pr-1">{leftSlot}</div>
      ) : null}
      <div className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            scroll={scroll}
            className={cn('btn-transition relative whitespace-nowrap px-3 py-2.5')}
            style={{
              fontSize: '13px',
              fontWeight: item.active ? 600 : 500,
              color: item.active ? 'var(--lp-text)' : 'var(--lp-text-secondary)',
            }}
            aria-current={item.active ? 'page' : undefined}
          >
            {item.label}
            {item.active ? (
              <span
                aria-hidden
                className="absolute left-2 right-2"
                style={{
                  bottom: -1,
                  height: 2,
                  background: 'var(--color-lp-orange)',
                  borderRadius: 1,
                }}
              />
            ) : null}
          </Link>
        ))}
      </div>

      {/* Right-aligned corner destinations (icons, not equal tabs). */}
      {cornerItems && cornerItems.length > 0 ? (
        <div className="flex shrink-0 items-center gap-0.5 pb-1.5 pl-2">
          {cornerItems.map((c) => (
            <Link
              key={c.key}
              href={c.href}
              scroll={c.scroll ?? scroll}
              title={c.label}
              aria-label={c.label}
              aria-current={c.active ? 'page' : undefined}
              className="btn-transition inline-flex h-8 w-8 items-center justify-center rounded-md"
              style={{
                color: c.active ? 'var(--color-lp-orange)' : 'var(--lp-text-tertiary)',
                background: c.active
                  ? 'color-mix(in srgb, var(--color-lp-orange) 10%, transparent)'
                  : 'transparent',
              }}
            >
              <c.Icon className="h-4 w-4" strokeWidth={c.active ? 2.25 : 2} />
            </Link>
          ))}
        </div>
      ) : null}

      {rightSlot ? <div className="shrink-0 pb-1.5 pl-1">{rightSlot}</div> : null}
    </nav>
  );
}

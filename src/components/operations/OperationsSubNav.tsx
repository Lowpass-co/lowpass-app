'use client';

/* ============================================
   LOWPASS — OperationsSubNav (Sprint 9 §5 + §13.C.2)

   Horizontal sub-nav under TourHeader on every Operations
   sub-page. Renders the Summary entry first, then up to 7
   fixed sub-page links:
     Summary · Personnel · Routing · Channel List · Payroll ·
     Rooming · Files · Riders

   Active link gets orange underline; others get a subtle
   hover. Links are filtered by per-resource read access —
   readonly users only see what they're granted for. Admin/
   manager pass everything.

   Sprint 9 §13.C.2 — added optional `href` override on each
   link so the Summary entry can target the tour root
   /operations/[tourId] (no trailing slug) without each call
   site special-casing it. Default behaviour
   (`/operations/${tourId}/${slug}`) is unchanged.
   ============================================ */

import Link from 'next/link';
import { useId } from 'react';
import { cn } from '@/lib/utils';

export interface OperationsSubNavLink {
  id: string;
  label: string;
  /** Path under /operations/[tourId]/. e.g. 'routing'. The
   *  Summary entry passes slug='' and an explicit `href`. */
  slug: string;
  /** Optional href override — bypasses the default
   *  `/operations/${tourId}/${slug}` construction. Used by
   *  the Summary entry to target the tour root. */
  href?: string;
  /** True when the caller has read access for this resource. */
  visible: boolean;
}

interface OperationsSubNavProps {
  tourId: string;
  /** Slug of the active sub-page. Underlined orange. */
  activeSlug: string;
  links: OperationsSubNavLink[];
}

export function OperationsSubNav({
  tourId,
  activeSlug,
  links,
}: OperationsSubNavProps) {
  const navId = useId();
  const visible = links.filter((l) => l.visible);
  if (visible.length === 0) return null;

  return (
    <nav
      aria-labelledby={navId}
      className="lp-operations-subnav"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--lp-space-1)',
        padding: '0 var(--lp-space-4)',
        borderBottom: '1px solid var(--lp-border-strong)',
        background: 'var(--lp-panel)',
        overflowX: 'auto',
      }}
    >
      <span id={navId} className="sr-only">
        Operations sub-navigation
      </span>
      {visible.map((link) => {
        const active = link.slug === activeSlug;
        return (
          <Link
            key={link.id}
            href={link.href ?? `/operations/${tourId}/${link.slug}`}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'btn-transition',
              'lp-operations-subnav-link',
              active && 'is-active',
            )}
            style={{
              position: 'relative',
              padding: '12px var(--lp-space-3)',
              fontSize: 'var(--lp-text-sm)',
              fontWeight: active
                ? 'var(--lp-weight-semibold)'
                : 'var(--lp-weight-medium)',
              color: active ? 'var(--color-lp-orange)' : 'var(--lp-text-secondary)',
              textDecoration: 'none',
              borderBottom: active
                ? '2px solid var(--color-lp-orange)'
                : '2px solid transparent',
              marginBottom: '-1px',
              whiteSpace: 'nowrap',
            }}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

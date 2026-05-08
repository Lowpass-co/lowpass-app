'use client';

/* ============================================
   LOWPASS — OperationsSubNav (Sprint 9 §5)

   Horizontal sub-nav under TourHeader on every Operations
   sub-page. Renders 7 fixed links in this order:
     Personnel · Routing · Channel List · Payroll · Rooming ·
     Files · Riders

   Active link gets orange underline; others get a subtle
   hover. Links are filtered by per-resource read access —
   readonly users only see what they're granted for. Admin/
   manager pass everything.
   ============================================ */

import Link from 'next/link';
import { useId } from 'react';
import { cn } from '@/lib/utils';

export interface OperationsSubNavLink {
  id: string;
  label: string;
  /** Path under /operations/[tourId]/. e.g. 'routing'. */
  slug: string;
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
            href={`/operations/${tourId}/${link.slug}`}
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

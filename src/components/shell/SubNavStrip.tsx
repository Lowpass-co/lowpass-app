'use client';

/* ============================================
   LOWPASS — <SubNavStrip> (Sprint 10 §1.4)

   Second-level nav strip rendered ONLY at tour scope, beneath
   the <ScopeNavStrip>. Contents depend on the active tour
   product:

     - Operations active : Summary · Personnel · Routing ·
                           Channel List · Payroll · Rooming ·
                           Files · Riders
     - Budget active     : Line items · Receipts · Payroll ·
                           Deal memos · Commissions · Summary
     - Advance active    : Setup · Fill (per-show navigation)

   Per Q5 — option (a). The layout that mounts <UnifiedTopBar>
   passes a pre-built `links` array (with `visible` per-link
   gated by canAccess). This component is a pure renderer; no
   permissions fetch here.

   Active link mirrors the Sprint 9 §5 OperationsSubNav style
   (orange underline, semibold, same height as ScopeNavStrip).
   ============================================ */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export interface SubNavLink {
  id: string;
  label: string;
  href: string;
  /** True when the caller has read access for this resource.
   *  Hidden links are filtered before render. */
  visible: boolean;
  /** Match function — receives current pathname, returns true
   *  if this link should be highlighted. */
  isActive: (pathname: string) => boolean;
}

interface SubNavStripProps {
  links: SubNavLink[];
}

export function SubNavStrip({ links }: SubNavStripProps) {
  const pathname = usePathname() ?? '';
  const visible = links.filter((l) => l.visible);
  if (visible.length === 0) return null;

  return (
    <nav
      aria-label="Sub navigation"
      className="lp-sub-nav-strip"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--lp-space-1)',
        padding: '0 var(--lp-space-4)',
        height: 40,
        background: 'var(--lp-panel)',
        borderBottom: '1px solid var(--lp-border-strong)',
        overflowX: 'auto',
      }}
    >
      {visible.map((item) => {
        const active = item.isActive(pathname);
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn('btn-transition lp-sub-nav-link', active && 'is-active')}
            style={{
              position: 'relative',
              padding: '10px var(--lp-space-3)',
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
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

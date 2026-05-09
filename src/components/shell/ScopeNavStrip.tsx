'use client';

/* ============================================
   LOWPASS — <ScopeNavStrip> (Sprint 10 §1.4)

   Top-level scope-aware nav strip rendered immediately below
   <UnifiedTopBar>. Contents depend on scope:

     - workspace : Home · Personnel · Equipment · Settings · Admin
     - artist    : Overview · Tours · Contracts · Earnings · Files
     - tour      : Operations · Budget · Advance

   Active link gets the same orange-underline treatment used
   by the existing OperationsSubNav (Sprint 9 §5).

   Workspace nav drops 'Calendar' per Sprint 10 mockup tweak
   #1 — no real surface, no clear purpose, defer to Sprint 11+.

   Admin entry on workspace scope is conditional on
   isSiteAdmin (Sprint 9 §13.A.4 pattern).
   ============================================ */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { ScopeInfo } from '@/lib/shell/scope';

interface NavItem {
  id: string;
  label: string;
  href: string;
  isActive: (pathname: string) => boolean;
}

interface ScopeNavStripProps {
  scope: ScopeInfo;
  isSiteAdmin: boolean;
}

function workspaceItems(isSiteAdmin: boolean): NavItem[] {
  const items: NavItem[] = [
    {
      id: 'home',
      label: 'Home',
      href: '/artists',
      isActive: (p) => p === '/' || p === '/artists',
    },
    {
      id: 'personnel',
      label: 'Personnel',
      href: '/personnel',
      isActive: (p) => p.startsWith('/personnel'),
    },
    {
      id: 'equipment',
      label: 'Equipment',
      href: '/equipment',
      isActive: (p) => p.startsWith('/equipment'),
    },
    {
      id: 'settings',
      label: 'Settings',
      href: '/settings',
      isActive: (p) => p.startsWith('/settings'),
    },
  ];
  if (isSiteAdmin) {
    items.push({
      id: 'admin',
      label: 'Admin',
      href: '/admin',
      isActive: (p) => p.startsWith('/admin'),
    });
  }
  return items;
}

function artistItems(artistId: string): NavItem[] {
  /* Sprint 10 §1.4 — artist-scope nav. Overview = the
     artist hub root. Other entries are stubs initially per
     Q4: "Coming soon" placeholder pages exist; nav links
     work but bodies are deferred to Sprint 11+. */
  const base = `/artists/${artistId}`;
  return [
    {
      id: 'overview',
      label: 'Overview',
      href: base,
      isActive: (p) => p === base,
    },
    {
      id: 'tours',
      label: 'Tours',
      href: `${base}/tours`,
      isActive: (p) => p.startsWith(`${base}/tours`),
    },
    {
      id: 'contracts',
      label: 'Contracts',
      href: `${base}/contracts`,
      isActive: (p) => p.startsWith(`${base}/contracts`),
    },
    {
      id: 'earnings',
      label: 'Earnings',
      href: `${base}/earnings`,
      isActive: (p) => p.startsWith(`${base}/earnings`),
    },
    {
      id: 'files',
      label: 'Files',
      href: `${base}/files`,
      isActive: (p) => p.startsWith(`${base}/files`),
    },
  ];
}

function tourItems(tourId: string): NavItem[] {
  return [
    {
      id: 'operations',
      label: 'Operations',
      href: `/operations/${tourId}`,
      isActive: (p) => p.startsWith(`/operations/${tourId}`),
    },
    {
      id: 'budget',
      label: 'Budget',
      href: `/budget/${tourId}`,
      isActive: (p) => p.startsWith(`/budget/${tourId}`),
    },
    {
      id: 'advance',
      label: 'Advance',
      href: `/advance/${tourId}`,
      isActive: (p) => p.startsWith(`/advance/${tourId}`),
    },
  ];
}

export function ScopeNavStrip({ scope, isSiteAdmin }: ScopeNavStripProps) {
  const pathname = usePathname() ?? '';

  let items: NavItem[];
  switch (scope.level) {
    case 'workspace':
      items = workspaceItems(isSiteAdmin);
      break;
    case 'artist':
      items = scope.artistId ? artistItems(scope.artistId) : [];
      break;
    case 'tour':
      items = scope.tourId ? tourItems(scope.tourId) : [];
      break;
  }

  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Scope navigation"
      className="lp-scope-nav-strip"
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
      {items.map((item) => {
        const active = item.isActive(pathname);
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn('btn-transition lp-scope-nav-link', active && 'is-active')}
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

'use client';

/* ============================================
   LOWPASS — AdminSubNav (Sprint 9 §10)

   Three-tab sub-nav for /admin/*. Same visual pattern as
   OperationsSubNav: orange underline on active, secondary
   text otherwise, hover to lp-text. Border-bottom strip
   matches existing chrome.
   ============================================ */

import Link from 'next/link';
import { useId } from 'react';
import { cn } from '@/lib/utils';

interface AdminSubNavProps {
  activeId: 'users' | 'workspaces' | 'audit';
}

const TABS: ReadonlyArray<{ id: 'users' | 'workspaces' | 'audit'; label: string; href: string }> = [
  { id: 'users', label: 'Users', href: '/admin/users' },
  { id: 'workspaces', label: 'Workspaces', href: '/admin/workspaces' },
  { id: 'audit', label: 'Audit log', href: '/admin/audit' },
];

export function AdminSubNav({ activeId }: AdminSubNavProps) {
  const navId = useId();
  return (
    <nav
      aria-labelledby={navId}
      className="lp-admin-subnav"
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
        Site admin sub-navigation
      </span>
      {TABS.map((tab) => {
        const active = tab.id === activeId;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn('btn-transition', active && 'is-active')}
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
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

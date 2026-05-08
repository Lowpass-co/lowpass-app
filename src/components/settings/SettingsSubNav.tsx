'use client';

/* ============================================
   LOWPASS — SettingsSubNav (Sprint 9 §3 chrome fix)

   Horizontal sub-nav under the TopBar on every /settings/*
   page. Mirrors the OperationsSubNav pattern from Phase 5 so
   Settings behaves and looks like the rest of the app.

   v1 has two real pages (General + Members). Future settings
   pages (Account, Workspace, Billing, Integrations) get added
   as separate routes ship; do NOT add placeholder links to
   non-existent routes.
   ============================================ */

import Link from 'next/link';
import { useId } from 'react';
import { cn } from '@/lib/utils';

interface SettingsSubNavLink {
  id: string;
  label: string;
  href: string;
  /** Active when pathname starts with this prefix (or equals href for root). */
  activePathPrefix: string;
  /** Match exactly (true) or by prefix (false). General/root needs exact. */
  exactMatch?: boolean;
}

const SETTINGS_LINKS: SettingsSubNavLink[] = [
  {
    id: 'general',
    label: 'General',
    href: '/settings',
    activePathPrefix: '/settings',
    exactMatch: true,
  },
  {
    id: 'members',
    label: 'Members',
    href: '/settings/members',
    activePathPrefix: '/settings/members',
  },
];

export function SettingsSubNav({ pathname }: { pathname: string }) {
  const navId = useId();

  return (
    <nav
      aria-labelledby={navId}
      className="lp-settings-subnav"
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
        Settings sub-navigation
      </span>
      {SETTINGS_LINKS.map((link) => {
        const active = link.exactMatch
          ? pathname === link.activePathPrefix
          : pathname.startsWith(link.activePathPrefix);
        return (
          <Link
            key={link.id}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'btn-transition',
              'lp-settings-subnav-link',
              active && 'is-active',
            )}
            style={{
              position: 'relative',
              padding: '12px var(--lp-space-3)',
              fontSize: 'var(--lp-text-sm)',
              fontWeight: active
                ? 'var(--lp-weight-semibold)'
                : 'var(--lp-weight-medium)',
              color: active
                ? 'var(--color-lp-orange)'
                : 'var(--lp-text-secondary)',
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

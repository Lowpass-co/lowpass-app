'use client';

/* ============================================
   LOWPASS — <WorkspaceTabs> (IA Cleanup §I2.2)

   Tab bar for the workspace dashboard. Three entries:

     Artists · Personnel · Equipment

   Routes to /artists, /personnel, /equipment respectively.
   Personnel + Equipment land as workspace tabs in §I3 (the
   file moves); for the §I2 commit the tab links exist but
   /personnel and /equipment still live on shell-v1 chrome
   until that move completes. Acceptable interim state.

   Active state is derived from usePathname (matches
   BudgetTabNav's pattern for visual consistency).

   Token-clean: brand-orange underline on the active tab,
   text colour via design tokens.
   ============================================ */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface Tab {
  id: 'artists' | 'personnel' | 'equipment';
  label: string;
  href: string;
}

const TABS: ReadonlyArray<Tab> = [
  { id: 'artists', label: 'Artists', href: '/artists' },
  { id: 'personnel', label: 'Personnel', href: '/personnel' },
  // S1 — "Equipment" → "Assets" (unified Spaces → Containers → Items). The old
  // /equipment (Jobs) folds into Assets + is retired in Stage C3.
  { id: 'equipment', label: 'Assets', href: '/assets' },
];

function activeFor(pathname: string): Tab['id'] {
  if (pathname.startsWith('/personnel')) return 'personnel';
  if (pathname.startsWith('/equipment') || pathname.startsWith('/assets')) return 'equipment';
  return 'artists';
}

export function WorkspaceTabs() {
  const pathname = usePathname() ?? '/artists';
  const active = activeFor(pathname);

  return (
    <nav
      className="flex items-end gap-1 border-b px-4"
      style={{
        borderColor: 'var(--lp-border-strong)',
        background: 'var(--lp-bg)',
      }}
      aria-label="Workspace tabs"
    >
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={cn('btn-transition relative px-3 py-2.5')}
            style={{
              fontSize: '13px',
              fontWeight: isActive ? 600 : 500,
              color: isActive ? 'var(--lp-text)' : 'var(--lp-text-secondary)',
            }}
            aria-current={isActive ? 'page' : undefined}
          >
            {tab.label}
            {isActive ? (
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
        );
      })}
    </nav>
  );
}

/* ============================================
   LOWPASS — App Shell (Client)

   Global client-only app chrome: context guards, toasts,
   floating bug report, and (Sprint 8.5 §1) the workspace-level
   switcher mount.

   Sprint 8.5 §1 — the artist/tour switcher used to live inside
   <ProductHeader> (per-product, in the dynamic-segment subtree),
   which caused the wrapper + dropdown to remount on every
   /artists/[A] → /artists/[B] navigation. State persistence
   (Sprint 8.3 §1) survived but the DOM element didn't, producing
   a visible close+reopen flash on artist switch.

   Real fix: the switcher is now rendered inside AppShell — at
   workspace level, above the dynamic-segment subtree. Same DOM
   element across all (app)/* navigation. No flash.

   The switcher renders inline as the first row of chrome in
   AppShell's flex column, above {children}. ProductHeader stays
   per-product but no longer carries the switcher (it keeps
   product name + search + avatar). On workspace landing
   (/artists exact), the switcher is hidden via a pathname check
   — there's no selected artist/tour at that scope.
   ============================================ */

'use client';

import { Suspense, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { ArtistTourScopeGuard } from '@/components/layout/ArtistTourScopeGuard';
import { OverviewArtistQuerySync } from '@/components/layout/OverviewArtistQuerySync';
import { FloatingBugReport } from '@/components/bug-report/FloatingBugReport';
import { EntityRoutingProvider } from '@/components/entity/EntityRoutingContext';
import { PwaClient } from '@/components/pwa/PwaClient';
import {
  CommandPaletteProvider,
  useCommandPalette,
} from '@/components/command-palette/CommandPaletteContext';
import { CommandPalette } from '@/components/command-palette/CommandPalette';
import { ArtistTourSwitcherClientWrapper } from '@/components/shell-v2/ArtistTourSwitcherClientWrapper';
import { WorkspaceSwitcher } from '@/components/shell-v2/WorkspaceSwitcher';

interface InitialArtist {
  id: string;
  name: string;
  branding: unknown;
  spotify_image_url: string | null;
}

/**
 * UX08b — Global ⌘K listener. Mounted inside CommandPaletteProvider so it
 * can flip the same state the TopBar trigger button consumes. Cmd/Ctrl+K
 * toggles; the palette itself handles its own Escape close.
 */
function CommandPaletteShortcut() {
  const { toggle } = useCommandPalette();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);
  return null;
}

/**
 * Sprint 8.5 §1 — workspace-level switcher mount.
 * Renders inline as the first row of AppShell's flex column.
 * Visibility: hidden on /artists workspace landing (no selected
 * artist/tour at that scope). Always rendered on artist-scoped
 * + tour-scoped pages (/artists/[id]/*, /budget/[X]/*,
 * /advance/[X]/*, /operations/[X]/*).
 *
 * The switcher's actual chrome (the trigger button + dropdown)
 * is rendered by <ArtistTourSwitcherClientWrapper>; we just
 * provide a stable container at workspace level so React never
 * unmounts it.
 */
function WorkspaceSwitcherSlot({
  initialArtists,
}: {
  initialArtists: InitialArtist[];
}) {
  const pathname = usePathname();
  // Hide on workspace landing — no artist/tour selected at this
  // scope. Pathname is `/artists` exactly (no /[id] segment).
  const onWorkspaceLanding = pathname === '/artists';
  if (onWorkspaceLanding) return null;

  return (
    <div
      className="lp-workspace-switcher-slot"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--lp-space-2)',
        height: 48,
        padding: '0 var(--lp-space-3)',
        background: 'var(--lp-panel)',
        borderBottom: '1px solid var(--lp-border-strong)',
        flexShrink: 0,
      }}
    >
      {/* Sprint 9 §3 — workspace switcher mounted to the LEFT
          of the artist/tour switcher per the approved mockup.
          Always shown (static label for single-workspace
          users, dropdown for 2+) so users get a "you are HERE"
          anchor before the artist/tour scope. */}
      <WorkspaceSwitcher />
      <span
        aria-hidden
        style={{
          width: 1,
          height: 16,
          background: 'var(--lp-border-subtle)',
        }}
      />
      <ArtistTourSwitcherClientWrapper
        initialArtists={initialArtists}
        initialTours={null}
        initialArtistId={null}
      />
    </div>
  );
}

export function AppShell({
  children,
  initialArtists,
}: {
  children: React.ReactNode;
  initialArtists: InitialArtist[];
}) {
  return (
    <EntityRoutingProvider>
      <CommandPaletteProvider>
        <div
          className="flex min-h-screen min-w-0 flex-1 flex-col"
          style={{ background: 'var(--lp-dashboard-bg)' }}
        >
          <Suspense fallback={null}>
            <ArtistTourScopeGuard />
          </Suspense>
          <Suspense fallback={null}>
            <OverviewArtistQuerySync />
          </Suspense>
          {/* Sprint 8.5 §1 — workspace-level switcher mount.
              Sits above the dynamic-segment subtree so the
              dropdown DOM persists across all (app)/* nav. */}
          <WorkspaceSwitcherSlot initialArtists={initialArtists} />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
          <FloatingBugReport />
          {/* UX18: PWA shell — registers SW (production only) and renders the install prompt. */}
          <PwaClient />
          {/* UX08b: ⌘K command palette — global mount + keyboard shortcut. */}
          <CommandPaletteShortcut />
          <CommandPalette />
        </div>
      </CommandPaletteProvider>
    </EntityRoutingProvider>
  );
}

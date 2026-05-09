/* ============================================
   LOWPASS — App Shell (Client)

   Global client-only app chrome: context guards, toasts,
   floating bug report, ⌘K palette, PWA shell.

   Sprint 9 §13.A.2 — the workspace + artist/tour switcher slot
   that used to render here has been removed. The previous mount
   produced a duplicate header above shell-v1's <TopBar> and
   shell-v2's <ProductHeader> (the "double TopBar" complaint on
   the smoke list). Each shell now owns its complete chrome:

     - shell-v1 (<TopBar>): renders <WorkspaceSwitcher> inline
       on its left side, alongside the existing tours dropdown.
       Workspace-scoped routes don't need an artist/tour switcher.

     - shell-v2 (<ProductHeader>): renders <WorkspaceSwitcher> +
       <ArtistTourSwitcherClientWrapper> on its left side. The
       initialArtists prefetch lives on ProductHeader directly.

   Sprint 8.5 §1's hoisted-mount fix (artist/tour switcher state
   persistence across /artists/[A]→/artists/[B] navigation) is
   superseded — switcher state survives via SwitcherStateContext
   (mounted in (app)/layout.tsx, above this component), so DOM
   remount on dynamic-segment change still preserves the open
   dropdown's open/close state and selection. Any visible flash
   on artist switch is a separate polish item, not in 13.A scope.

   AppShell is now a pure pass-through wrapper for providers and
   global non-chrome ambient elements.
   ============================================ */

'use client';

import { Suspense, useEffect } from 'react';
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

export function AppShell({
  children,
}: {
  children: React.ReactNode;
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
          {/* Sprint 9 §13.A.2 — workspace + artist/tour switcher
              moved into per-shell chrome (TopBar, ProductHeader)
              to eliminate the duplicate-header bar that lived
              here. AppShell is now a pure pass-through. */}
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

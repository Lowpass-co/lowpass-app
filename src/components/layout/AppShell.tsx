/* ============================================
   LOWPASS — App Shell (Client)

   Global client-only app chrome: context guards, toasts, floating bug
   report. Per-page navigation chrome lives in <PageShell> (TopBar + LeftRail)
   on each route after UX04.
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

export function AppShell({ children }: { children: React.ReactNode }) {
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

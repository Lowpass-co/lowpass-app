/* ============================================
   LOWPASS — App Shell (Client)

   Global client-only app chrome: context guards, toasts, floating bug
   report. Per-page navigation chrome lives in <PageShell> (TopBar + LeftRail)
   on each route after UX04.
   ============================================ */

'use client';

import { Suspense } from 'react';
import { ArtistTourScopeGuard } from '@/components/layout/ArtistTourScopeGuard';
import { OverviewArtistQuerySync } from '@/components/layout/OverviewArtistQuerySync';
import { FloatingBugReport } from '@/components/bug-report/FloatingBugReport';
import { EntityRoutingProvider } from '@/components/entity/EntityRoutingContext';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <EntityRoutingProvider>
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
      </div>
    </EntityRoutingProvider>
  );
}

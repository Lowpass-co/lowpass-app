/* ============================================
   LOWPASS — App Layout

   Layout for authenticated pages.
   Global: toasts, artist/tour context, bug reporter.

   Sprint 9 §13.A.2 — initialArtists prefetch removed from this
   layout. The workspace-level switcher slot it fed (mounted in
   <AppShell>) was producing a duplicate header above shell-v1's
   <TopBar> and shell-v2's <ProductHeader>. Each shell now owns
   its complete chrome and prefetches whatever switcher data it
   needs — see <ProductHeader> for the new initialArtists fetch
   site. This layout is back to a clean providers-only wrapper.

   Per-route chrome: <PageShell> (TopBar + LeftRail) in each
   `page.tsx` (shell-v1, UX04), or <ProductShell> (rail + header
   + main) wrapping each per-product page (shell-v2, Product
   Split Phase 1+).

   All pages under (app)/ get this layout.
   Auth pages under (auth)/ do NOT.
   ============================================ */

import { Suspense } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { ToastProvider } from '@/components/ui/Toast';
import { ArtistTourProvider } from '@/contexts/ArtistTourContext';
import { ProductProvider } from '@/contexts/ProductContext';
import { SwitcherStateProvider } from '@/contexts/SwitcherStateContext';
import { TourEditorProvider } from '@/contexts/TourEditorContext';
import { AppDensityProvider } from '@/lib/density/appDensity';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Post-merge fix-up §C — ArtistTourProvider uses useSearchParams
  // to read ?artist_id / ?tour_id from URL, so it needs Suspense
  // boundary above. (app) routes are all dynamic anyway (Supabase
  // auth) so the bailout has no SSG cost.
  return (
    <ErrorBoundary>
      <ToastProvider>
        <Suspense fallback={null}>
          <ArtistTourProvider>
            <ProductProvider>
              {/* Sprint 8.3 §1 — switcher dropdown + optimistic-
                  artist state lives here so it survives navigation
                  inside the dynamic-segment subtree (Next 16 RSC
                  remounts the wrapper/switcher on /artists/[id]
                  changes; the provider above the segment doesn't). */}
              <SwitcherStateProvider>
                {/* Grid system Phase 1 — ONE app-wide density. Mounted
                    here so its data-lp-density attr + context wrap every
                    authenticated page; every grid reads the same value. */}
                <AppDensityProvider>
                  {/* App-wide host for the ONE tour create/edit modal —
                      openCreateTour()/openEditTour() from any entry point. */}
                  <TourEditorProvider>
                    <AppShell>{children}</AppShell>
                  </TourEditorProvider>
                </AppDensityProvider>
              </SwitcherStateProvider>
            </ProductProvider>
          </ArtistTourProvider>
        </Suspense>
      </ToastProvider>
    </ErrorBoundary>
  );
}

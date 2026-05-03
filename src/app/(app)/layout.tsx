/* ============================================
   LOWPASS — App Layout

   Layout for authenticated pages.
   Global: toasts, artist/tour context, bug reporter.
   Per-route chrome: <PageShell> (TopBar + LeftRail) in each `page.tsx` (UX04).

   All pages under (app)/ get this layout.
   Auth pages under (auth)/ do NOT.
   ============================================ */

import { Suspense } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { ToastProvider } from '@/components/ui/Toast';
import { ArtistTourProvider } from '@/contexts/ArtistTourContext';
import { ProductProvider } from '@/contexts/ProductContext';

export default function AppLayout({
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
              <AppShell>
                {children}
              </AppShell>
            </ProductProvider>
          </ArtistTourProvider>
        </Suspense>
      </ToastProvider>
    </ErrorBoundary>
  );
}

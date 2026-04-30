/* ============================================
   LOWPASS — App Layout

   Layout for authenticated pages.
   Global: toasts, artist/tour context, bug reporter.
   Per-route chrome: <PageShell> (TopBar + LeftRail) in each `page.tsx` (UX04).

   All pages under (app)/ get this layout.
   Auth pages under (auth)/ do NOT.
   ============================================ */

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
  return (
    <ErrorBoundary>
      <ToastProvider>
        <ArtistTourProvider>
          <ProductProvider>
            <AppShell>
              {children}
            </AppShell>
          </ProductProvider>
        </ArtistTourProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

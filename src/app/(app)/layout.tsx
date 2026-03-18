/* ============================================
   LOWPASS — App Layout

   Layout for authenticated pages.
   Includes sidebar + header shell.

   All pages under (app)/ get this layout.
   Auth pages under (auth)/ do NOT.
   ============================================ */

import { AppShell } from '@/components/layout/AppShell';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { ToastProvider } from '@/components/ui/Toast';
import { ArtistTourProvider } from '@/contexts/ArtistTourContext';
import { ArtistPickerGate } from '@/components/layout/ArtistPickerGate';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <ArtistTourProvider>
          <ArtistPickerGate>
            <AppShell>
              {children}
            </AppShell>
          </ArtistPickerGate>
        </ArtistTourProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

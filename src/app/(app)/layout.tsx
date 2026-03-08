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

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AppShell>
          {children}
        </AppShell>
      </ToastProvider>
    </ErrorBoundary>
  );
}

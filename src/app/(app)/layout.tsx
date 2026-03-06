/* ============================================
   LOWPASS — App Layout

   Layout for authenticated pages.
   Includes sidebar + header shell.

   All pages under (app)/ get this layout.
   Auth pages under (auth)/ do NOT.
   ============================================ */

'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { ToastProvider } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  return (
    <ErrorBoundary>
      <ToastProvider>
      <div className="min-h-screen bg-lp-bg">
        {/* Sidebar — fixed on desktop, overlay on mobile */}
        <Sidebar />

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden transition-opacity duration-150"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Main content — offset by sidebar width, page transition on route change */}
      <div className={cn('transition-all duration-200 lg:ml-[260px]')}>
        <Header onMenuClick={() => setMobileMenuOpen(!mobileMenuOpen)} />
        <main key={pathname} className="px-6 py-6 animate-page-in">
          {children}
        </main>
      </div>
    </div>
      </ToastProvider>
    </ErrorBoundary>
  );
}

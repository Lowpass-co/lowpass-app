/* ============================================
   LOWPASS — App Shell (Client)

   Client wrapper for the app layout.
   Handles mobile menu state and sidebar/header.
   ============================================ */

'use client';

import { Suspense, useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { cn } from '@/lib/utils';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-lp-bg">
      {/* Sidebar — fixed on desktop, overlay on mobile; Suspense for useSearchParams */}
      <Suspense fallback={<div className="fixed left-0 top-0 z-30 h-full w-[260px] border-r border-lp-border bg-lp-sidebar-bg" style={{ backgroundColor: 'var(--lp-sidebar-bg)' }} />}>
        <Sidebar />
      </Suspense>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden transition-opacity duration-150"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Main content — offset by sidebar width (CSS variable set by Sidebar) */}
      <div className="transition-[margin-left] duration-200 ease-in-out" style={{ marginLeft: 'var(--sidebar-w, 260px)' }}>
        <Header onMenuClick={() => setMobileMenuOpen(!mobileMenuOpen)} />
        <main className="flex min-h-0 flex-1 flex-col px-6 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}

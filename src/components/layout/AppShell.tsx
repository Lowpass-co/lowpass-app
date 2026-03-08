/* ============================================
   LOWPASS — App Shell (Client)

   Client wrapper for the app layout.
   Handles mobile menu state and sidebar/header.
   ============================================ */

'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { cn } from '@/lib/utils';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
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

      {/* Main content — offset by sidebar width */}
      <div className={cn('transition-all duration-200 lg:ml-[260px]')}>
        <Header onMenuClick={() => setMobileMenuOpen(!mobileMenuOpen)} />
        <main className="px-6 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}

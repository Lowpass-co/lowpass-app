'use client';

/* ============================================
   LOWPASS — App Top Bar

   Floating pill-slider top bar. Replaces Header.tsx.

   Two-axis nav: top = mode (Advance/Budget), sidebar = shows.

   ============================================ */

import { Suspense } from 'react';
import Link from 'next/link';
import { Bell, Menu, Plus } from 'lucide-react';
import { DarkModeToggle } from './DarkModeToggle';
import { AppTopBarBreadcrumb } from './AppTopBarBreadcrumb';
import { AppTopBarModePill } from './AppTopBarModePill';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { cn } from '@/lib/utils';

interface AppTopBarProps {
  onMenuClick?: () => void;
}

export function AppTopBar({ onMenuClick }: AppTopBarProps) {
  const { selectedArtistId, hydrated } = useArtistTourContext();
  const compactNewTour = hydrated && !!selectedArtistId;

  return (
    <header className="sticky top-0 z-20 overflow-visible border-b border-lp-border bg-lp-bg/80 px-4 backdrop-blur-sm sm:px-6">
      <div className="flex min-h-16 items-center gap-3 py-2 lg:gap-4 lg:py-0">
        {/* Mobile menu button */}
        <button
          type="button"
          onClick={onMenuClick}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lp-text-secondary hover:bg-lp-bg-tertiary lg:hidden"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        {/* New Tour button (compact when artist selected) */}
        <Link
          href="/tours/create"
          title={compactNewTour ? 'New tour' : undefined}
          aria-label={compactNewTour ? 'New tour' : undefined}
          className={cn(
            'flex shrink-0 items-center justify-center rounded-lg border border-lp-orange text-lp-orange transition-colors duration-200',
            'hover:bg-lp-orange hover:text-white dark:hover:text-black',
            compactNewTour
              ? 'h-9 w-9'
              : 'min-h-[2.75rem] gap-1.5 px-3 py-2 text-xs font-bold tracking-widest'
          )}
          style={compactNewTour ? undefined : { letterSpacing: '0.12em' }}
        >
          <Plus size={compactNewTour ? 18 : 14} strokeWidth={compactNewTour ? 2 : 2.5} className="shrink-0" />
          {!compactNewTour && <span className="whitespace-nowrap">NEW TOUR</span>}
        </Link>

        {/* Breadcrumb */}
        <Suspense
          fallback={
            <div className="min-h-[2.75rem] flex-1 rounded-lg border border-lp-border bg-lp-bg/50 sm:max-w-[min(100%,28rem)]" />
          }
        >
          <AppTopBarBreadcrumb />
        </Suspense>

        {/* Mode pill (centered on wider screens) */}
        <div className="ml-auto hidden shrink-0 md:block">
          <AppTopBarModePill />
        </div>

        {/* Right actions */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-lp-text-secondary hover:bg-lp-bg-tertiary hover:text-lp-text transition-colors"
            aria-label="Notifications"
          >
            <Bell size={18} />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-lp-orange" />
          </button>
          <DarkModeToggle />
        </div>
      </div>

      {/* Mobile: pill below on narrow screens */}
      <div className="md:hidden -mt-1 pb-2 flex justify-center">
        <AppTopBarModePill />
      </div>
    </header>
  );
}

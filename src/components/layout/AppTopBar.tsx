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
        <button
          type="button"
          onClick={onMenuClick}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-lp-text-secondary hover:bg-lp-bg-tertiary lg:hidden"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        <Link
          href="/tours/create"
          title={compactNewTour ? 'New tour' : undefined}
          aria-label={compactNewTour ? 'New tour' : undefined}
          className={cn(
            'flex shrink-0 items-center justify-center rounded-lg border border-lp-orange text-lp-orange transition-colors duration-200',
            'hover:bg-lp-orange hover:text-white dark:hover:text-black',
            compactNewTour
              ? 'h-11 w-11'
              : 'min-h-[2.75rem] gap-1.5 px-3 py-2 text-xs font-bold tracking-widest'
          )}
          style={compactNewTour ? undefined : { letterSpacing: '0.12em' }}
        >
          <Plus size={compactNewTour ? 18 : 14} strokeWidth={compactNewTour ? 2 : 2.5} className="shrink-0" />
          {!compactNewTour && <span className="whitespace-nowrap">NEW TOUR</span>}
        </Link>

        <Suspense
          fallback={
            <div className="min-h-[2.75rem] min-w-0 flex-1 rounded-lg border border-lp-border bg-lp-bg/50" />
          }
        >
          <div className="min-w-0 flex-1">
            <AppTopBarBreadcrumb />
          </div>
        </Suspense>

        <div className="shrink-0">
          <AppTopBarModePill className="w-40 md:w-48" />
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="relative flex h-11 w-11 items-center justify-center rounded-lg text-lp-text-secondary hover:bg-lp-bg-tertiary hover:text-lp-text transition-colors"
            aria-label="Notifications"
          >
            <Bell size={18} />
            <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-lp-orange" />
          </button>
          <DarkModeToggle />
        </div>
      </div>
    </header>
  );
}

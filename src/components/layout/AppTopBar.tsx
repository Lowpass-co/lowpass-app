'use client';

/* ============================================
   LOWPASS — App Top Bar

   Floating pill-slider top bar. Replaces Header.tsx.

   Two-axis nav: top = mode (Advance/Budget), sidebar = shows.

   ============================================ */

import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bell, Menu, Plus } from 'lucide-react';
import { DarkModeToggle } from './DarkModeToggle';
import { AppTopBarBreadcrumb } from './AppTopBarBreadcrumb';
import { ManageTourSegmentNav } from './ManageTourSegmentNav';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface AppTopBarProps {
  onMenuClick?: () => void;
}

export function AppTopBar({ onMenuClick }: AppTopBarProps) {
  const router = useRouter();
  const { selectedArtistId, selectedTourId, hydrated } = useArtistTourContext();
  const compactNewTour = hydrated && !!selectedArtistId;

  return (
    <header className="sticky top-0 z-20 overflow-visible border-b border-lp-border bg-lp-bg/80 px-4 backdrop-blur-sm sm:px-6">
      <div className="grid min-h-16 w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 py-2 sm:gap-3 lg:gap-4 lg:py-0">
        {/* Left: menu, New Tour, breadcrumb */}
        <div className="flex min-h-0 min-w-0 w-full max-w-full items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lp-text-secondary hover:bg-lp-bg-tertiary lg:hidden"
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
                ? 'h-9 w-9'
                : 'min-h-[2.75rem] gap-1.5 px-3 py-2 text-xs font-bold tracking-widest'
            )}
            style={compactNewTour ? undefined : { letterSpacing: '0.12em' }}
          >
            <Plus size={compactNewTour ? 18 : 14} strokeWidth={compactNewTour ? 2 : 2.5} className="shrink-0" />
            {!compactNewTour && <span className="whitespace-nowrap">NEW TOUR</span>}
          </Link>

          <Suspense
            fallback={
              <div className="min-h-[2.75rem] min-w-0 flex-1 rounded-lg border border-lp-border bg-lp-bg/50 sm:max-w-[min(100%,28rem)]" />
            }
          >
            <AppTopBarBreadcrumb />
          </Suspense>
        </div>

        {/* Center: Summary / Budget / Advance — locked until artist + tour are selected */}
        <div className="flex shrink-0 justify-center justify-self-center px-0.5 sm:px-1">
          {hydrated ? (
            <Suspense
              fallback={
                <div
                  className={cn(
                    'w-[min(380px,calc(100vw-10rem))] max-w-full shrink-0 rounded-lg border border-lp-orange/40 bg-lp-bg/50',
                    compactNewTour ? 'h-9' : 'min-h-[2.75rem]'
                  )}
                  aria-hidden
                />
              }
            >
              <div
                className={cn(
                  'flex w-[min(380px,calc(100vw-10rem))] max-w-full shrink-0 items-stretch overflow-hidden rounded-lg border border-lp-orange/40 bg-lp-bg/70',
                  'backdrop-blur-sm dark:bg-lp-bg/55',
                  compactNewTour ? 'h-9' : 'min-h-[2.75rem]'
                )}
              >
                <ManageTourSegmentNav artistId={selectedArtistId} tourId={selectedTourId} />
              </div>
            </Suspense>
          ) : null}
        </div>

        {/* Right actions */}
        <div className="flex min-w-0 shrink-0 items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-lp-text-secondary hover:bg-lp-bg-tertiary hover:text-lp-text transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft size={18} />
          </button>
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
    </header>
  );
}

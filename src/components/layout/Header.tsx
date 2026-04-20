/* ============================================
   LOWPASS — Header Component

   New Tour + scoped Artist / Tour picker (left),
   optional page title, search, notifications, dark mode.
   ============================================ */

'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { Bell, Search, Menu, Plus } from 'lucide-react';
import { DarkModeToggle } from './DarkModeToggle';
import { HeaderArtistTourPicker } from './HeaderArtistTourPicker';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { cn } from '@/lib/utils';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  onMenuClick?: () => void;
}

/**
 * @deprecated Use `AppTopBar` from `./AppTopBar` instead.
 * Scheduled for removal in PR A0.4.
 */
export function Header({ title, subtitle, onMenuClick }: HeaderProps) {
  const { selectedArtistId, hydrated } = useArtistTourContext();
  const compactNewTour = hydrated && !!selectedArtistId;

  return (
    <header className="sticky top-0 z-20 overflow-visible border-b border-lp-border bg-lp-bg/80 px-4 backdrop-blur-sm sm:px-6">
      <div className="flex min-h-16 flex-col gap-2 py-2 lg:flex-row lg:items-center lg:justify-between lg:gap-4 lg:py-0">
        {/* Primary row: menu, New Tour, artist/tour scope */}
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-3">
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
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
                  : 'min-h-[2.75rem] gap-1.5 self-stretch px-3 py-2 text-xs font-bold tracking-widest'
              )}
              style={compactNewTour ? undefined : { letterSpacing: '0.12em' }}
            >
              <Plus size={compactNewTour ? 18 : 14} strokeWidth={compactNewTour ? 2 : 2.5} className="shrink-0" />
              {!compactNewTour && <span className="whitespace-nowrap">NEW TOUR</span>}
            </Link>
          </div>

          <Suspense
            fallback={
              <div className="min-h-[2.75rem] flex-1 rounded-lg border border-lp-border bg-lp-bg/50 sm:max-w-[min(100%,28rem)]" />
            }
          >
            <HeaderArtistTourPicker />
          </Suspense>

          {(title || subtitle) && (
            <div className="min-w-0 flex-1 border-t border-lp-border pt-2 lg:border-t-0 lg:pt-0">
              {title && <h1 className="truncate text-lg font-semibold text-lp-text">{title}</h1>}
              {subtitle && <p className="truncate text-sm text-lp-text-secondary">{subtitle}</p>}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-1 border-t border-lp-border pt-2 lg:border-t-0 lg:pt-0">
          <button
            type="button"
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-lg',
              'text-lp-text-secondary hover:text-lp-text hover:bg-lp-bg-tertiary transition-colors'
            )}
            aria-label="Search"
          >
            <Search size={18} />
          </button>
          <button
            type="button"
            className={cn(
              'relative flex h-9 w-9 items-center justify-center rounded-lg',
              'text-lp-text-secondary hover:text-lp-text hover:bg-lp-bg-tertiary transition-colors'
            )}
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

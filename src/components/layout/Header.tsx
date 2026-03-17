/* ============================================
   LOWPASS — Header Component

   Artist-first: artist selector (left), tour selector when artist selected,
   then page title, search, notifications, dark mode.
   ============================================ */

'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell, Search, Menu, ChevronDown } from 'lucide-react';
import { DarkModeToggle } from './DarkModeToggle';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { cn } from '@/lib/utils';
import { formatTourDateRange } from '@/lib/utils';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  onMenuClick?: () => void;
}

export function Header({ title, subtitle, onMenuClick }: HeaderProps) {
  const {
    selectedArtistId,
    selectedTourId,
    selectedArtist,
    selectedTour,
    setSelectedArtistId,
    setSelectedTourId,
    artists,
    tours,
    isLoading,
  } = useArtistTourContext();

  const [artistOpen, setArtistOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const artistRef = useRef<HTMLDivElement>(null);
  const tourRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (artistRef.current?.contains(e.target as Node)) return;
      if (tourRef.current?.contains(e.target as Node)) return;
      setArtistOpen(false);
      setTourOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const tourDateText = selectedTour
    ? formatTourDateRange(selectedTour.start_date, selectedTour.end_date)
    : '';

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-lp-border bg-lp-bg/80 px-6 backdrop-blur-sm">
      {/* Left: mobile menu + artist selector + tour selector + title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onMenuClick}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lp-text-secondary hover:bg-lp-bg-tertiary lg:hidden"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        {/* Artist selector */}
        <div className="relative shrink-0" ref={artistRef}>
          <button
            type="button"
            onClick={() => { setArtistOpen(!artistOpen); setTourOpen(false); }}
            className={cn(
              'flex items-center gap-2 rounded-lg border border-lp-border bg-lp-surface px-2.5 py-1.5 transition-all duration-150',
              'hover:bg-lp-surface-hover',
              artistOpen && 'ring-2 ring-lp-orange/30'
            )}
          >
            {selectedArtist ? (
              <>
                <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-lp-border bg-lp-bg">
                  {selectedArtist.spotify_image_url ? (
                    <img
                      src={selectedArtist.spotify_image_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs font-bold text-lp-text-tertiary">
                      {(selectedArtist.name ?? '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <span className="hidden max-w-[140px] truncate text-sm font-bold text-lp-text sm:inline">
                  {selectedArtist.name}
                </span>
              </>
            ) : (
              <span className="text-sm text-lp-text-tertiary">Select artist</span>
            )}
            <ChevronDown size={16} className={cn('shrink-0 text-lp-text-tertiary', artistOpen && 'rotate-180')} />
          </button>
          {artistOpen && (
            <div
              className="absolute left-0 top-full z-50 mt-1 max-h-[300px] min-w-[200px] overflow-y-auto rounded-lg border border-lp-border bg-lp-surface py-1 shadow-lg transition-all duration-150"
            >
              {isLoading && artists.length === 0 ? (
                <div className="px-3 py-4 text-sm text-lp-text-tertiary">Loading…</div>
              ) : (
                artists.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => { setSelectedArtistId(a.id); setArtistOpen(false); }}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                      selectedArtistId === a.id
                        ? 'border-l-2 border-lp-orange bg-lp-orange/5 font-semibold text-lp-text'
                        : 'hover:bg-lp-surface-hover text-lp-text'
                    )}
                  >
                    <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-lp-border bg-lp-bg">
                      {a.spotify_image_url ? (
                        <img src={a.spotify_image_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs font-bold text-lp-text-tertiary">
                          {(a.name ?? '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <span className="truncate">{a.name}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Tour selector — only when artist selected */}
        {selectedArtistId && (
          <div className="relative shrink-0" ref={tourRef}>
            <button
              type="button"
              onClick={() => { setTourOpen(!tourOpen); setArtistOpen(false); }}
              className={cn(
                'flex items-center gap-2 rounded-lg border border-lp-border bg-lp-surface px-2.5 py-1.5 transition-all duration-150',
                'hover:bg-lp-surface-hover',
                tourOpen && 'ring-2 ring-lp-orange/30'
              )}
            >
              {selectedTour ? (
                <>
                  <span className="hidden max-w-[160px] truncate text-sm font-bold text-lp-text sm:inline">
                    {selectedTour.name}
                  </span>
                  <span className="hidden text-xs text-lp-text-secondary sm:inline">{tourDateText}</span>
                </>
              ) : (
                <span className="text-sm text-lp-text-tertiary">Select tour</span>
              )}
              <ChevronDown size={16} className={cn('shrink-0 text-lp-text-tertiary', tourOpen && 'rotate-180')} />
            </button>
            {tourOpen && (
              <div
                className="absolute left-0 top-full z-50 mt-1 max-h-[300px] min-w-[220px] overflow-y-auto rounded-lg border border-lp-border bg-lp-surface py-1 shadow-lg transition-all duration-150"
              >
                {tours.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-lp-text-tertiary">No tours</div>
                ) : (
                  tours.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => { setSelectedTourId(t.id); setTourOpen(false); }}
                      className={cn(
                        'flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors',
                        selectedTourId === t.id
                          ? 'border-l-2 border-lp-orange bg-lp-orange/5'
                          : 'hover:bg-lp-surface-hover'
                      )}
                    >
                      <span className={cn('text-sm', selectedTourId === t.id ? 'font-bold text-lp-text' : 'text-lp-text')}>
                        {t.name}
                      </span>
                      <span className="text-xs text-lp-text-secondary">
                        {formatTourDateRange(t.start_date, t.end_date)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Page title (when no artist/tour or as extra context) */}
        <div className="min-w-0 flex-1">
          {title && (
            <h1 className="truncate text-lg font-semibold text-lp-text">{title}</h1>
          )}
          {subtitle && (
            <p className="truncate text-sm text-lp-text-secondary">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Right: search, notifications, dark mode */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-lg',
            'text-lp-text-secondary hover:text-lp-text hover:bg-lp-bg-tertiary transition-colors'
          )}
          aria-label="Search"
        >
          <Search size={18} />
        </button>
        <button
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
    </header>
  );
}

/* ============================================
   LOWPASS — AppTopBar breadcrumb

   Artist / Tour chooser for the top bar.

   Behavior copy of HeaderArtistTourPicker;

   that file is deprecated and deleted in PR A0.4.

   ============================================ */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, X } from 'lucide-react';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { cn } from '@/lib/utils';

/** Clears workspace artist+tour scope and returns to the artist picker on Dashboard. */
function ArtistTourScopeClearButton() {
  const router = useRouter();
  const { setSelectedArtistId } = useArtistTourContext();
  return (
    <button
      type="button"
      onClick={() => {
        setSelectedArtistId(null);
        router.push('/dashboard?select=artist');
      }}
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-transparent',
        'text-lp-text-secondary transition-colors',
        'hover:border-lp-border hover:bg-lp-bg-tertiary hover:text-lp-text'
      )}
      aria-label="Clear artist and tour"
      title="Clear artist & tour"
    >
      <X size={17} strokeWidth={2.25} />
    </button>
  );
}

export function AppTopBarBreadcrumb() {
  const router = useRouter();
  const {
    selectedArtistId,
    selectedTourId,
    selectedArtist,
    selectedTour,
    setSelectedArtistId,
    setSelectedTourId,
    artists,
    tours,
    hydrated,
  } = useArtistTourContext();

  const [artistMenuOpen, setArtistMenuOpen] = useState(false);
  const [tourMenuOpen, setTourMenuOpen] = useState(false);
  const artistWrapRef = useRef<HTMLDivElement>(null);
  const tourWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!artistMenuOpen && !tourMenuOpen) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (artistWrapRef.current?.contains(t) || tourWrapRef.current?.contains(t)) return;
      setArtistMenuOpen(false);
      setTourMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [artistMenuOpen, tourMenuOpen]);

  if (!hydrated) {
    return (
      <div className="flex min-w-0 w-full max-w-2xl flex-1 items-center gap-3 sm:max-w-3xl" aria-hidden>
        <div className="h-9 w-9 shrink-0 rounded-md bg-lp-surface/60" />
        <div className="h-4 min-w-0 flex-1 rounded bg-lp-surface/40" />
      </div>
    );
  }

  if (!selectedArtistId) {
    return (
      <button
        type="button"
        onClick={() => router.push('/dashboard?select=artist')}
        className={cn(
          'flex min-h-[2.75rem] shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 py-2',
          'text-xs font-bold tracking-widest text-lp-orange transition-opacity hover:opacity-80'
        )}
        style={{ letterSpacing: '0.12em' }}
      >
        <span className="whitespace-nowrap">SELECT AN ARTIST →</span>
      </button>
    );
  }

  if (!selectedTourId) {
    return (
      <div className="flex min-w-0 w-full max-w-2xl flex-1 items-center gap-2 sm:max-w-3xl">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md ring-1 ring-lp-border">
            {selectedArtist?.spotify_image_url ? (
              <img src={selectedArtist.spotify_image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-lp-bg-secondary to-lp-bg-tertiary text-xs font-bold text-lp-text-secondary">
                {(selectedArtist?.name ?? '?').charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1 text-sm font-semibold text-lp-text">
            <span className="truncate">{selectedArtist?.name ?? 'Artist'}</span>
            <span className="text-lp-text-tertiary">/</span>
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="shrink-0 text-lp-orange transition-opacity hover:opacity-80"
            >
              Choose tour →
            </button>
          </div>
        </div>
        <ArtistTourScopeClearButton />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 w-full max-w-2xl flex-1 items-center gap-2 sm:max-w-3xl">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md ring-1 ring-lp-border">
          {selectedArtist?.spotify_image_url ? (
            <img src={selectedArtist.spotify_image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-lp-bg-secondary to-lp-bg-tertiary text-xs font-bold text-lp-text-secondary">
              {(selectedArtist?.name ?? '?').charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-1 text-sm font-semibold" style={{ color: 'var(--lp-text)' }}>
          <div className="group/artist relative min-w-0" ref={artistWrapRef}>
          <button
            type="button"
            onClick={() => {
              setTourMenuOpen(false);
              setArtistMenuOpen((o) => !o);
            }}
            className="inline-flex max-w-full items-center gap-1 truncate text-left transition-opacity hover:opacity-80"
            style={{ color: 'var(--lp-text)' }}
          >
            <span className="truncate">{selectedArtist?.name ?? 'Artist'}</span>
            <ChevronDown
              size={12}
              className="shrink-0 opacity-0 transition-opacity group-hover/artist:opacity-60"
              aria-hidden
            />
          </button>
          {artistMenuOpen && (
            <div
              className="absolute left-0 top-full z-50 mt-1 max-h-56 min-w-[12rem] overflow-y-auto rounded-lg border border-lp-border bg-lp-surface py-1 shadow-lg"
              role="listbox"
            >
              {artists.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="option"
                  className={cn(
                    'flex w-full px-3 py-2 text-left text-sm transition-colors hover:bg-lp-bg-tertiary',
                    a.id === selectedArtistId && 'bg-lp-bg-secondary font-medium'
                  )}
                  onClick={() => {
                    setSelectedArtistId(a.id);
                    setArtistMenuOpen(false);
                    router.push('/dashboard');
                  }}
                >
                  {a.name}
                </button>
              ))}
            </div>
          )}
          </div>

          <span className="shrink-0 text-lp-text-tertiary">/</span>

          <div className="group/tour relative min-w-0 flex-1" ref={tourWrapRef}>
            <button
              type="button"
              onClick={() => {
                setArtistMenuOpen(false);
                setTourMenuOpen((o) => !o);
              }}
              className="inline-flex w-full items-center gap-1 truncate text-left transition-opacity hover:opacity-80"
              style={{ color: 'var(--lp-text)' }}
            >
              <span className="truncate">{selectedTour?.name ?? 'Tour'}</span>
              <ChevronDown
                size={12}
                className="shrink-0 opacity-0 transition-opacity group-hover/tour:opacity-60"
                aria-hidden
              />
            </button>
            {tourMenuOpen && (
              <div
                className="absolute left-0 top-full z-50 mt-1 max-h-56 min-w-[12rem] overflow-y-auto rounded-lg border border-lp-border bg-lp-surface py-1 shadow-lg"
                role="listbox"
              >
                {tours.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="option"
                    className={cn(
                      'flex w-full px-3 py-2 text-left text-sm transition-colors hover:bg-lp-bg-tertiary',
                      t.id === selectedTourId && 'bg-lp-bg-secondary font-medium'
                    )}
                    onClick={() => {
                      setTourMenuOpen(false);
                      router.push(`/tours/${t.id}/overview`);
                      setSelectedTourId(t.id);
                    }}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <ArtistTourScopeClearButton />
    </div>
  );
}

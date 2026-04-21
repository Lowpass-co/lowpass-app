/* ============================================
   LOWPASS — AppTopBar breadcrumb

   Artist / Tour chooser for the top bar.

   Behavior copy of HeaderArtistTourPicker;

   that file is deprecated and deleted in PR A0.4.

   ============================================ */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { cn } from '@/lib/utils';

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
        <div className="h-8 w-8 shrink-0 rounded-md bg-lp-surface/60" />
        <div className="h-4 min-w-0 flex-1 rounded bg-lp-surface/40" />
      </div>
    );
  }

  if (!selectedArtistId) {
    return (
      <button
        type="button"
        onClick={() => router.push('/dashboard')}
        className="text-sm font-semibold text-lp-orange transition-opacity hover:opacity-80"
      >
        Choose artist →
      </button>
    );
  }

  if (!selectedTourId) {
    return (
      <div className="flex min-w-0 w-full max-w-2xl flex-1 items-center gap-3 sm:max-w-3xl">
        <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md ring-1 ring-lp-border">
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
    );
  }

  return (
    <div className="flex min-w-0 w-full max-w-2xl flex-1 items-center gap-3 sm:max-w-3xl">
      <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md ring-1 ring-lp-border">
        {selectedArtist?.spotify_image_url ? (
          <img src={selectedArtist.spotify_image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-lp-bg-secondary to-lp-bg-tertiary text-xs font-bold text-lp-text-secondary">
            {(selectedArtist?.name ?? '?').charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold" style={{ color: 'var(--lp-text)' }}>
        <div className="relative min-w-0" ref={artistWrapRef}>
          <button
            type="button"
            onClick={() => {
              setTourMenuOpen(false);
              setArtistMenuOpen((o) => !o);
            }}
            className="max-w-full truncate text-left transition-opacity hover:opacity-80"
            style={{ color: 'var(--lp-text)' }}
          >
            <span className="block truncate">{selectedArtist?.name ?? 'Artist'}</span>
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

        <div className="relative min-w-0 flex-1" ref={tourWrapRef}>
          <button
            type="button"
            onClick={() => {
              setArtistMenuOpen(false);
              setTourMenuOpen((o) => !o);
            }}
            className="w-full truncate text-left transition-opacity hover:opacity-80"
            style={{ color: 'var(--lp-text)' }}
          >
            <span className="block truncate">{selectedTour?.name ?? 'Tour'}</span>
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
                    setSelectedTourId(t.id);
                    setTourMenuOpen(false);
                    router.push(`/tours/${t.id}/advance`);
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
  );
}

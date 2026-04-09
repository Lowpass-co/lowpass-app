/* ============================================
   LOWPASS — Header Artist / Tour (scoped context)

   Sits next to “New Tour”; orange outline like that control.
   Makes the active artist and tour obvious; dropdowns to change.
   ============================================ */

'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, X } from 'lucide-react';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { cn } from '@/lib/utils';

export function HeaderArtistTourPicker() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
    hydrated,
  } = useArtistTourContext();

  const [artistOpen, setArtistOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const artistRef = useRef<HTMLDivElement>(null);
  const tourRef = useRef<HTMLDivElement>(null);

  const onManagePage =
    pathname?.startsWith('/budget') ||
    pathname?.startsWith('/tours/') ||
    pathname?.includes('/payroll') ||
    pathname?.includes('/rooming');

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

  function redirectAfterTourSwitch(newTourId: string) {
    if (!onManagePage) {
      router.push(`/budget?tour_id=${newTourId}&tab=summary`);
      return;
    }
    if (pathname?.startsWith('/budget')) {
      const tab = searchParams?.get('tab') ?? 'summary';
      router.push(`/budget?tour_id=${newTourId}&tab=${tab}`);
    } else if (pathname?.includes('/overview')) {
      router.push(`/tours/${newTourId}/overview`);
    } else if (pathname?.includes('/advance')) {
      router.push(`/tours/${newTourId}/advance`);
    } else if (pathname?.includes('/rooming')) {
      router.push(`/tours/${newTourId}/rooming`);
    } else if (pathname?.includes('/payroll')) {
      router.push(`/tours/${newTourId}/payroll`);
    } else {
      router.push(`/budget?tour_id=${newTourId}&tab=summary`);
    }
  }

  if (!hydrated) {
    return (
      <div
        className="min-h-[2.75rem] min-w-0 flex-1 rounded-lg border border-lp-border bg-lp-bg/50 sm:max-w-[min(100%,28rem)]"
        aria-hidden
      />
    );
  }

  return (
    <div
      className={cn(
        'relative flex min-w-0 max-w-full flex-1 flex-col justify-center rounded-lg border border-lp-orange bg-lp-bg/90 px-3 py-2 shadow-sm backdrop-blur-sm sm:max-w-[min(100%,28rem)]',
        'transition-colors duration-200 hover:border-lp-orange hover:bg-lp-bg'
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="relative mt-0.5 h-9 w-9 shrink-0 overflow-hidden rounded-full border border-lp-border bg-lp-bg-secondary">
          {selectedArtist?.spotify_image_url ? (
            <img src={selectedArtist.spotify_image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs font-bold text-lp-text-tertiary">
              {(selectedArtist?.name ?? '?').charAt(0).toUpperCase()}
            </div>
          )}
          {selectedArtistId && (
            <button
              type="button"
              onClick={() => {
                setSelectedArtistId(null);
                setArtistOpen(false);
                setTourOpen(false);
                if (onManagePage) router.push('/budget');
              }}
              className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-lp-orange bg-lp-bg text-[9px] font-bold text-lp-orange shadow-sm"
              aria-label="Clear artist and tour scope"
              title="Clear scope"
            >
              <X size={9} strokeWidth={2.5} />
            </button>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="relative" ref={artistRef}>
            <p className="text-[9px] font-extrabold uppercase tracking-widest text-lp-text-tertiary">
              Artist
            </p>
            <button
              type="button"
              onClick={() => {
                setArtistOpen((v) => !v);
                setTourOpen(false);
              }}
              className="flex w-full min-w-0 items-center justify-between gap-2 rounded-md py-0.5 text-left transition-colors hover:bg-lp-bg-tertiary/60"
            >
              <span
                className={cn(
                  'truncate text-sm font-bold tracking-tight',
                  selectedArtist ? 'text-lp-text' : 'text-lp-text-tertiary'
                )}
              >
                {selectedArtist?.name ?? 'Select artist'}
              </span>
              <ChevronDown size={14} className={cn('shrink-0 text-lp-text-tertiary', artistOpen && 'rotate-180')} />
            </button>
            {artistOpen && (
              <div className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-60 overflow-y-auto rounded-lg border border-lp-border bg-lp-surface py-1 shadow-xl">
                {artists.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setSelectedArtistId(a.id);
                      setArtistOpen(false);
                    }}
                    className={cn(
                      'w-full px-3 py-2 text-left text-sm hover:bg-lp-surface-hover',
                      selectedArtistId === a.id ? 'font-semibold text-lp-orange' : 'text-lp-text'
                    )}
                  >
                    <span className="truncate">{a.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative border-t border-lp-border/60 pt-1" ref={tourRef}>
            <p className="text-[9px] font-extrabold uppercase tracking-widest text-lp-text-tertiary">Tour</p>
            <div className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                disabled={!selectedArtistId || isLoading}
                onClick={() => {
                  setTourOpen((v) => !v);
                  setArtistOpen(false);
                }}
                className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md py-0.5 text-left transition-colors hover:bg-lp-bg-tertiary/60 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <span
                  className={cn(
                    'truncate text-sm font-bold tracking-tight',
                    selectedTour ? 'text-lp-orange' : 'text-lp-text-tertiary'
                  )}
                >
                  {isLoading && selectedArtistId ? 'Loading tours…' : selectedTour?.name ?? 'Select tour'}
                </span>
                <ChevronDown size={14} className={cn('shrink-0 text-lp-text-tertiary', tourOpen && 'rotate-180')} />
              </button>
              {selectedTourId && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTourId(null);
                    setTourOpen(false);
                    if (onManagePage) router.push('/budget');
                  }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-lp-text-tertiary hover:bg-lp-surface-hover hover:text-lp-orange"
                  aria-label="Clear selected tour"
                  title="Clear tour"
                >
                  <X size={16} strokeWidth={2} />
                </button>
              )}
            </div>
            {tourOpen && selectedArtistId && (
              <div className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-60 overflow-y-auto rounded-lg border border-lp-border bg-lp-surface py-1 shadow-xl">
                {tours.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSelectedTourId(t.id);
                      setTourOpen(false);
                      redirectAfterTourSwitch(t.id);
                    }}
                    className={cn(
                      'w-full px-3 py-2 text-left text-sm hover:bg-lp-surface-hover',
                      selectedTourId === t.id ? 'font-semibold text-lp-orange' : 'text-lp-text'
                    )}
                  >
                    <span className="truncate">{t.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

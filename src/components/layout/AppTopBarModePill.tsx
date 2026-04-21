'use client';

/* ============================================
   LOWPASS — AppTopBar mode pill

   [Advance | Budget] pill slider.

   Persists active pill to 'lp-sidebar-mode' localStorage

   (shared key with Sidebar — rename deferred to A0.4).

   ============================================ */

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { cn } from '@/lib/utils';

type Mode = 'advance' | 'budget';

const MODE_KEY = 'lp-sidebar-mode';

function resolveModeFromPath(pathname: string | null): Mode | null {
  if (!pathname) return null;
  if (pathname.startsWith('/budget')) return 'budget';
  if (pathname.includes('/advance')) return 'advance';
  return null;
}

export function AppTopBarModePill() {
  const router = useRouter();
  const pathname = usePathname();
  const { selectedTourId, selectedArtistId, hydrated } = useArtistTourContext();

  // Initial mode: url wins > localStorage > default 'advance'
  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window === 'undefined') return 'advance';
    const fromPath = resolveModeFromPath(window.location.pathname);
    if (fromPath) return fromPath;
    const stored = window.localStorage.getItem(MODE_KEY);
    return stored === 'budget' ? 'budget' : 'advance';
  });

  // Keep mode in sync with URL changes (covers sidebar clicks etc.)
  useEffect(() => {
    const fromPath = resolveModeFromPath(pathname);
    if (!fromPath) return;
    queueMicrotask(() => {
      setMode((m) => (m !== fromPath ? fromPath : m));
    });
  }, [pathname]);

  // Persist user-initiated changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(MODE_KEY, mode);
  }, [mode]);

  const go = (next: Mode) => {
    setMode(next);
    const artistQ = selectedArtistId ? `?artist_id=${selectedArtistId}` : '';
    if (next === 'advance') {
      router.push(selectedTourId ? `/tours/${selectedTourId}/advance` : `/advance${artistQ}`);
    } else {
      router.push(selectedTourId ? `/budget?tour_id=${selectedTourId}` : '/budget');
    }
  };

  // Skeleton while hydrating
  if (!hydrated) {
    return <div className="h-10 w-48 rounded-full bg-lp-surface/60" aria-hidden />;
  }

  return (
    <div
      role="tablist"
      aria-label="Section"
      className="relative flex h-10 w-48 items-center rounded-full border border-lp-border bg-lp-surface p-1 shadow-sm"
    >
      {/* Animated indicator */}
      <div
        aria-hidden
        className={cn(
          'absolute top-1 bottom-1 w-[calc(50%-0.25rem)] rounded-full bg-lp-orange shadow-sm transition-transform duration-200 ease-out',
          mode === 'advance' ? 'translate-x-0' : 'translate-x-full'
        )}
        style={{ left: '0.25rem' }}
      />
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'advance'}
        aria-pressed={mode === 'advance'}
        onClick={() => go('advance')}
        className={cn(
          'relative z-10 flex-1 rounded-full px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lp-orange focus-visible:ring-offset-2 focus-visible:ring-offset-lp-bg',
          mode === 'advance' ? 'text-white' : 'text-lp-text-secondary hover:text-lp-text'
        )}
      >
        Advance
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'budget'}
        aria-pressed={mode === 'budget'}
        onClick={() => go('budget')}
        className={cn(
          'relative z-10 flex-1 rounded-full px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lp-orange focus-visible:ring-offset-2 focus-visible:ring-offset-lp-bg',
          mode === 'budget' ? 'text-white' : 'text-lp-text-secondary hover:text-lp-text'
        )}
      >
        Budget
      </button>
    </div>
  );
}

/* ============================================
   LOWPASS — Artist Picker Gate

   Intercepts all authenticated pages before AppShell renders.
   If no artist is selected (and localStorage has been read), shows
   a full-page artist picker. Once an artist is chosen, the normal
   app shell appears.
   ============================================ */

'use client';

import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { cn } from '@/lib/utils';

export function ArtistPickerGate({ children }: { children: React.ReactNode }) {
  const { selectedArtistId, artists, hydrated, setSelectedArtistId } = useArtistTourContext();

  // Wait for localStorage to be read — prevents a flash of the picker on load
  if (!hydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-lp-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-lp-border border-t-lp-orange" />
      </div>
    );
  }

  // No artist selected — show full-page picker
  if (!selectedArtistId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-lp-bg p-6">
        <div className="w-full max-w-sm space-y-8">

          {/* Wordmark */}
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-lp-text-tertiary">Lowpass</p>
            <h1 className="mt-2 text-2xl font-bold text-lp-text">Who are you working with?</h1>
            <p className="mt-1 text-sm text-lp-text-secondary">Select an artist to continue</p>
          </div>

          {/* Artist list */}
          <div className="space-y-2">
            {artists.length === 0 ? (
              /* Loading or empty state */
              <div className="flex flex-col items-center gap-3 py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-lp-border border-t-lp-orange" />
                <p className="text-sm text-lp-text-tertiary">Loading artists…</p>
              </div>
            ) : (
              artists.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedArtistId(a.id)}
                  className={cn(
                    'flex w-full items-center gap-4 rounded-xl border border-lp-border bg-lp-surface p-4 text-left',
                    'hover:border-lp-orange hover:bg-lp-surface-hover transition-all duration-150'
                  )}
                >
                  {/* Artist image */}
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-lp-border bg-lp-bg">
                    {a.spotify_image_url ? (
                      <img
                        src={a.spotify_image_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-lg font-bold text-lp-text-tertiary">
                        {(a.name ?? '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  {/* Name */}
                  <span className="text-base font-semibold text-lp-text">{a.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // Artist is selected — render the normal app
  return <>{children}</>;
}

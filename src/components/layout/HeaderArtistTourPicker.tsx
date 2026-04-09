/* ============================================
   LOWPASS — Header artist scope (picker only)

   Tour selection lives in the sidebar under Tour Management.
   ============================================ */

'use client';

import { useMemo } from 'react';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { StyledSelect, type StyledSelectOption } from '@/components/ui/StyledSelect';

export function HeaderArtistTourPicker() {
  const { selectedArtistId, selectedArtist, setSelectedArtistId, artists, hydrated } =
    useArtistTourContext();

  const artistOptions: StyledSelectOption<string>[] = useMemo(
    () => [
      { value: '', label: 'Select artist' },
      ...artists.map((a) => ({ value: a.id, label: a.name })),
    ],
    [artists]
  );

  if (!hydrated) {
    return (
      <div className="flex min-w-0 max-w-md flex-1 items-center gap-3" aria-hidden>
        <div className="h-12 w-12 shrink-0 rounded-2xl bg-lp-surface/60" />
        <div className="h-11 flex-1 rounded-xl border border-lp-border bg-lp-surface/40" />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 max-w-md flex-1 items-center gap-3 sm:max-w-lg">
      <div
        className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl shadow-md ring-2 ring-lp-orange/20 ring-offset-2 ring-offset-lp-bg dark:ring-offset-lp-bg"
        style={{ boxShadow: '0 4px 14px -4px rgba(255, 69, 0, 0.35)' }}
      >
        {selectedArtist?.spotify_image_url ? (
          <img
            src={selectedArtist.spotify_image_url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-lp-bg-secondary to-lp-bg-tertiary text-sm font-bold text-lp-text-secondary">
            {(selectedArtist?.name ?? '?').charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 rounded-2xl border border-lp-border/80 bg-gradient-to-br from-lp-surface/90 to-lp-bg/80 px-3 py-2 shadow-sm backdrop-blur-md dark:from-lp-surface/50 dark:to-lp-bg/40">
        <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.2em] text-lp-text-tertiary">
          Working under
        </p>
        <StyledSelect
          value={selectedArtistId ?? ''}
          onChange={(v) => setSelectedArtistId(v || null)}
          options={artistOptions}
          placeholder="Choose an artist"
        />
      </div>
    </div>
  );
}

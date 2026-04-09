/* ============================================
   LOWPASS — Header artist scope (picker only)

   Tour selection lives in the sidebar under Tour Management.
   ============================================ */

'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { UserPlus } from 'lucide-react';
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
      <div className="flex min-w-0 w-full max-w-2xl flex-1 items-center gap-3 sm:max-w-3xl" aria-hidden>
        <div className="h-3 w-12 shrink-0 rounded bg-lp-surface/60" />
        <div className="h-12 w-12 shrink-0 rounded-2xl bg-lp-surface/60" />
        <div className="h-11 min-w-0 flex-1 rounded-xl border border-lp-border bg-lp-surface/40" />
        <div className="h-9 w-24 shrink-0 rounded-lg bg-lp-surface/60" />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 w-full max-w-2xl flex-1 items-center gap-3 sm:max-w-3xl">
      <span
        className="shrink-0 text-[10px] font-extrabold uppercase tracking-[0.15em] text-lp-text-tertiary"
        id="header-artist-label"
      >
        Artist
      </span>

      <div
        className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl shadow-md ring-2 ring-lp-orange/20 ring-offset-2 ring-offset-lp-bg dark:ring-offset-lp-bg"
        style={{ boxShadow: '0 4px 14px -4px rgba(255, 69, 0, 0.35)' }}
        aria-hidden={!selectedArtist}
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

      <div className="min-w-0 flex-1" aria-labelledby="header-artist-label">
        <StyledSelect
          value={selectedArtistId ?? ''}
          onChange={(v) => setSelectedArtistId(v || null)}
          options={artistOptions}
          placeholder="Choose an artist"
        />
      </div>

      <Link
        href="/artists"
        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-lp-orange px-3 py-2 text-xs font-bold uppercase tracking-wider text-lp-orange transition-colors duration-200 hover:bg-lp-orange hover:text-white dark:hover:text-black"
        style={{ letterSpacing: '0.08em' }}
      >
        <UserPlus size={14} strokeWidth={2.5} className="shrink-0" />
        <span className="whitespace-nowrap">New artist</span>
      </Link>
    </div>
  );
}

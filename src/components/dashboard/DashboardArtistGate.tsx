'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus } from 'lucide-react';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import type { Tour } from '@/types';
import { cn } from '@/lib/utils';

function formatTourDateRange(start: string, end: string): string {
  const s = new Date(`${start}T12:00:00`);
  const e = new Date(`${end}T12:00:00`);
  if (s.getFullYear() === e.getFullYear()) {
    const sm = s.toLocaleDateString('en-GB', { month: 'short' });
    const em = e.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    return `${sm} – ${em}`;
  }
  const a = s.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  const b = e.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  return `${a} – ${b}`;
}

function statusBadgeClass(status: Tour['status']): string {
  switch (status) {
    case 'planning':
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-400';
    case 'active':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400';
    case 'completed':
      return 'bg-zinc-400/20 text-zinc-600 dark:text-zinc-400';
    case 'archived':
      return 'bg-red-500/15 text-red-700 dark:text-red-400';
    default:
      return 'bg-zinc-400/20 text-zinc-600 dark:text-zinc-400';
  }
}

export function DashboardArtistGate({ children }: { children: React.ReactNode }) {
  const {
    selectedArtistId,
    selectedTourId,
    selectedArtist,
    artists,
    artistsLoaded,
    hydrated,
    setSelectedArtistId,
    setSelectedTourId,
    tours,
    isLoading,
  } = useArtistTourContext();

  if (!hydrated) {
    return (
      <div className="mx-auto min-h-[60vh] max-w-7xl px-2 sm:px-0" aria-busy="true">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse overflow-hidden rounded-xl border border-lp-border bg-lp-surface/40">
              <div className="aspect-square bg-lp-surface-hover/80" />
              <div className="mx-auto mb-4 mt-3 h-4 w-3/4 rounded bg-lp-surface-hover/80" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!selectedArtistId) {
    if (!artistsLoaded) {
      return (
        <div className="mx-auto min-h-[60vh] max-w-7xl px-2 sm:px-0" aria-busy="true">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse overflow-hidden rounded-xl border border-lp-border bg-lp-surface/40">
                <div className="aspect-square bg-lp-surface-hover/80" />
                <div className="mx-auto mb-4 mt-3 h-4 w-3/4 rounded bg-lp-surface-hover/80" />
              </div>
            ))}
          </div>
        </div>
      );
    }
    return <DashboardChooseArtist artists={artists} onPick={setSelectedArtistId} />;
  }

  if (!selectedTourId) {
    return (
      <DashboardChooseTour
        artistName={selectedArtist?.name ?? 'Artist'}
        tours={tours}
        isLoading={isLoading}
        onBack={() => setSelectedArtistId(null)}
        onPickTour={(tourId) => {
          setSelectedTourId(tourId);
        }}
      />
    );
  }

  return <>{children}</>;
}

function DashboardChooseArtist({
  artists,
  onPick,
}: {
  artists: { id: string; name: string; spotify_image_url?: string }[];
  onPick: (id: string) => void;
}) {
  return (
    <div className="mx-auto max-w-7xl px-2 py-8 sm:px-0">
      <h1 className="text-2xl font-bold text-lp-text">Choose an artist to get started</h1>
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {artists.map((artist) => (
          <button
            key={artist.id}
            type="button"
            onClick={() => onPick(artist.id)}
            className="group flex flex-col overflow-hidden rounded-xl border border-lp-border bg-lp-surface text-left transition-transform hover:scale-[1.02] hover:ring-1 hover:ring-lp-orange"
          >
            <div className="aspect-square w-full overflow-hidden bg-lp-bg-tertiary">
              {artist.spotify_image_url ? (
                <img src={artist.spotify_image_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-lp-bg-secondary to-lp-bg-tertiary text-3xl font-bold text-lp-text-secondary">
                  {artist.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <p className="px-2 py-3 text-center text-[13px] font-semibold text-lp-text">{artist.name}</p>
          </button>
        ))}
        <Link
          href="/artists"
          className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-lp-border bg-lp-surface/50 text-lp-text-secondary transition-colors hover:border-lp-orange hover:bg-lp-surface-hover hover:text-lp-orange"
        >
          <Plus className="h-8 w-8" strokeWidth={1.5} />
          <span className="text-[13px] font-semibold">Add new artist</span>
        </Link>
      </div>
    </div>
  );
}

function DashboardChooseTour({
  artistName,
  tours,
  isLoading,
  onBack,
  onPickTour,
}: {
  artistName: string;
  tours: Tour[];
  isLoading: boolean;
  onBack: () => void;
  onPickTour: (tourId: string) => void;
}) {
  const router = useRouter();
  const list = tours.slice(0, 20);

  return (
    <div className="mx-auto max-w-2xl px-2 py-8 sm:px-0">
      <button
        type="button"
        onClick={onBack}
        className="mb-6 flex items-center gap-1.5 text-sm font-medium text-lp-text-secondary transition-colors hover:text-lp-orange"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>
      <h1 className="text-2xl font-bold text-lp-text">{artistName}</h1>
      <p className="mt-1 text-sm text-lp-text-secondary">Select a tour to open advances for that run.</p>

      <div className="mt-8 space-y-2">
        {isLoading && (
          <div className="rounded-lg border border-lp-border bg-lp-surface/60 px-4 py-6 text-center text-sm text-lp-text-secondary">
            Loading tours…
          </div>
        )}
        {!isLoading && list.length === 0 && (
          <p className="rounded-lg border border-lp-border bg-lp-surface/40 px-4 py-8 text-center text-lp-text-secondary">
            No tours yet for this artist. Create one.
          </p>
        )}
        {!isLoading &&
          list.map((tour) => (
            <button
              key={tour.id}
              type="button"
              onClick={() => {
                onPickTour(tour.id);
                router.push(`/tours/${tour.id}/advance`);
              }}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-lp-border bg-lp-surface px-4 py-3 text-left transition-colors hover:border-lp-orange/40 hover:bg-lp-surface-hover"
            >
              <div className="min-w-0 flex-1">
                <div className="font-bold text-lp-text">{tour.name}</div>
                <div className="mt-0.5 text-sm text-lp-text-secondary">{formatTourDateRange(tour.start_date, tour.end_date)}</div>
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                  statusBadgeClass(tour.status)
                )}
              >
                {tour.status}
              </span>
            </button>
          ))}
      </div>

      <Link
        href="/tours/create"
        className="mt-6 inline-flex items-center justify-center rounded-lg border border-lp-orange bg-lp-orange px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        New tour
      </Link>
    </div>
  );
}

'use client';

import { useState, useMemo } from 'react';
import { Search, Filter } from 'lucide-react';
import { TourCard } from '@/components/tours/TourCard';
import { capitaliseStatus } from '@/lib/utils';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { BrandedSelect } from '@/components/ui/BrandedSelect';
import type { Tour } from '@/types';

const STATUS_OPTIONS = ['planning', 'active', 'completed', 'archived'] as const;

export function ToursListWithFilters({ tours }: { tours: Tour[] }) {
  const { selectedArtistId, selectedArtist } = useArtistTourContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterArtistId, setFilterArtistId] = useState<string>('');

  const distinctArtists = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; name: string }[] = [];
    for (const t of tours) {
      const a = t.artist;
      if (a?.id && !seen.has(a.id)) {
        seen.add(a.id);
        out.push({ id: a.id, name: a.name ?? '—' });
      }
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [tours]);

  const scopedArtistId = selectedArtistId ?? '';

  const filteredTours = useMemo(() => {
    let list = tours;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.artist?.name ?? '').toLowerCase().includes(q)
      );
    }
    if (filterStatus) {
      list = list.filter((t) => t.status === filterStatus);
    }
    const artistKey = scopedArtistId || filterArtistId;
    if (artistKey) {
      list = list.filter((t) => t.artist?.id === artistKey);
    }
    return list;
  }, [tours, searchQuery, filterStatus, filterArtistId, scopedArtistId]);

  return (
    <div className="space-y-4">
      {scopedArtistId && (
        <p className="rounded-lg border border-lp-orange/30 bg-lp-orange/5 px-3 py-2 text-sm text-lp-text-secondary">
          Showing tours for{' '}
          <span className="font-semibold text-lp-text">{selectedArtist?.name ?? 'selected artist'}</span>{' '}
          only. Clear the header artist scope to see every tour.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-lp-text-tertiary" />
          <input
            type="search"
            placeholder="Search tours or artist..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-lp-border bg-lp-bg py-2 pl-9 pr-3 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:outline-none focus:ring-2 focus:ring-lp-orange/50"
            aria-label="Search tours"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-lp-text-tertiary" />
          <BrandedSelect
            value={filterStatus}
            onChange={setFilterStatus}
            options={[
              { value: '', label: 'All statuses' },
              ...STATUS_OPTIONS.map((s) => ({ value: s, label: capitaliseStatus(s) })),
            ]}
            ariaLabel="Filter by status"
          />
          {scopedArtistId ? (
            <div
              className="flex min-w-[140px] items-center rounded-lg border border-lp-orange/40 bg-lp-orange/5 px-3 py-2 text-sm font-medium text-lp-text"
              title="Clear the header artist scope to see all tours"
            >
              <span className="truncate">{selectedArtist?.name ?? 'Artist scope'}</span>
            </div>
          ) : (
            <BrandedSelect
              value={filterArtistId}
              onChange={setFilterArtistId}
              options={[
                { value: '', label: 'All artists' },
                ...distinctArtists.map((a) => ({ value: a.id, label: a.name })),
              ]}
              ariaLabel="Filter by artist"
              minWidth={140}
            />
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredTours.map((tour, index) => (
          <TourCard key={tour.id} tour={tour} index={index} />
        ))}
      </div>
      {filteredTours.length === 0 && (
        <p className="py-8 text-center text-sm text-lp-text-tertiary">
          No tours match your search or filters.
        </p>
      )}
    </div>
  );
}

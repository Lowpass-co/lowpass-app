'use client';

import { useState, useMemo } from 'react';
import { Search, Filter } from 'lucide-react';
import { TourCard } from '@/components/tours/TourCard';
import { capitaliseStatus } from '@/lib/utils';
import type { Tour } from '@/types';

const STATUS_OPTIONS = ['planning', 'active', 'completed', 'archived'] as const;

export function ToursListWithFilters({ tours }: { tours: Tour[] }) {
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
    if (filterArtistId) {
      list = list.filter((t) => t.artist?.id === filterArtistId);
    }
    return list;
  }, [tours, searchQuery, filterStatus, filterArtistId]);

  return (
    <div className="space-y-4">
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
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-lp-border bg-lp-bg px-3 py-2 text-sm text-lp-text focus:outline-none focus:ring-2 focus:ring-lp-orange/50"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {capitaliseStatus(s)}
              </option>
            ))}
          </select>
          <select
            value={filterArtistId}
            onChange={(e) => setFilterArtistId(e.target.value)}
            className="rounded-lg border border-lp-border bg-lp-bg px-3 py-2 text-sm text-lp-text focus:outline-none focus:ring-2 focus:ring-lp-orange/50 min-w-[140px]"
            aria-label="Filter by artist"
          >
            <option value="">All artists</option>
            {distinctArtists.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
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

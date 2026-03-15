'use client';

import { useState, useMemo, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Plus, ArrowUpDown, Filter } from 'lucide-react';
import { capitaliseStatus } from '@/lib/utils';
import type { Tour } from '@/types';
import { DashboardTourCard } from '@/components/dashboard/DashboardTourCard';
import { cn } from '@/lib/utils';

type SortOrder = 'date_asc' | 'date_desc';
type FilterArtist = string;
type FilterStatus = string;
type FilterMonth = string;

export function DashboardTourList({ tours }: { tours: Tour[] }) {
  const [sortOrder, setSortOrder] = useState<SortOrder>('date_desc');
  const [filterArtist, setFilterArtist] = useState<FilterArtist>('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('');
  const [filterMonth, setFilterMonth] = useState<FilterMonth>('');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [sortMenuRect, setSortMenuRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [filterMenuRect, setFilterMenuRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const sortButtonRef = useRef<HTMLButtonElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (sortMenuOpen && sortButtonRef.current) {
      const rect = sortButtonRef.current.getBoundingClientRect();
      setSortMenuRect({ top: rect.bottom + 4, left: rect.left, width: Math.max(160, rect.width) });
    } else setSortMenuRect(null);
  }, [sortMenuOpen]);

  useLayoutEffect(() => {
    if (filterMenuOpen && filterButtonRef.current) {
      const rect = filterButtonRef.current.getBoundingClientRect();
      setFilterMenuRect({ top: rect.bottom + 4, left: rect.left, width: Math.max(180, rect.width) });
    } else setFilterMenuRect(null);
  }, [filterMenuOpen]);

  const artists = useMemo(() => {
    const set = new Set<string>();
    tours.forEach((t) => t.artist?.name && set.add(t.artist.name));
    return Array.from(set).sort();
  }, [tours]);

  const statuses = useMemo(() => {
    const set = new Set<string>(tours.map((t) => t.status));
    return Array.from(set).sort();
  }, [tours]);

  const months = useMemo(() => {
    const set = new Set<string>();
    tours.forEach((t) => {
      const m = t.start_date.slice(0, 7);
      set.add(m);
    });
    return Array.from(set).sort().reverse();
  }, [tours]);

  const filteredAndSorted = useMemo(() => {
    let list = [...tours];
    if (filterArtist) list = list.filter((t) => t.artist?.name === filterArtist);
    if (filterStatus) list = list.filter((t) => t.status === filterStatus);
    if (filterMonth) list = list.filter((t) => t.start_date.slice(0, 7) === filterMonth);
    list.sort((a, b) => {
      const da = a.start_date;
      const db = b.start_date;
      return sortOrder === 'date_asc' ? da.localeCompare(db) : db.localeCompare(da);
    });
    return list;
  }, [tours, filterArtist, filterStatus, filterMonth, sortOrder]);

  return (
    <div className="lp-dashboard-glass-card rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-lp-text">Tours</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              ref={sortButtonRef}
              type="button"
              onClick={() => { setFilterMenuOpen(false); setSortMenuOpen((o) => !o); }}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-lp-border bg-lp-surface text-lp-text hover:bg-lp-surface-hover"
              aria-label="Sort by date"
            >
              <ArrowUpDown size={18} />
            </button>
            {sortMenuOpen &&
              sortMenuRect &&
              typeof document !== 'undefined' &&
              createPortal(
                <>
                  <div className="lp-dropdown-layer fixed inset-0" aria-hidden onClick={() => setSortMenuOpen(false)} />
                  <div
                    className="lp-dropdown-layer fixed min-w-[160px] rounded-xl border border-lp-border bg-lp-surface py-1 shadow-lg"
                    style={{ top: sortMenuRect.top, left: sortMenuRect.left, width: sortMenuRect.width }}
                  >
                    <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-lp-text-tertiary">
                      Date order
                    </p>
                    <button
                      type="button"
                      onClick={() => { setSortOrder('date_asc'); setSortMenuOpen(false); }}
                      className={cn('w-full px-3 py-2 text-left text-sm', sortOrder === 'date_asc' && 'bg-lp-orange/10 text-lp-orange')}
                    >
                      Earliest first
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSortOrder('date_desc'); setSortMenuOpen(false); }}
                      className={cn('w-full px-3 py-2 text-left text-sm', sortOrder === 'date_desc' && 'bg-lp-orange/10 text-lp-orange')}
                    >
                      Latest first
                    </button>
                  </div>
                </>,
                document.body
              )}
          </div>
          <div className="relative">
            <button
              ref={filterButtonRef}
              type="button"
              onClick={() => { setSortMenuOpen(false); setFilterMenuOpen((o) => !o); }}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-lp-border bg-lp-surface text-lp-text hover:bg-lp-surface-hover"
              aria-label="Filter tours"
            >
              <Filter size={18} />
            </button>
            {filterMenuOpen &&
              filterMenuRect &&
              typeof document !== 'undefined' &&
              createPortal(
                <>
                  <div className="lp-dropdown-layer fixed inset-0" aria-hidden onClick={() => setFilterMenuOpen(false)} />
                  <div
                    className="lp-dropdown-layer fixed min-w-[180px] max-h-[70vh] overflow-y-auto rounded-xl border border-lp-border bg-lp-surface py-1 shadow-lg"
                    style={{ top: filterMenuRect.top, left: filterMenuRect.left, width: filterMenuRect.width }}
                  >
                    <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-lp-text-tertiary">
                      Filter by
                    </p>
                    {artists.length > 0 && (
                      <>
                        <p className="px-3 py-0.5 text-xs text-lp-text-tertiary">Artist</p>
                        {artists.map((a) => (
                          <button
                            key={a}
                            type="button"
                            onClick={() => { setFilterArtist((f) => (f === a ? '' : a)); setFilterMenuOpen(false); }}
                            className={cn('w-full px-3 py-1.5 text-left text-sm', filterArtist === a && 'bg-lp-orange/10 text-lp-orange')}
                          >
                            {a}
                          </button>
                        ))}
                      </>
                    )}
                    {statuses.length > 0 && (
                      <>
                        <p className="px-3 py-0.5 text-xs text-lp-text-tertiary">Status</p>
                        {statuses.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => { setFilterStatus((f) => (f === s ? '' : s)); setFilterMenuOpen(false); }}
                            className={cn('w-full px-3 py-1.5 text-left text-sm', filterStatus === s && 'bg-lp-orange/10 text-lp-orange')}
                          >
                            {capitaliseStatus(s)}
                          </button>
                        ))}
                      </>
                    )}
                    {months.length > 0 && (
                      <>
                        <p className="px-3 py-0.5 text-xs text-lp-text-tertiary">Month</p>
                        {months.map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => { setFilterMonth((f) => (f === m ? '' : m)); setFilterMenuOpen(false); }}
                            className={cn('w-full px-3 py-1.5 text-left text-sm', filterMonth === m && 'bg-lp-orange/10 text-lp-orange')}
                          >
                            {m}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                </>,
                document.body
              )}
          </div>
        </div>
      </div>

      {!tours.length ? (
        <div className="mt-4 rounded-xl border-2 border-dashed border-lp-border p-8 text-center">
          <p className="text-lp-text-secondary">No active tours yet.</p>
          <Link
            href="/tours/create"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-lp-orange px-4 py-2.5 text-sm font-medium text-white hover:bg-lp-orange-hover"
          >
            <Plus size={16} />
            Create your first tour
          </Link>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {filteredAndSorted.map((tour) => (
            <DashboardTourCard key={tour.id} tour={tour} />
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useMemo, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Plus, ArrowUpDown, Check, ChevronDown } from 'lucide-react';
import type { Tour, TourStatus } from '@/types';
import { DashboardTourCard } from '@/components/dashboard/DashboardTourCard';
import { cn } from '@/lib/utils';

type SortOrder = 'date_asc' | 'date_desc' | 'artist_asc' | 'artist_desc';

const STATUS_OPTIONS: { value: '' | TourStatus; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

function artistSortKey(tour: Tour): string {
  return (tour.artist?.name ?? tour.name ?? '').trim();
}

export function DashboardTourList({ tours }: { tours: Tour[] }) {
  const [sortOrder, setSortOrder] = useState<SortOrder>('date_desc');
  const [statusFilter, setStatusFilter] = useState<'' | TourStatus>('');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [sortMenuRect, setSortMenuRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [statusMenuRect, setStatusMenuRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const sortButtonRef = useRef<HTMLButtonElement>(null);
  const statusButtonRef = useRef<HTMLButtonElement>(null);

  const dropdownPanelClass =
    'lp-dropdown-layer fixed min-w-[200px] rounded-xl border border-lp-border bg-lp-surface py-1 shadow-lg';

  useLayoutEffect(() => {
    if (sortMenuOpen && sortButtonRef.current) {
      const rect = sortButtonRef.current.getBoundingClientRect();
      setSortMenuRect({ top: rect.bottom + 4, left: rect.left, width: Math.max(200, rect.width) });
    } else setSortMenuRect(null);
  }, [sortMenuOpen]);

  useLayoutEffect(() => {
    if (statusMenuOpen && statusButtonRef.current) {
      const rect = statusButtonRef.current.getBoundingClientRect();
      setStatusMenuRect({ top: rect.bottom + 4, left: rect.left, width: Math.max(200, rect.width) });
    } else setStatusMenuRect(null);
  }, [statusMenuOpen]);

  const statusLabel = STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? 'All';

  const filteredAndSorted = useMemo(() => {
    let list = [...tours];
    if (statusFilter) {
      list = list.filter((t) => t.status === statusFilter);
    }
    list.sort((a, b) => {
      if (sortOrder === 'artist_asc' || sortOrder === 'artist_desc') {
        const na = artistSortKey(a).toLowerCase();
        const nb = artistSortKey(b).toLowerCase();
        const cmp = na.localeCompare(nb, 'en', { sensitivity: 'base' });
        return sortOrder === 'artist_asc' ? cmp : -cmp;
      }
      const da = a.start_date;
      const db = b.start_date;
      return sortOrder === 'date_asc' ? da.localeCompare(db) : db.localeCompare(da);
    });
    return list;
  }, [tours, statusFilter, sortOrder]);

  return (
    <div className="lp-dashboard-glass-card rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-lp-text-tertiary">Tours</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <button
              ref={sortButtonRef}
              type="button"
              onClick={() => {
                setStatusMenuOpen(false);
                setSortMenuOpen((o) => !o);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-lp-border bg-lp-surface text-lp-text hover:bg-lp-surface-hover"
              aria-label="Sort tours"
              aria-expanded={sortMenuOpen}
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
                    className={dropdownPanelClass}
                    style={{ top: sortMenuRect.top, left: sortMenuRect.left, width: sortMenuRect.width }}
                  >
                    <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-lp-text-tertiary">
                      Date order
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSortOrder('date_asc');
                        setSortMenuOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
                        sortOrder === 'date_asc' && 'bg-lp-surface-hover'
                      )}
                    >
                      <span className="flex-1 truncate">Earliest first</span>
                      {sortOrder === 'date_asc' && <Check size={14} className="shrink-0 text-lp-orange" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSortOrder('date_desc');
                        setSortMenuOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
                        sortOrder === 'date_desc' && 'bg-lp-surface-hover'
                      )}
                    >
                      <span className="flex-1 truncate">Latest first</span>
                      {sortOrder === 'date_desc' && <Check size={14} className="shrink-0 text-lp-orange" />}
                    </button>
                    <p className="mt-1 border-t border-lp-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-lp-text-tertiary">
                      Artist
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSortOrder('artist_asc');
                        setSortMenuOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
                        sortOrder === 'artist_asc' && 'bg-lp-surface-hover'
                      )}
                    >
                      <span className="flex-1 truncate">A–Z</span>
                      {sortOrder === 'artist_asc' && <Check size={14} className="shrink-0 text-lp-orange" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSortOrder('artist_desc');
                        setSortMenuOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
                        sortOrder === 'artist_desc' && 'bg-lp-surface-hover'
                      )}
                    >
                      <span className="flex-1 truncate">Z–A</span>
                      {sortOrder === 'artist_desc' && <Check size={14} className="shrink-0 text-lp-orange" />}
                    </button>
                  </div>
                </>,
                document.body
              )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-lp-text-tertiary">Status</span>
            <div className="relative">
              <button
                ref={statusButtonRef}
                type="button"
                onClick={() => {
                  setSortMenuOpen(false);
                  setStatusMenuOpen((o) => !o);
                }}
                className={cn(
                  'flex h-9 min-w-[9.5rem] items-center justify-between gap-2 rounded-lg border border-lp-border bg-lp-surface px-3 text-left text-sm text-lp-text',
                  'hover:bg-lp-surface-hover focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange'
                )}
                aria-label="Filter tours by status"
                aria-expanded={statusMenuOpen}
                aria-haspopup="listbox"
              >
                <span className="min-w-0 truncate">{statusLabel}</span>
                <ChevronDown size={16} className={cn('shrink-0 text-lp-text-tertiary transition-transform', statusMenuOpen && 'rotate-180')} />
              </button>
              {statusMenuOpen &&
                statusMenuRect &&
                typeof document !== 'undefined' &&
                createPortal(
                  <>
                    <div className="lp-dropdown-layer fixed inset-0" aria-hidden onClick={() => setStatusMenuOpen(false)} />
                    <div
                      className={dropdownPanelClass}
                      role="listbox"
                      aria-label="Status"
                      style={{ top: statusMenuRect.top, left: statusMenuRect.left, width: statusMenuRect.width }}
                    >
                      <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-lp-text-tertiary">
                        Status
                      </p>
                      {STATUS_OPTIONS.map(({ value, label }) => (
                        <button
                          key={value || 'all'}
                          type="button"
                          role="option"
                          aria-selected={statusFilter === value}
                          onClick={() => {
                            setStatusFilter(value);
                            setStatusMenuOpen(false);
                          }}
                          className={cn(
                            'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
                            statusFilter === value && 'bg-lp-surface-hover'
                          )}
                        >
                          <span className="flex-1 truncate">{label}</span>
                          {statusFilter === value && <Check size={14} className="shrink-0 text-lp-orange" />}
                        </button>
                      ))}
                    </div>
                  </>,
                  document.body
                )}
            </div>
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
      ) : filteredAndSorted.length === 0 ? (
        <div className="mt-4 rounded-xl border border-lp-border/60 bg-lp-surface/40 px-4 py-8 text-center text-sm text-lp-text-secondary">
          No tours match this status.
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

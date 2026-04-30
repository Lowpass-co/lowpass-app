'use client';

import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, Loader2 } from 'lucide-react';
import { formatTourDateRange } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { pushRecentTourId } from '@/_legacy/budget/budget-recent';
import { pushRecentTourId as pushRecentTourIdRooming } from './rooming-recent';

const BUDGET_STORAGE_KEY = 'lowpass_selected_budget_tour';

type Tour = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  currency: string;
  artist?: { name: string } | null;
};

type BudgetTourSelectorProps = {
  basePath?: string;
  tabParam?: string;
  defaultTab?: string;
  className?: string;
  /** localStorage key for selected tour (e.g. budget vs rooming) */
  storageKey?: string;
  /** When true, tour name is constrained so it doesn't run into the Breakdown column */
  constrainTourName?: boolean;
};

export function BudgetTourSelector({
  basePath = '/budget',
  tabParam,
  defaultTab,
  className,
  storageKey = BUDGET_STORAGE_KEY,
  constrainTourName = false,
}: BudgetTourSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tourIdFromUrl = searchParams.get('tour_id');
  const tabFromUrl = searchParams.get('tab') ?? defaultTab;

  const [tours, setTours] = useState<Tour[]>([]);
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selectedTour = tours.find((t) => t.id === tourIdFromUrl) ?? null;
  const displayTourId = tourIdFromUrl ?? (typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null);
  const displayTour = tours.find((t) => t.id === displayTourId) ?? selectedTour;

  const buildUrl = useCallback(
    (tourId: string | null, tab?: string) => {
      const params = new URLSearchParams();
      if (tourId) params.set('tour_id', tourId);
      if (tab ?? tabFromUrl) params.set('tab', (tab ?? tabFromUrl) ?? '');
      const q = params.toString();
      return q ? `${basePath}?${q}` : basePath;
    },
    [basePath, tabFromUrl]
  );

  useEffect(() => {
    fetch('/api/tours')
      .then((r) => (r.ok ? r.json() : { tours: [] }))
      .then((data) => setTours(data.tours ?? []))
      .catch(() => setTours([]))
      .finally(() => setLoading(false));
  }, []);

  // Record tour in "recently visited" when viewing budget or rooming (from selector, calendar, etc.)
  useEffect(() => {
    if (!tourIdFromUrl) return;
    if (basePath === '/budget') pushRecentTourId(tourIdFromUrl);
    else if (basePath === '/rooming') pushRecentTourIdRooming(tourIdFromUrl);
  }, [basePath, tourIdFromUrl]);

  const handleSelectTour = (tour: Tour) => {
    if (tour.id === tourIdFromUrl) {
      setDropdownOpen(false);
      return;
    }
    localStorage.setItem(storageKey, tour.id);
    if (basePath === '/budget') pushRecentTourId(tour.id);
    else if (basePath === '/rooming') pushRecentTourIdRooming(tour.id);
    router.push(buildUrl(tour.id));
    setDropdownOpen(false);
  };

  useLayoutEffect(() => {
    if (!dropdownOpen || !triggerRef.current) {
      setDropdownRect(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownRect({
      top: rect.bottom + 8,
      left: rect.left,
      width: 480,
    });
  }, [dropdownOpen]);

  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      {/* Left: SELECT TOUR trigger + large tour name heading */}
      <div className="relative min-w-0">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setDropdownOpen((o) => !o)}
          className="flex items-center gap-1 mb-1 group"
          aria-expanded={dropdownOpen}
          aria-haspopup="listbox"
        >
          <span
            className="text-[10px] font-semibold uppercase tracking-widest transition-colors"
            style={{ color: dropdownOpen ? '#FF4500' : 'rgba(255,255,255,0.4)' }}
          >
            Select Tour
          </span>
          <ChevronDown
            size={11}
            className={cn('transition-transform', dropdownOpen && 'rotate-180')}
            style={{ color: dropdownOpen ? '#FF4500' : 'rgba(255,255,255,0.4)' }}
          />
        </button>

        {loading ? (
          <div className="flex items-center gap-2 text-lp-text-secondary">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-2xl font-bold">Loading…</span>
          </div>
        ) : (
          <h1
            className={cn(
              'text-[2.4rem] font-bold leading-none tracking-tight text-lp-text truncate',
              'max-w-full'
            )}
          >
            {displayTour
              ? displayTour.name
              : <span className="text-lp-text-tertiary text-2xl font-medium">Select a tour above</span>}
          </h1>
        )}

        {/* Dropdown — portaled to body with high z-index so it always appears above tabs and page content */}
        {dropdownOpen &&
          dropdownRect &&
          typeof document !== 'undefined' &&
          createPortal(
            <div className="fixed inset-0 z-[9999] pointer-events-none" aria-hidden={!dropdownOpen}>
              <div
                className="absolute inset-0 pointer-events-auto"
                aria-hidden
                onClick={() => setDropdownOpen(false)}
              />
              <ul
                className="absolute z-10 w-[480px] max-h-64 overflow-auto rounded-lg border border-lp-border bg-lp-bg py-1 shadow-xl pointer-events-auto"
                style={{ top: dropdownRect.top, left: dropdownRect.left }}
                role="listbox"
              >
                {tours.length === 0 ? (
                  <li className="px-4 py-2.5 text-sm text-lp-text-tertiary">No tours found</li>
                ) : (
                  tours.map((tour) => (
                    <li
                      key={tour.id}
                      role="option"
                      aria-selected={tour.id === displayTourId}
                      onClick={() => handleSelectTour(tour)}
                      className={cn(
                        'cursor-pointer px-4 py-2.5 text-sm transition-colors',
                        tour.id === displayTourId
                          ? 'text-lp-orange bg-lp-orange/5'
                          : 'text-lp-text hover:bg-lp-surface-hover'
                      )}
                    >
                      <span className="font-medium">{tour.name}</span>
                      <span className="ml-2 text-lp-text-tertiary text-xs">
                        {tour.artist?.name ? `${tour.artist.name} · ` : ''}
                        {formatTourDateRange(tour.start_date, tour.end_date)}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </div>,
            document.body
          )}
      </div>

    </div>
  );
}

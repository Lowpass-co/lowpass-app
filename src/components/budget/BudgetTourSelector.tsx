'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, Loader2 } from 'lucide-react';
import { formatTourDateRange } from '@/lib/utils';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'lowpass_selected_budget_tour';

type Tour = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  currency: string;
  artist?: { name: string } | null;
};

type BudgetTourSelectorProps = {
  /** Base path for navigation (e.g. /budget or /rooming) */
  basePath?: string;
  /** Optional tab param to preserve when changing tour */
  tabParam?: string;
  /** Optional default tab when no tab in URL */
  defaultTab?: string;
  className?: string;
};

export function BudgetTourSelector({
  basePath = '/budget',
  tabParam,
  defaultTab,
  className,
}: BudgetTourSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tourIdFromUrl = searchParams.get('tour_id');
  const tabFromUrl = searchParams.get('tab') ?? defaultTab;

  const [tours, setTours] = useState<Tour[]>([]);
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const selectedTour = tours.find((t) => t.id === tourIdFromUrl) ?? null;
  const displayTourId = tourIdFromUrl ?? (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null);
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

  const handleSelectTour = (tour: Tour) => {
    if (tour.id === tourIdFromUrl) {
      setDropdownOpen(false);
      return;
    }
    localStorage.setItem(STORAGE_KEY, tour.id);
    router.push(buildUrl(tour.id));
    setDropdownOpen(false);
  };

  if (loading) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-xl border border-lp-border bg-lp-surface px-4 py-3 text-lp-text-secondary',
          className
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading tours…</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-lp-border bg-lp-surface p-4',
        className
      )}
    >
      <label className="block text-xs font-medium uppercase tracking-wider text-lp-text-tertiary">
        Tour
      </label>
      <div className="relative mt-1.5">
        <button
          type="button"
          onClick={() => setDropdownOpen((o) => !o)}
          className={cn(
            'flex w-full items-center justify-between gap-2 rounded-lg border border-lp-border bg-lp-bg px-3 py-2.5 text-left text-sm',
            'text-lp-text hover:bg-lp-surface-hover transition-colors',
            'min-h-[40px]'
          )}
          aria-expanded={dropdownOpen}
          aria-haspopup="listbox"
          aria-label="Select tour"
        >
          <span className="truncate">
            {displayTour
              ? `${displayTour.artist?.name ?? '—'} — ${displayTour.name} (${formatTourDateRange(displayTour.start_date, displayTour.end_date)})`
              : 'Select a tour…'}
          </span>
          <ChevronDown
            size={18}
            className={cn('shrink-0 text-lp-text-tertiary', dropdownOpen && 'rotate-180')}
          />
        </button>
        {dropdownOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              aria-hidden
              onClick={() => setDropdownOpen(false)}
            />
            <ul
              className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-lg border border-lp-border bg-lp-surface py-1 shadow-lg"
              role="listbox"
            >
              {tours.length === 0 ? (
                <li className="px-3 py-2 text-sm text-lp-text-tertiary">No tours found</li>
              ) : (
                tours.map((tour) => (
                  <li
                    key={tour.id}
                    role="option"
                    aria-selected={tour.id === displayTourId}
                    onClick={() => handleSelectTour(tour)}
                    className={cn(
                      'cursor-pointer px-3 py-2 text-sm',
                      tour.id === displayTourId
                        ? 'bg-lp-orange-subtle text-lp-orange'
                        : 'text-lp-text hover:bg-lp-surface-hover'
                    )}
                  >
                    {tour.artist?.name ?? '—'} — {tour.name} ({formatTourDateRange(tour.start_date, tour.end_date)})
                  </li>
                ))
              )}
            </ul>
          </>
        )}
      </div>
      {displayTour && (
        <p className="mt-2 text-xs text-lp-text-tertiary">
          Currency: {displayTour.currency}
        </p>
      )}
    </div>
  );
}

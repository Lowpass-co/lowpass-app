'use client';

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ChevronDown, Loader2, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'lowpass_selected_budget_tour';
const ITEM_ANGLE_STEP = 0.16;
const ARC_RADIUS = 550;
const LERP = 0.08;

type Tour = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  currency: string;
  status?: string;
  artist?: { id: string; name: string } | null;
};

function normalizeDistance(rawDistance: number, total: number): number {
  let distance = ((rawDistance % total) + total) % total;
  if (distance > total / 2) distance -= total;
  return distance;
}

export function BudgetTourLanding() {
  const router = useRouter();
  const [tours, setTours] = useState<Tour[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterArtistId, setFilterArtistId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [targetScroll, setTargetScroll] = useState(0);
  const [hintVisible, setHintVisible] = useState(true);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const targetScrollRef = useRef(0);
  const currentScrollRef = useRef(0);
  targetScrollRef.current = targetScroll;

  const fetchTours = useCallback(() => {
    fetch('/api/tours')
      .then((r) => (r.ok ? r.json() : { tours: [] }))
      .then((data) => setTours(data.tours ?? []))
      .catch(() => setTours([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchTours();
  }, [fetchTours]);

  // Refetch when user returns to tab (e.g. after adding a tour elsewhere) so list stays in sync
  useEffect(() => {
    const onFocus = () => fetchTours();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchTours]);

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
    if (filterArtistId) {
      list = list.filter((t) => t.artist?.id === filterArtistId);
    }
    if (filterStatus) {
      list = list.filter((t) => (t.status ?? '') === filterStatus);
    }
    if (filterDateFrom) {
      list = list.filter((t) => t.start_date >= filterDateFrom);
    }
    if (filterDateTo) {
      list = list.filter((t) => t.start_date <= filterDateTo);
    }
    return list;
  }, [tours, searchQuery, filterArtistId, filterStatus, filterDateFrom, filterDateTo]);
  const totalItems = Math.max(1, filteredTours.length);
  const hasSearchNoResults = searchQuery.trim() && filteredTours.length === 0;
  const isArcVisible = !loading && tours.length > 0 && !hasSearchNoResults;

  const hideHint = useCallback(() => {
    setHintVisible(false);
  }, []);

  const handleSelectTour = useCallback(
    (tour: Tour) => {
      localStorage.setItem(STORAGE_KEY, tour.id);
      router.push(`/budget?tour_id=${tour.id}&tab=summary`);
    },
    [router]
  );

  // Search: when user types, snap arc to first filtered result (index 0 in filtered list)
  useEffect(() => {
    if (!searchQuery.trim() || filteredTours.length === 0) return;
    setTargetScroll(0);
    targetScrollRef.current = 0;
    hideHint();
  }, [searchQuery, filteredTours.length, hideHint]);

  // Clamp scroll refs when list length changes so we never have invalid indices (add/remove tours)
  const prevLengthRef = useRef(filteredTours.length);
  useEffect(() => {
    const n = Math.max(1, filteredTours.length);
    if (prevLengthRef.current !== n) {
      prevLengthRef.current = n;
      const clamp = (v: number) => {
        if (n <= 1) return 0;
        const wrapped = ((v % n) + n) % n;
        return wrapped;
      };
      currentScrollRef.current = clamp(currentScrollRef.current);
      targetScrollRef.current = clamp(targetScrollRef.current);
      setTargetScroll(targetScrollRef.current);
    }
  }, [filteredTours.length]);

  // Wheel handler — attach only when arc view is visible so ref is set
  useEffect(() => {
    if (!isArcVisible) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setTargetScroll((s) => s + e.deltaY * 0.006);
      targetScrollRef.current += e.deltaY * 0.006;
      hideHint();
    };
    wrapper.addEventListener('wheel', onWheel, { passive: false });
    return () => wrapper.removeEventListener('wheel', onWheel);
  }, [isArcVisible, hideHint]);

  // Touch handlers — attach only when arc view is visible
  const touchStartY = useRef(0);
  useEffect(() => {
    if (!isArcVisible) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const onTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touchY = e.touches[0].clientY;
      const delta = touchStartY.current - touchY;
      setTargetScroll((s) => s + delta * 0.02);
      targetScrollRef.current += delta * 0.02;
      touchStartY.current = touchY;
      hideHint();
    };
    wrapper.addEventListener('touchstart', onTouchStart, { passive: true });
    wrapper.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      wrapper.removeEventListener('touchstart', onTouchStart);
      wrapper.removeEventListener('touchmove', onTouchMove);
    };
  }, [isArcVisible, hideHint]);

  // One frame on layout so first paint has correct arc positions (variant-style)
  useLayoutEffect(() => {
    const listEl = listContainerRef.current;
    if (!listEl) return;
    const target = targetScrollRef.current;
    const cur = currentScrollRef.current + (target - currentScrollRef.current) * LERP;
    currentScrollRef.current = cur;
    const items = listEl.querySelectorAll<HTMLElement>('.tour-item');
    const totalItems = Math.max(1, items.length);
    items.forEach((el, index) => {
      const distance = normalizeDistance(index - cur, totalItems);
      const absDist = Math.abs(distance);
      const theta = distance * ITEM_ANGLE_STEP;
      const xOffset = (1 - Math.cos(theta)) * ARC_RADIUS;
      const yOffset = Math.sin(theta) * ARC_RADIUS;
      const opacity = Math.max(0, 1 - absDist * 0.15);
      const scale = Math.max(0.4, 1 - absDist * 0.1);
      el.style.transform = `translate(${xOffset}px, ${yOffset}px) scale(${scale})`;
      el.style.opacity = String(opacity);
      el.style.zIndex = String(Math.round(100 - absDist * 10));
      el.style.visibility = absDist > 7 ? 'hidden' : 'visible';
      if (absDist < 0.4) {
        el.classList.add('underline', 'decoration-4', 'underline-offset-[10px]');
      } else {
        el.classList.remove('underline', 'decoration-4', 'underline-offset-[10px]');
      }
    });
  }, [filteredTours.length]);

  // Scrolling animation from variant: lerp in rAF and update each item's DOM. Read container each frame so list add/remove works.
  useEffect(() => {
    if (!isArcVisible) return;

    const runFrame = () => {
      const listEl = listContainerRef.current;
      if (!listEl) {
        rafRef.current = requestAnimationFrame(runFrame);
        return;
      }

      const target = targetScrollRef.current;
      const cur = currentScrollRef.current + (target - currentScrollRef.current) * LERP;
      currentScrollRef.current = cur;

      const items = listEl.querySelectorAll<HTMLElement>('.tour-item');
      const totalItems = Math.max(1, items.length);

      items.forEach((el, index) => {
        const distance = normalizeDistance(index - cur, totalItems);
        const absDist = Math.abs(distance);
        const theta = distance * ITEM_ANGLE_STEP;
        const xOffset = (1 - Math.cos(theta)) * ARC_RADIUS;
        const yOffset = Math.sin(theta) * ARC_RADIUS;
        const opacity = Math.max(0, 1 - absDist * 0.15);
        const scale = Math.max(0.4, 1 - absDist * 0.1);

        el.style.transform = `translate(${xOffset}px, ${yOffset}px) scale(${scale})`;
        el.style.opacity = String(opacity);
        el.style.zIndex = String(Math.round(100 - absDist * 10));
        el.style.visibility = absDist > 7 ? 'hidden' : 'visible';

        if (absDist < 0.4) {
          el.classList.add('underline', 'decoration-4', 'underline-offset-[10px]');
        } else {
          el.classList.remove('underline', 'decoration-4', 'underline-offset-[10px]');
        }
      });

      rafRef.current = requestAnimationFrame(runFrame);
    };

    rafRef.current = requestAnimationFrame(runFrame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isArcVisible, filteredTours.length]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-lp-bg">
        <div className="flex items-center gap-2 text-lp-text-secondary">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-lg font-medium">Loading tours…</span>
        </div>
      </div>
    );
  }

  if (tours.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center bg-lp-bg">
        <p className="text-lp-text-secondary">No tours found.</p>
      </div>
    );
  }

  const statusOptions = [
    { value: '', label: 'All statuses' },
    { value: 'planning', label: 'Planning' },
    { value: 'active', label: 'Active' },
    { value: 'completed', label: 'Completed' },
    { value: 'archived', label: 'Archived' },
  ];

  if (hasSearchNoResults) {
    return (
      <div className="relative flex flex-1 flex-col overflow-hidden bg-lp-bg">
        <div className="absolute left-1/2 top-[28%] z-40 flex w-full max-w-md -translate-x-1/2 flex-col items-center">
          <h1 className="whitespace-nowrap text-5xl font-extrabold tracking-tight text-lp-orange md:text-6xl">
            Select Tour Budget
          </h1>
          <div className="pointer-events-auto mt-6 w-full">
            <div className="flex w-full items-center overflow-hidden rounded-full border-2 border-lp-orange bg-lp-surface shadow-sm shadow-lp-orange/20">
              <input
                type="text"
                placeholder="Search tours or artist..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full flex-1 bg-transparent px-5 py-3.5 text-sm font-medium text-lp-text placeholder:text-lp-text-tertiary focus:outline-none"
                aria-label="Search tours"
              />
              <button type="button" className="px-5 py-3.5 text-lp-text-tertiary hover:text-lp-orange" aria-label="Search">
                <Search className="h-5 w-5" strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-lp-text-secondary">No tours match your search or filters.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className="relative flex flex-1 flex-col overflow-hidden bg-lp-bg"
      id="scroll-wrapper"
    >
      {/* Centered header: title + search + filters — does not overlap arc list */}
      <div className="absolute left-1/2 top-[18%] z-40 flex w-full max-w-2xl -translate-x-1/2 flex-col items-center pointer-events-none">
        <div className="pointer-events-auto flex w-full flex-col items-center">
          <h1 className="whitespace-nowrap text-5xl font-extrabold tracking-tight text-lp-orange md:text-6xl">
            Select Tour Budget
          </h1>
          <div className="mt-6 w-full max-w-md">
            <div className="flex w-full items-center overflow-hidden rounded-full border-2 border-lp-orange bg-lp-surface shadow-sm shadow-lp-orange/20 transition-all duration-300 focus-within:border-lp-orange focus-within:shadow-lp-orange/30">
              <input
                type="text"
                id="search-input"
                placeholder="Search tours or artist..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full flex-1 bg-transparent px-5 py-3.5 text-sm font-medium text-lp-text placeholder:text-lp-text-tertiary focus:outline-none"
                aria-label="Search tours"
              />
              <button
                type="button"
                className="px-5 py-3.5 text-lp-text-tertiary transition-colors hover:text-lp-orange"
                aria-label="Search"
              >
                <Search className="h-5 w-5" strokeWidth={2.5} />
              </button>
            </div>
          </div>
          {/* Filters */}
          <div className="mt-4 flex w-full max-w-md flex-wrap items-center gap-3">
            {distinctArtists.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="flex items-center gap-1 text-xs font-medium text-lp-text-tertiary">
                  <Filter className="h-3.5 w-3.5" /> Artist
                </span>
                <button
                  type="button"
                  onClick={() => setFilterArtistId(null)}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                    !filterArtistId
                      ? 'bg-lp-orange text-white'
                      : 'bg-lp-bg-tertiary text-lp-text-secondary hover:bg-lp-surface-hover'
                  )}
                >
                  All
                </button>
                {distinctArtists.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setFilterArtistId((id) => (id === a.id ? null : a.id))}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-medium transition-colors truncate max-w-[120px]',
                      filterArtistId === a.id
                        ? 'bg-lp-orange text-white'
                        : 'bg-lp-bg-tertiary text-lp-text-secondary hover:bg-lp-surface-hover'
                    )}
                    title={a.name}
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="rounded-lg border border-lp-border bg-lp-surface px-2.5 py-1.5 text-xs font-medium text-lp-text focus:outline-none focus:ring-2 focus:ring-lp-orange/50"
                aria-label="Filter by status"
              >
                {statusOptions.map((o) => (
                  <option key={o.value || 'all'} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                placeholder="From"
                className="w-32 rounded-lg border border-lp-border bg-lp-surface px-2.5 py-1.5 text-xs text-lp-text focus:outline-none focus:ring-2 focus:ring-lp-orange/50"
                aria-label="From date"
              />
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="w-32 rounded-lg border border-lp-border bg-lp-surface px-2.5 py-1.5 text-xs text-lp-text focus:outline-none focus:ring-2 focus:ring-lp-orange/50"
                aria-label="To date"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Arc list container — origin at 52% from left, center vertical. Positions updated in rAF (variant scroll animation). */}
      <div
        ref={listContainerRef}
        className="absolute left-[52%] top-1/2 z-30 h-0 w-0 -translate-y-1/2 pointer-events-none"
        id="list-container"
        aria-hidden
      >
        {filteredTours.map((tour) => (
          <button
            key={tour.id}
            type="button"
            className="tour-item absolute left-0 top-1/2 origin-left -translate-y-1/2 cursor-pointer select-none whitespace-nowrap text-4xl font-extrabold tracking-wide text-lp-orange transition-[text-decoration] duration-200 pointer-events-auto"
            onClick={() => {
              handleSelectTour(tour);
              hideHint();
            }}
          >
            {tour.name}
          </button>
        ))}
      </div>

      {/* Scroll hint */}
      <div
        id="scroll-hint"
        className={cn(
          'absolute bottom-10 left-1/2 flex -translate-x-1/2 items-center space-x-2 text-xs font-bold uppercase tracking-[0.2em] text-lp-text-tertiary transition-opacity duration-1000 pointer-events-none',
          !hintVisible && 'opacity-0'
        )}
      >
        <ChevronDown className="h-4 w-4 animate-bounce" strokeWidth={2} />
        <span>Scroll to browse</span>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'lowpass_selected_budget_tour';
const ITEM_ANGLE_STEP = 0.16;
const ARC_RADIUS = 550;

type Tour = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  currency: string;
  artist?: { name: string } | null;
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
  const [currentScroll, setCurrentScroll] = useState(0);
  const [targetScroll, setTargetScroll] = useState(0);
  const [hintVisible, setHintVisible] = useState(true);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const targetScrollRef = useRef(0);
  targetScrollRef.current = targetScroll;

  useEffect(() => {
    fetch('/api/tours')
      .then((r) => (r.ok ? r.json() : { tours: [] }))
      .then((data) => setTours(data.tours ?? []))
      .catch(() => setTours([]))
      .finally(() => setLoading(false));
  }, []);

  const filteredTours = searchQuery.trim()
    ? tours.filter((t) =>
        t.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : tours;
  const totalItems = Math.max(1, filteredTours.length);
  const hasSearchNoResults = searchQuery.trim() && filteredTours.length === 0;

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
    hideHint();
  }, [searchQuery, filteredTours.length, hideHint]);

  // Wheel handler
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setTargetScroll((s) => s + e.deltaY * 0.006);
      hideHint();
    };
    wrapper.addEventListener('wheel', onWheel, { passive: false });
    return () => wrapper.removeEventListener('wheel', onWheel);
  }, [hideHint]);

  // Touch handlers
  const touchStartY = useRef(0);
  useEffect(() => {
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
      touchStartY.current = touchY;
      hideHint();
    };
    wrapper.addEventListener('touchstart', onTouchStart, { passive: true });
    wrapper.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      wrapper.removeEventListener('touchstart', onTouchStart);
      wrapper.removeEventListener('touchmove', onTouchMove);
    };
  }, [hideHint]);

  // Animation loop — use ref so we always lerp toward latest targetScroll
  useEffect(() => {
    const animate = () => {
      const target = targetScrollRef.current;
      setCurrentScroll((prev) => prev + (target - prev) * 0.08);
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

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

  if (hasSearchNoResults) {
    return (
      <div className="relative flex flex-1 flex-col overflow-hidden bg-lp-bg">
        <div className="absolute left-[12%] top-1/2 z-40 flex -translate-y-1/2 flex-col">
          <h1 className="whitespace-nowrap text-6xl font-extrabold tracking-tight text-lp-orange">
            Select Tour
          </h1>
          <div className="pointer-events-auto ml-[84px] mt-8">
            <div className="flex w-80 items-center overflow-hidden rounded-full border-2 border-lp-orange bg-lp-surface shadow-sm shadow-lp-orange/20">
              <input
                type="text"
                placeholder="Search tours..."
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
          <p className="text-lp-text-secondary">No tours match &quot;{searchQuery}&quot;.</p>
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
      {/* Left: title + search */}
      <div className="absolute left-[12%] top-1/2 z-40 flex -translate-y-1/2 flex-col pointer-events-none">
        <div className="flex items-center space-x-5">
          <h1 className="whitespace-nowrap text-6xl font-extrabold tracking-tight text-lp-orange">
            Select Tour
          </h1>
        </div>
        <div className="pointer-events-auto ml-[84px] mt-8">
          <div className="flex w-80 items-center overflow-hidden rounded-full border-2 border-lp-orange bg-lp-surface shadow-sm shadow-lp-orange/20 transition-all duration-300 focus-within:border-lp-orange focus-within:shadow-lp-orange/30">
            <input
              type="text"
              id="search-input"
              placeholder="Search tours..."
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
      </div>

      {/* Arc list container — origin at 52% from left, center vertical */}
      <div
        className="absolute left-[52%] top-1/2 z-30 h-0 w-0 -translate-y-1/2 pointer-events-none"
        id="list-container"
        aria-hidden
      >
        {filteredTours.map((tour, index) => {
          const rawDistance = index - currentScroll;
          const distance = normalizeDistance(rawDistance, totalItems);
          const absDist = Math.abs(distance);
          const theta = distance * ITEM_ANGLE_STEP;
          const xOffset = (1 - Math.cos(theta)) * ARC_RADIUS;
          const yOffset = Math.sin(theta) * ARC_RADIUS;
          const opacity = Math.max(0, 1 - absDist * 0.15);
          const scale = Math.max(0.4, 1 - absDist * 0.1);
          const isCenter = absDist < 0.4;
          const isHidden = absDist > 7;

          return (
            <button
              key={tour.id}
              type="button"
              className={cn(
                'tour-item absolute left-0 top-1/2 origin-left -translate-y-1/2 cursor-pointer select-none whitespace-nowrap text-4xl font-extrabold tracking-wide text-lp-orange transition-[text-decoration] duration-200 pointer-events-auto',
                isCenter && 'underline decoration-4 underline-offset-[10px]'
              )}
              style={{
                transform: `translate(${xOffset}px, ${yOffset}px) scale(${scale})`,
                opacity,
                zIndex: Math.round(100 - absDist * 10),
                visibility: isHidden ? 'hidden' : 'visible',
              }}
              onClick={() => {
                handleSelectTour(tour);
                hideHint();
              }}
            >
              {tour.name}
            </button>
          );
        })}
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

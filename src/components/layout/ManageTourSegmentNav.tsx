'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

const pillTransition =
  'left 250ms cubic-bezier(0.34, 1.56, 0.64, 1), width 250ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 150ms ease-out';

/** Matches sidebar section titles (e.g. “Artist Overview”, “Manage Tour”). */
const segmentTypography =
  'text-xs font-extrabold uppercase tracking-wider antialiased transition-colors';

const selectedLabelClass = cn(
  'text-white [text-shadow:0_1px_0_rgba(0,0,0,0.22),0_0_20px_rgba(255,255,255,0.35)]',
  'dark:[text-shadow:0_1px_2px_rgba(0,0,0,0.5)]'
);

type Props = { artistId: string | null; tourId: string | null };

/** Summary / Budget / Advance — header bar; locked until both artist and tour are selected. */
export function ManageTourSegmentNav({ artistId, tourId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locked = !artistId || !tourId;
  const containerRef = useRef<HTMLDivElement>(null);
  const btnSummaryRef = useRef<HTMLButtonElement>(null);
  const btnBudgetRef = useRef<HTMLButtonElement>(null);
  const btnAdvanceRef = useRef<HTMLButtonElement>(null);
  const [pill, setPill] = useState<{
    left: number;
    width: number;
    top: number;
    height: number;
    visible: boolean;
  }>({
    left: 0,
    width: 0,
    top: 0,
    height: 0,
    visible: false,
  });

  const isOnSummary = /^\/tours\/[^/]+\/overview(?:\/|$)/.test(pathname ?? '');
  const isOnAdvance = /^\/tours\/[^/]+\/advance(?:\/|$)/.test(pathname ?? '');
  const isOnBudget =
    (pathname?.startsWith('/budget') ?? false) && searchParams?.get('tab') !== 'settlement';
  const segment = isOnSummary ? 0 : isOnBudget ? 1 : isOnAdvance ? 2 : -1;

  const syncPill = useCallback(() => {
    if (locked) {
      setPill({ left: 0, width: 0, top: 0, height: 0, visible: false });
      return;
    }
    if (segment < 0) {
      setPill({ left: 0, width: 0, top: 0, height: 0, visible: false });
      return;
    }
    const container = containerRef.current;
    const btn =
      segment === 0
        ? btnSummaryRef.current
        : segment === 1
          ? btnBudgetRef.current
          : btnAdvanceRef.current;
    if (!container || !btn) return;
    const c = container.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    setPill({
      left: b.left - c.left,
      width: b.width,
      top: 0,
      height: c.height,
      visible: true,
    });
  }, [locked, segment]);

  useLayoutEffect(() => {
    syncPill();
  }, [syncPill]);

  useEffect(() => {
    if (locked) return undefined;
    const el = containerRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => syncPill());
    ro.observe(el);
    window.addEventListener('resize', syncPill);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', syncPill);
    };
  }, [locked, syncPill]);

  const lockTitle = (label: string) =>
    !artistId ? `Select an artist to use ${label}` : `Select a tour to use ${label}`;

  const cellClass = cn(
    'relative z-10 flex h-full min-h-0 min-w-0 items-center justify-center gap-1 px-1 py-0 outline-none',
    segmentTypography,
    locked && 'cursor-not-allowed'
  );

  const lockedLabelClass =
    'text-[#141414] dark:text-zinc-400 [text-rendering:optimizeLegibility]';

  return (
    <div ref={containerRef} className="relative grid h-full min-h-0 w-full min-w-0 shrink-0 grid-cols-3 gap-0">
      {pill.visible && !locked && (
        <div
          className={cn(
            'pointer-events-none absolute z-0 rounded-md border',
            /* Light: solid brand fill so white type reads clearly (glass reads washed on pale UI). */
            'border-orange-950/15 bg-lp-orange',
            'shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_2px_10px_rgba(255,69,0,0.35)]',
            /* Dark: match the stronger light-mode brand pill (less washed). */
            'dark:border-orange-950/20 dark:bg-lp-orange',
            'dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_4px_16px_rgba(255,69,0,0.35)]'
          )}
          style={{
            left: pill.left,
            width: pill.width,
            top: pill.top,
            height: pill.height,
            opacity: 1,
            transition: pillTransition,
          }}
        />
      )}
      <button
        ref={btnSummaryRef}
        type="button"
        title={locked ? lockTitle('Summary') : 'Summary'}
        disabled={locked}
        onClick={() => {
          if (locked || !tourId) return;
          router.push(`/tours/${tourId}/overview`);
        }}
        className={cellClass}
      >
        {locked && <Lock className="h-3.5 w-3.5 shrink-0 text-lp-orange" strokeWidth={2.25} aria-hidden />}
        <span
          className={cn(
            'whitespace-nowrap',
            locked ? lockedLabelClass : isOnSummary ? selectedLabelClass : 'text-lp-text-secondary'
          )}
        >
          Summary
        </span>
      </button>
      <button
        ref={btnBudgetRef}
        type="button"
        title={locked ? lockTitle('Budget') : 'Budget'}
        disabled={locked}
        onClick={() => {
          if (locked || !tourId) return;
          router.push(`/budget?tour_id=${tourId}`);
        }}
        className={cellClass}
      >
        {locked && <Lock className="h-3.5 w-3.5 shrink-0 text-lp-orange" strokeWidth={2.25} aria-hidden />}
        <span
          className={cn(
            'whitespace-nowrap',
            locked ? lockedLabelClass : isOnBudget ? selectedLabelClass : 'text-lp-text-secondary'
          )}
        >
          Budget
        </span>
      </button>
      <button
        ref={btnAdvanceRef}
        type="button"
        title={locked ? lockTitle('Advance') : 'Advance'}
        disabled={locked}
        onClick={() => {
          if (locked || !tourId) return;
          router.push(`/tours/${tourId}/advance`);
        }}
        className={cellClass}
      >
        {locked && <Lock className="h-3.5 w-3.5 shrink-0 text-lp-orange" strokeWidth={2.25} aria-hidden />}
        <span
          className={cn(
            'whitespace-nowrap',
            locked ? lockedLabelClass : isOnAdvance ? selectedLabelClass : 'text-lp-text-secondary'
          )}
        >
          Advance
        </span>
      </button>
    </div>
  );
}

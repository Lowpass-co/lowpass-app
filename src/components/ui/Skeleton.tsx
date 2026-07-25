/* ============================================
   LOWPASS — <Skeleton> + the loading-state family (F-3a)

   Adam's rule: never show a bare "Loading…" string again. Skeletons, not
   spinners — they preserve layout, prevent the content jump when data lands, and
   read premium.

   THE ATOM IS UNCHANGED. `<Skeleton className="h-4 w-20" />` is the existing API
   and three surfaces already use it that way (TourRoutingList, AdvanceShowReadView,
   TourBudgetAccordion). This file only ADDS — optional width/height props for
   callers who'd rather not reach for Tailwind, plus the handful of shapes every
   surface is actually made of. Composition, not configuration: per-surface loaders
   live next to their surface and assemble these; no bespoke loaders.

   THE ~10s LINE. A skeleton that never resolves is its own kind of lie, so
   <SkeletonBlock> surfaces a quiet secondary line once a load passes the
   threshold — "still loading — the server is waking up". A cold lambda is the
   honest reason, and saying so beats leaving the user guessing.

   Tokens only. The pulse is Tailwind's animate-pulse.
   ============================================ */

'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** The atom — one shimmering block. `className` remains the primary API. */
export function Skeleton({
  className,
  width,
  height,
  radius,
  style,
}: {
  className?: string;
  /** Optional inline sizing for callers not using Tailwind utilities. */
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  style?: CSSProperties;
}) {
  const inline: CSSProperties = { ...style };
  if (width !== undefined) inline.width = width;
  if (height !== undefined) inline.height = height;
  if (radius !== undefined) inline.borderRadius = radius;
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-md bg-lp-surface', className)}
      style={Object.keys(inline).length ? inline : undefined}
    />
  );
}

/** N text lines, last one short — the shape real prose actually has. */
export function SkeletonText({ lines = 3, gap = 8 }: { lines?: number; gap?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={11} width={i === lines - 1 ? '55%' : '100%'} />
      ))}
    </div>
  );
}

/** One list/table row at a REAL row height, with column-shaped blocks. */
export function SkeletonRow({
  height = 46,
  columns = ['118px', '108px', 'minmax(0,1fr)', '170px', '130px'],
  padX = 14,
}: {
  height?: number;
  columns?: string[];
  padX?: number;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: columns.join(' '),
        alignItems: 'center',
        gap: 12,
        height,
        paddingLeft: padX,
        paddingRight: padX,
        borderBottom: '1px solid var(--lp-border-subtle)',
      }}
    >
      {columns.map((_, i) => (
        <Skeleton
          key={i}
          height={11}
          width={i === 0 ? '80%' : i === columns.length - 1 ? '50%' : '65%'}
        />
      ))}
    </div>
  );
}

/** A bordered card block — for card/panel surfaces (day, advance, assets). */
export function SkeletonCard({ lines = 3, minHeight }: { lines?: number; minHeight?: number }) {
  return (
    <div
      style={{
        border: '1px solid var(--lp-border)',
        borderRadius: 'var(--lp-radius-lg)',
        background: 'var(--lp-panel)',
        padding: 'var(--lp-space-4)',
        minHeight,
      }}
    >
      <Skeleton height={9} width={90} style={{ marginBottom: 12 }} />
      <SkeletonText lines={lines} />
    </div>
  );
}

/** A framed list — header band + N rows. The default shape for every grid. */
export function SkeletonGrid({
  rows = 8,
  columns,
  rowHeight = 46,
}: {
  rows?: number;
  columns?: string[];
  rowHeight?: number;
}) {
  return (
    <div
      style={{
        border: '1px solid var(--lp-border)',
        borderRadius: 'var(--lp-radius-lg)',
        overflow: 'hidden',
        background: 'var(--lp-surface)',
      }}
    >
      <div
        style={{
          height: 32,
          background: 'var(--lp-panel)',
          borderBottom: '1px solid var(--lp-border)',
        }}
      />
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} height={rowHeight} columns={columns} />
      ))}
    </div>
  );
}

/**
 * True once a load has run longer than `afterMs`. Drives the quiet
 * "server is waking up" line so a long cold start explains itself.
 */
export function useSlowLoad(active: boolean, afterMs = 10_000): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setSlow(true), afterMs);
    // Reset in CLEANUP, not in the effect body — the body running setState is the
    // render-loop smell the lint rule guards against. Cleanup fires exactly when
    // the load ends or the deps change, which is precisely when "slow" is stale.
    return () => {
      clearTimeout(t);
      setSlow(false);
    };
  }, [active, afterMs]);
  return slow;
}

export const SLOW_LOAD_MESSAGE = 'Still loading — the server is waking up.';

/**
 * The wrapper every loading surface should use: renders its skeleton, announces
 * the load to assistive tech, and adds the slow-load line past ~10s.
 */
export function SkeletonBlock({
  label,
  children,
  slowAfterMs = 10_000,
}: {
  /** What's loading, for screen readers (e.g. "Loading personnel"). */
  label: string;
  children: ReactNode;
  slowAfterMs?: number;
}) {
  const slow = useSlowLoad(true, slowAfterMs);
  return (
    <div role="status" aria-live="polite" aria-busy="true" aria-label={label}>
      {children}
      {slow ? (
        <p
          data-testid="slow-load-note"
          style={{
            marginTop: 'var(--lp-space-3)',
            fontSize: 'var(--lp-text-xs)',
            color: 'var(--lp-text-tertiary)',
            textAlign: 'center',
          }}
        >
          {SLOW_LOAD_MESSAGE}
        </p>
      ) : null}
    </div>
  );
}

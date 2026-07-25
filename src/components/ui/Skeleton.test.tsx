/* ============================================
   LOWPASS — F-3a: skeletons + the ~10s "server is waking up" line

   The slow-load line is the part most likely to rot silently: it only appears
   after a 10s timer, so no manual walk will ever see it unless someone is
   deliberately waiting. Pin it with fake timers.

   Also pins the atom's backwards compatibility — three surfaces already call
   <Skeleton className="…" /> and must keep working.
   ============================================ */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Skeleton, SkeletonGrid, SLOW_LOAD_MESSAGE } from './Skeleton';
import { RoutingLedgerSkeleton, PersonnelSkeleton, DaySkeleton } from './SurfaceSkeletons';

afterEach(() => {
  vi.useRealTimers();
});

describe('Skeleton atom', () => {
  it('keeps the existing className API (TourRoutingList / AdvanceShowReadView / TourBudgetAccordion)', () => {
    const { container } = render(<Skeleton className="h-4 w-20" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('h-4');
    expect(el.className).toContain('w-20');
    expect(el.className).toContain('animate-pulse');
  });

  it('accepts inline sizing without a className', () => {
    const { container } = render(<Skeleton height={11} width="55%" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.height).toBe('11px');
    expect(el.style.width).toBe('55%');
  });
});

describe('SkeletonGrid — layout is preserved, not a spinner', () => {
  it('renders the requested number of real-height rows', () => {
    const { container } = render(<SkeletonGrid rows={5} rowHeight={46} />);
    const rows = Array.from(container.querySelectorAll('div')).filter(
      (d) => (d as HTMLElement).style.height === '46px',
    );
    expect(rows.length).toBe(5);
  });
});

describe('the ~10s slow-load line', () => {
  // The surface compositions already include SkeletonBlock, so callers render
  // them bare — no double-wrapping (which would produce two slow-load lines).
  it('is NOT shown immediately', () => {
    vi.useFakeTimers();
    render(<PersonnelSkeleton />);
    expect(screen.queryByTestId('slow-load-note')).toBeNull();
  });

  it('appears once the load passes the threshold', () => {
    vi.useFakeTimers();
    render(<PersonnelSkeleton />);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByTestId('slow-load-note').textContent).toBe(SLOW_LOAD_MESSAGE);
  });
});

describe('surface compositions announce themselves', () => {
  it('each exposes a labelled, busy status region', () => {
    vi.useFakeTimers();
    for (const [node, label] of [
      [<RoutingLedgerSkeleton key="r" />, 'Loading routing'],
      [<PersonnelSkeleton key="p" />, 'Loading personnel'],
      [<DaySkeleton key="d" />, 'Loading day'],
    ] as const) {
      const { unmount } = render(node);
      const region = screen.getByRole('status');
      expect(region.getAttribute('aria-label')).toBe(label);
      expect(region.getAttribute('aria-busy')).toBe('true');
      unmount();
    }
  });
});

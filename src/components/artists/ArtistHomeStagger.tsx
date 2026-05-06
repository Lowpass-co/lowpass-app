/* ============================================
   LOWPASS — Sprint 7 §4 — <ArtistHomeStagger>

   Wraps the /artists/[id] sections and runs a stagger entrance:
   each child fades in + translates up over 200ms, with the
   children offset by 50ms each. Reduced-motion → instant.

   Each section is rendered inside the wrapper. The wrapper
   queries its direct DOM children on mount and animates each
   in sequence via the Web Animations API. Server children stay
   server-rendered; the only client behaviour is the entrance.
   ============================================ */

'use client';

import {
  Children,
  cloneElement,
  isValidElement,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from 'react';

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function ArtistHomeStagger({
  children,
  /** Delay between each child's animation start, in ms. */
  staggerMs = 50,
  /** Per-child animation duration. */
  durationMs = 220,
  /** Delay before the first child starts (ms). */
  initialDelayMs = 0,
}: {
  children: ReactNode;
  staggerMs?: number;
  durationMs?: number;
  initialDelayMs?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const reduce = prefersReducedMotion();
    const sectionEls = Array.from(
      root.querySelectorAll<HTMLElement>('[data-stagger]'),
    );
    const animations: Animation[] = [];
    sectionEls.forEach((el, i) => {
      const delay = reduce ? 0 : initialDelayMs + i * staggerMs;
      const duration = reduce ? 50 : durationMs;
      const a = el.animate(
        [
          { opacity: 0, transform: 'translateY(8px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        {
          duration,
          delay,
          easing: 'cubic-bezier(0, 0, 0.2, 1)',
          fill: 'forwards',
        },
      );
      animations.push(a);
    });
    return () => {
      for (const a of animations) {
        if (a.playState !== 'finished') a.cancel();
      }
    };
  }, [staggerMs, durationMs, initialDelayMs]);

  // Mark every direct child with data-stagger so the effect's
  // querySelectorAll picks them up. Using cloneElement keeps
  // server-rendered children otherwise unchanged.
  const tagged = Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    const existingProps = (child.props ?? {}) as {
      'data-stagger'?: unknown;
      style?: React.CSSProperties;
    };
    return cloneElement(
      child as React.ReactElement<{
        'data-stagger'?: string;
        style?: React.CSSProperties;
      }>,
      {
        'data-stagger': '1',
        style: {
          ...(existingProps.style ?? {}),
          opacity: 0,
        },
      },
    );
  });

  return <div ref={containerRef}>{tagged}</div>;
}

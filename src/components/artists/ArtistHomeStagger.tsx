/* ============================================
   LOWPASS — <ArtistHomeStagger> (Sprint 7 §4 · VIS-G-06 FOIC fix)

   Wraps the workspace / artist-home sections and gives each a light entrance
   (fade + rise). Server component — the stagger is now pure CSS, applied at
   render via the `.lp-stagger-item` class + a capped per-item animation-delay.

   VIS-G-06 fix: the previous version baked `opacity: 0` into the SSR HTML and
   only revealed each section via the Web Animations API in a useLayoutEffect —
   so content stayed invisible until hydration ran (a ~2s blank/black on heavy
   pages) and the delay compounded unbounded. CSS animations run at first paint
   regardless of JS, and the delay is capped (items past the first few share the
   max), so the first meaningful paint shows content near-immediately with the
   stagger as a light enhancement, not content gated behind a long JS fade.
   Reduced-motion is covered by the global kill-switch in globals.css
   (@media prefers-reduced-motion → animation-duration 0.01ms).
   ============================================ */

import {
  Children,
  cloneElement,
  isValidElement,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';

/** Items beyond this index share the same (max) delay so the cumulative
 *  stagger never compounds into a long blank. */
const DELAY_CAP_INDEX = 5;

export function ArtistHomeStagger({
  children,
  /** Delay step between successive items, in ms (capped — see DELAY_CAP_INDEX). */
  staggerMs = 45,
  /** Delay before the first item starts (ms). */
  initialDelayMs = 0,
}: {
  children: ReactNode;
  staggerMs?: number;
  initialDelayMs?: number;
}) {
  const tagged = Children.toArray(children).map((child, idx) => {
    if (!isValidElement(child)) return child;
    const props = (child.props ?? {}) as {
      className?: string;
      style?: CSSProperties;
    };
    const delay = initialDelayMs + Math.min(idx, DELAY_CAP_INDEX) * staggerMs;
    return cloneElement(
      child as ReactElement<{ className?: string; style?: CSSProperties }>,
      {
        className: [props.className, 'lp-stagger-item'].filter(Boolean).join(' '),
        style: { ...(props.style ?? {}), animationDelay: `${delay}ms` },
      },
    );
  });

  return <div>{tagged}</div>;
}

/* ============================================
   LOWPASS — Sprint 7 §3 — TourHeader client islands
   (Sprint 8.1 §1 — compressed bar + scroll container deleted.)

   Two client components used by <TourHeader>:

   <TourHeaderAnimator> — wraps the expanded strip and runs a
     Web Animations API entrance (fade + translateY -4→0, 200ms)
     in useLayoutEffect on first mount. prefers-reduced-motion
     collapses to instant.

   <TourHeaderLogo> — renders the resolved logo image OR an
     initials chip on var(--color-lp-orange). Lives in a client
     island because the initials chip needs the brand-orange
     background and we want a single component that owns both
     the image-loaded and the no-image fallback.

   The Sprint 8 §2 <TourHeaderScrollContainer> + compressed bar
   were removed in Sprint 8.1 §1. The compressed bar overlapped
   ProductRail (left:0 ignored the 56px rail) and duplicated info
   that's now in the switcher trigger anyway. The key stat moved
   to the switcher trigger.
   ============================================ */

'use client';

import {
  useLayoutEffect,
  useRef,
  type ReactNode,
} from 'react';
import { getArtistInitials } from '@/lib/artists/imageUrl';

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function safeCancel(a: Animation | null): void {
  if (a && a.playState !== 'finished') a.cancel();
}

export function TourHeaderAnimator({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const animRef = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    safeCancel(animRef.current);
    const reduce = prefersReducedMotion();
    animRef.current = el.animate(
      [
        { opacity: 0, transform: 'translateY(-4px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      {
        duration: reduce ? 50 : 200,
        easing: 'cubic-bezier(0, 0, 0.2, 1)',
        fill: 'forwards',
      },
    );
    return () => {
      safeCancel(animRef.current);
      animRef.current = null;
    };
  }, []);

  return (
    <div ref={ref} style={{ opacity: 0 }}>
      {children}
    </div>
  );
}

export function TourHeaderLogo({
  imageUrl,
  name,
  size = 60,
}: {
  imageUrl: string | null;
  name: string;
  /** 60 for expanded TourHeader (default). Other sizes available
   *  for future consumers (e.g. modal headers); the compressed
   *  bar that previously took 32 has been deleted. */
  size?: number;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          borderRadius: 'var(--lp-radius-md)',
          objectFit: 'cover',
          flexShrink: 0,
          background: 'var(--lp-bg-deep)',
        }}
      />
    );
  }
  const fontSize =
    size <= 40 ? 'var(--lp-text-sm)' : 'var(--lp-text-lg)';
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: 'var(--lp-radius-md)',
        background: 'var(--color-lp-orange)',
        color: 'var(--lp-text-inverse)',
        fontSize,
        fontWeight: 'var(--lp-weight-bold)',
        flexShrink: 0,
      }}
    >
      {getArtistInitials(name)}
    </span>
  );
}

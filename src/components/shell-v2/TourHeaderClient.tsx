/* ============================================
   LOWPASS — Sprint 7 §3 — TourHeader client islands

   Two thin client components used by <TourHeader>:

   <TourHeaderAnimator> — wraps the strip and runs a Web
     Animations API entrance (fade + translateY -4→0, 200ms)
     in useLayoutEffect on first mount. prefers-reduced-motion
     collapses to instant.

   <TourHeaderLogo> — renders the resolved logo image OR an
     initials chip on var(--color-lp-orange). Lives in a client
     island because the initials chip needs the brand-orange
     background and we want a single component that owns both
     the image-loaded and the no-image fallback.
   ============================================ */

'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { getArtistInitials } from '@/lib/artists/imageUrl';

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function TourHeaderAnimator({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const animRef = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    animRef.current?.cancel();
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
      if (animRef.current && animRef.current.playState !== 'finished') {
        animRef.current.cancel();
      }
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
}: {
  imageUrl: string | null;
  name: string;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        width={60}
        height={60}
        style={{
          width: 60,
          height: 60,
          borderRadius: 'var(--lp-radius-md)',
          objectFit: 'cover',
          flexShrink: 0,
          background: 'var(--lp-bg-deep)',
        }}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 60,
        height: 60,
        borderRadius: 'var(--lp-radius-md)',
        background: 'var(--color-lp-orange)',
        color: 'var(--lp-text-inverse)',
        fontSize: 'var(--lp-text-lg)',
        fontWeight: 'var(--lp-weight-bold)',
        flexShrink: 0,
      }}
    >
      {getArtistInitials(name)}
    </span>
  );
}

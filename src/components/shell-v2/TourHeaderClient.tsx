/* ============================================
   LOWPASS — Sprint 7 §3 + Sprint 8 §2 — TourHeader client islands

   Three client components used by <TourHeader>:

   <TourHeaderAnimator> — wraps the expanded strip and runs a
     Web Animations API entrance (fade + translateY -4→0, 200ms)
     in useLayoutEffect on first mount. prefers-reduced-motion
     collapses to instant.

   <TourHeaderLogo> — renders the resolved logo image OR an
     initials chip on var(--color-lp-orange). Lives in a client
     island because the initials chip needs the brand-orange
     background and we want a single component that owns both
     the image-loaded and the no-image fallback.

   <TourHeaderScrollContainer> — Sprint 8 §2. Wraps the expanded
     strip + a sentinel + a fixed-position compressed bar. Uses
     IntersectionObserver on the sentinel to drive the
     compressed-bar fade-in/out via Web Animations API. When the
     sentinel scrolls out of viewport (rootMargin -48px to
     account for ProductHeader sticky offset), the compressed
     bar animates to opacity 1; when it re-enters, the compressed
     bar animates back to opacity 0. pointer-events: none while
     opacity 0 so the invisible bar doesn't intercept clicks
     behind it.
   ============================================ */

'use client';

import Link from 'next/link';
import {
  useLayoutEffect,
  useRef,
  type ReactNode,
} from 'react';
import { Pencil } from 'lucide-react';
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
  /** Sprint 8 §2 — 60 for expanded, 40 for compressed. */
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

/* ============================================================
   <TourHeaderScrollContainer> — Sprint 8 §2

   IntersectionObserver-driven compressed-bar reveal. Wraps:

     - children (the expanded TourHeader, full-flow ~96px)
     - sentinel (1px invisible div observed by IO)
     - compressed bar (position: fixed, top below ProductHeader)

   When the sentinel passes above viewport top (with rootMargin
   accounting for ProductHeader's 48px), the compressed bar
   fades in via Web Animations API. When the sentinel re-enters
   viewport, the compressed bar fades out.

   Compressed bar mirrors the expanded data in a single-line
   format: [40px logo] {artist} · {tour} · {keyStat}     [Edit]
   ============================================================ */
interface CompressedBarData {
  artistLogoUrl: string | null;
  artistName: string;
  tourName: string;
  /** Pre-formatted key stat string. The server component picks
   *  the per-product stat (Budget % SPENT, Advance % COMPLETE,
   *  Operations CREW count) and passes the formatted string —
   *  null when no stat is available. */
  keyStat: string | null;
  tourId: string;
}

export function TourHeaderScrollContainer({
  children,
  compressed,
}: {
  children: ReactNode;
  compressed: CompressedBarData;
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const compressedRef = useRef<HTMLDivElement | null>(null);
  const animRef = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    const sentinel = sentinelRef.current;
    const compressedEl = compressedRef.current;
    if (!sentinel || !compressedEl) return;

    const reduce = prefersReducedMotion();

    const observer = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (!e) return;
        // Sentinel intersecting viewport = expanded header still
        // mostly visible = compressed bar should be hidden.
        const showCompressed = !e.isIntersecting;
        safeCancel(animRef.current);
        animRef.current = compressedEl.animate(
          [
            // Empty `from` keyframe → animate from current
            // computed style. fill: forwards persists `to`.
            {},
            showCompressed
              ? { opacity: 1, transform: 'translateY(0)' }
              : { opacity: 0, transform: 'translateY(-4px)' },
          ],
          {
            duration: reduce ? 50 : 200,
            easing: 'cubic-bezier(0, 0, 0.2, 1)',
            fill: 'forwards',
          },
        );
        // Pointer events follow opacity — invisible bar doesn't
        // intercept clicks behind it.
        compressedEl.style.pointerEvents = showCompressed
          ? 'auto'
          : 'none';
      },
      {
        // Account for ProductHeader's 48px sticky offset so the
        // compressed bar appears as soon as the expanded header
        // bottom slides under ProductHeader, not when it leaves
        // the document viewport.
        rootMargin: '-48px 0px 0px 0px',
        threshold: 0,
      },
    );
    observer.observe(sentinel);

    return () => {
      observer.disconnect();
      safeCancel(animRef.current);
      animRef.current = null;
    };
  }, []);

  return (
    <>
      {children}
      {/* Sentinel — 1px invisible block at the bottom of the
          expanded header. IO watches this. */}
      <div
        ref={sentinelRef}
        aria-hidden
        style={{ height: 1, width: '100%', flexShrink: 0 }}
      />
      {/* Compressed bar — fixed-position. Initial inline opacity
          0 so the first paint doesn't flash full bar before the
          observer fires. */}
      <div
        ref={compressedRef}
        className="lp-tour-header-compressed flex items-center"
        style={{
          position: 'fixed',
          top: 48,
          left: 0,
          right: 0,
          zIndex: 'var(--lp-z-sticky)',
          minHeight: 48,
          gap: 'var(--lp-space-3)',
          padding: 'var(--lp-space-2) var(--lp-space-6)',
          background: 'var(--lp-panel)',
          borderBottom: '1px solid var(--lp-border-strong)',
          opacity: 0,
          pointerEvents: 'none',
        }}
        data-tour-id={compressed.tourId}
      >
        <TourHeaderLogo
          imageUrl={compressed.artistLogoUrl}
          name={compressed.artistName}
          size={32}
        />
        <span
          className="min-w-0 flex-1 truncate"
          style={{
            fontSize: 'var(--lp-text-base)',
            fontWeight: 'var(--lp-weight-medium)',
          }}
        >
          <span style={{ color: 'var(--lp-text)' }}>
            {compressed.artistName}
          </span>
          <span
            aria-hidden
            style={{
              margin: '0 var(--lp-space-2)',
              color: 'var(--lp-text-tertiary)',
            }}
          >
            ·
          </span>
          <span
            style={{
              color: 'var(--lp-text-secondary)',
              fontWeight: 'var(--lp-weight-regular)',
            }}
          >
            {compressed.tourName}
          </span>
          {compressed.keyStat ? (
            <>
              <span
                aria-hidden
                style={{
                  margin: '0 var(--lp-space-2)',
                  color: 'var(--lp-text-tertiary)',
                }}
              >
                ·
              </span>
              <span
                style={{
                  color: 'var(--lp-text-secondary)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {compressed.keyStat}
              </span>
            </>
          ) : null}
        </span>
        <Link
          href={`/operations/${compressed.tourId}/edit`}
          aria-label={`Edit ${compressed.tourName}`}
          className="btn-transition inline-flex shrink-0 items-center"
          style={{
            gap: 'var(--lp-space-1)',
            padding: 'var(--lp-space-1) var(--lp-space-3)',
            fontSize: 'var(--lp-text-sm)',
            fontWeight: 'var(--lp-weight-medium)',
            color: 'var(--lp-text-secondary)',
            background: 'var(--lp-panel)',
            border: '1px solid var(--lp-border-strong)',
            borderRadius: 'var(--lp-radius-md)',
          }}
        >
          <Pencil aria-hidden size={12} strokeWidth={2} />
          Edit
        </Link>
      </div>
    </>
  );
}

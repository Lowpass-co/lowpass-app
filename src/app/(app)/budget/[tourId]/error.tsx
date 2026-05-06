'use client';

/* ============================================
   LOWPASS — Budget · per-tour error boundary
   ============================================

   Hotfix v2 §B 2026-05-04. Without this file, any server-side throw
   in /budget/[tourId]/page.tsx (or its children) propagates to the
   root error boundary and renders the generic "Refresh, something
   went wrong" Adam saw on Vercel preview. With it, the user gets a
   contextual error card, a digest hash to share with engineering,
   and a Reset button that retries the failing render without
   forcing a full reload.

   Adam's smoke surfaced the crash on a tour Adam owns — the actual
   throw didn't show in the preview surface. This boundary will
   capture future occurrences with the digest visible.
   ============================================ */

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function BudgetTourErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the browser console in dev so the stack is visible.
    if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
      console.error('[budget/[tourId]] error boundary caught:', error);
    }
  }, [error]);

  return (
    <div
      className="mx-auto flex w-full max-w-[720px] flex-col items-center gap-4 px-6 py-12"
      role="alert"
    >
      <AlertTriangle
        className="h-8 w-8"
        style={{ color: 'var(--color-lp-error)' }}
        aria-hidden
      />
      <h1 className="lp-h2">Budget didn&apos;t load</h1>
      <p
        className="text-center"
        style={{
          fontSize: '14px',
          color: 'var(--lp-text-secondary)',
          lineHeight: 1.5,
        }}
      >
        Something went wrong rendering this tour&apos;s budget surface. The
        error has been logged. You can retry, head back to the artist
        picker, or open another tour.
      </p>
      {error.digest ? (
        <p
          className="lp-mono"
          style={{
            fontSize: '11px',
            color: 'var(--lp-text-tertiary)',
          }}
        >
          digest: {error.digest}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="btn-transition inline-flex items-center gap-1.5 rounded-md px-3 py-1.5"
          style={{
            background: 'var(--color-lp-orange)',
            color: 'var(--lp-text-inverse, #fff)',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Retry
        </button>
        <Link
          href="/artists"
          className="btn-transition inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5"
          style={{
            borderColor: 'var(--lp-border-strong)',
            color: 'var(--lp-text-secondary)',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          Back to artists
        </Link>
      </div>
    </div>
  );
}

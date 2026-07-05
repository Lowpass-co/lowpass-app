'use client';

/* ============================================
   LOWPASS — <PickUpResumeButton> (Nav & entry fixpack, item 1)

   The workspace "Resume …" button. The server passes a fallback product
   (getWorkspaceLandingData's resumeProduct); on mount this reads the tour's
   last-used product from localStorage and, if present, overrides both the
   href and the label so Resume lands where the user actually left off.

   Initial state = the server fallback so SSR and the first client render
   agree (no hydration mismatch); the effect upgrades it post-hydration.
   ============================================ */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getRememberedProduct, type TourProduct } from '@/lib/nav/lastProduct';

const PRODUCT_LABELS: Record<TourProduct, string> = {
  budget: 'Budget',
  advance: 'Advance',
  operations: 'Operations',
};

export function PickUpResumeButton({
  tourId,
  fallbackProduct,
}: {
  tourId: string;
  fallbackProduct: TourProduct;
}) {
  const [product, setProduct] = useState<TourProduct>(fallbackProduct);

  useEffect(() => {
    // One-shot post-hydration read of client-only localStorage — not a render
    // loop. Mirrors the ConnectionIndicator navigator.onLine pattern.
    const remembered = getRememberedProduct(tourId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (remembered) setProduct(remembered);
  }, [tourId]);

  return (
    <Link
      href={`/${product}/${tourId}`}
      className="btn-transition inline-flex shrink-0 items-center"
      style={{
        gap: 'var(--lp-space-2)',
        padding: 'var(--lp-space-2) var(--lp-space-4)',
        fontSize: 'var(--lp-text-sm)',
        fontWeight: 'var(--lp-weight-semibold)',
        color: 'var(--lp-text-inverse)',
        background: 'var(--color-lp-orange)',
        borderRadius: 'var(--lp-radius-md)',
      }}
    >
      Resume {PRODUCT_LABELS[product]}
      <ArrowRight aria-hidden size={14} strokeWidth={2.25} />
    </Link>
  );
}

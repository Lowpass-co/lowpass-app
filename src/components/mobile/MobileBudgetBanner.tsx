'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';

/** Suggests `/m/today` when a narrow viewport lands on the heavy budget surface. */
export function MobileBudgetBanner() {
  const isMobile = useIsMobile();
  const [dismissed, setDismissed] = useState(false);
  if (!isMobile || dismissed) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[14px] leading-relaxed text-lp-text">
      <span>This budget view is best on desktop. Continue here, or jump to mobile reads.</span>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded-lg border border-lp-border bg-lp-surface px-3 py-1.5 text-[13px] font-medium"
          onClick={() => setDismissed(true)}
        >
          Stay
        </button>
        <Link
          href="/m/today"
          className="rounded-lg bg-lp-orange px-3 py-1.5 text-[13px] font-semibold text-white"
        >
          Mobile home
        </Link>
      </div>
    </div>
  );
}

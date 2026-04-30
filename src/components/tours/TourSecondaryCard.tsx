/* ============================================
   LOWPASS — Tour Secondary Card (Tour Hub X3)

   Small build-once card for the Tour Hub bottom row. Title +
   single sub-line. Click → tour-internal page.
   ============================================ */

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export type TourSecondaryCardProps = {
  title: string;
  subLine: string;
  href: string;
};

export function TourSecondaryCard({ title, subLine, href }: TourSecondaryCardProps) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-lg border p-3 transition-colors"
      style={{
        borderColor: 'var(--lp-border)',
        background: 'var(--lp-surface)',
      }}
    >
      <div className="min-w-0 flex-1">
        <div
          className="truncate"
          style={{
            color: 'var(--lp-text)',
            fontSize: 'var(--lp-text-base)',
            fontWeight: 'var(--lp-weight-medium)',
          }}
        >
          {title}
        </div>
        <div
          className="mt-0.5 truncate"
          style={{
            color: 'var(--lp-text-secondary)',
            fontSize: 'var(--lp-text-sm)',
          }}
        >
          {subLine}
        </div>
      </div>
      <ChevronRight
        aria-hidden
        className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
        style={{ color: 'var(--lp-text-tertiary)' }}
      />
    </Link>
  );
}

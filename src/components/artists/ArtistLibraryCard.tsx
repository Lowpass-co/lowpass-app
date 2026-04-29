/* ============================================
   LOWPASS — Artist Library Card (Phase B nav redesign)

   Small reusable card for the Artist Hub's right column. Shows a
   library category (Riders / Tech specs / Financial admin / Stage
   plot) with an optional icon, title, and count sub-line; clicking
   the card navigates to that category's surface.

   Visual values via var(--lp-…) tokens. The card is server-renderable
   (it's just a Link with presentational children).
   ============================================ */

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';

export type ArtistLibraryCardProps = {
  title: string;
  /** Numeric count, or null when count is unavailable / zero with a custom label. */
  count?: number | null;
  /** Word(s) following the count — e.g. "templates", "documents", "files". */
  countLabel?: string;
  href: string;
  icon?: LucideIcon;
  /** Optional override for the sub-line — used when countLabel doesn't fit. */
  subLabel?: string;
};

export function ArtistLibraryCard({
  title,
  count,
  countLabel,
  href,
  icon: Icon,
  subLabel,
}: ArtistLibraryCardProps) {
  const sub =
    subLabel ??
    (count != null && countLabel
      ? `${count} ${count === 1 ? countLabel.replace(/s$/, '') : countLabel}`
      : '—');

  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-lg border p-4 transition-colors"
      style={{
        borderColor: 'var(--lp-border)',
        background: 'var(--lp-surface)',
      }}
    >
      {Icon ? (
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
          style={{
            background: 'color-mix(in srgb, var(--color-lp-orange) 8%, transparent)',
            color: 'var(--color-lp-orange)',
          }}
        >
          <Icon className="h-4 w-4" />
        </span>
      ) : null}
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
          {sub}
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

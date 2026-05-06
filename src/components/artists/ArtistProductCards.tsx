/* ============================================
   LOWPASS — Sprint 7 §4 — <ArtistProductCards>

   Three-column grid of cards linking to Operations / Budget /
   Advance for the active artist + their most-recent tour.

   Sprint 7 redesign: drops the "what's hot" metric from each
   card (Adam's call — visually noisy). Each card is now a
   simple icon + name + 1-line description + chevron-right,
   hovers lift 1px with shadow upgrade. Click → product surface
   for that artist's most-recent tour.
   ============================================ */

import Link from 'next/link';
import {
  Briefcase,
  ChevronRight,
  ClipboardList,
  DollarSign,
  type LucideIcon,
} from 'lucide-react';

interface ProductCardConfig {
  key: 'operations' | 'budget' | 'advance';
  label: string;
  Icon: LucideIcon;
  href: string;
  description: string;
}

const PRODUCT_CARDS: ProductCardConfig[] = [
  {
    key: 'operations',
    label: 'Operations',
    Icon: Briefcase,
    href: '/operations',
    description: 'Routing, channel list, rooming, files, personnel, gear, riders.',
  },
  {
    key: 'budget',
    label: 'Budget',
    Icon: DollarSign,
    href: '/budget',
    description: 'Line items, settlement, payroll, deal memos.',
  },
  {
    key: 'advance',
    label: 'Advance',
    Icon: ClipboardList,
    href: '/advance',
    description: 'Per-show advance forms, day-view, contacts.',
  },
];

interface ArtistProductCardsProps {
  artistId: string;
  /** Most-recent tour id; appended to product hrefs as path-segment.
   *  Falls through to bare path + ?artist_id= when artist has no tours. */
  recentTourId: string | null;
}

export function ArtistProductCards({
  artistId,
  recentTourId,
}: ArtistProductCardsProps) {
  const artistQs = `?artist_id=${encodeURIComponent(artistId)}`;
  return (
    <section
      className="grid"
      style={{
        gap: 'var(--lp-space-3)',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      }}
    >
      {PRODUCT_CARDS.map((p) => {
        const href = recentTourId
          ? `${p.href}/${recentTourId}${artistQs}`
          : `${p.href}${artistQs}`;
        return (
          <ArtistProductCard
            key={p.key}
            href={href}
            label={p.label}
            Icon={p.Icon}
            description={p.description}
          />
        );
      })}
    </section>
  );
}

function ArtistProductCard({
  href,
  label,
  Icon,
  description,
}: {
  href: string;
  label: string;
  Icon: LucideIcon;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="lp-artist-product-card btn-transition flex flex-col gap-3"
      style={{
        padding: 'var(--lp-space-4)',
        background: 'var(--lp-panel)',
        border: '1px solid var(--lp-border-strong)',
        borderRadius: 'var(--lp-radius-lg)',
        minHeight: 200,
      }}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex shrink-0 items-center justify-center"
          style={{
            width: 40,
            height: 40,
            borderRadius: 'var(--lp-radius-md)',
            background:
              'color-mix(in srgb, var(--color-lp-orange) 10%, transparent)',
            color: 'var(--color-lp-orange)',
          }}
        >
          <Icon size={20} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div
            style={{
              fontSize: 'var(--lp-text-base)',
              fontWeight: 'var(--lp-weight-semibold)',
              color: 'var(--lp-text)',
            }}
          >
            {label}
          </div>
          <div
            className="mt-1"
            style={{
              fontSize: 'var(--lp-text-xs)',
              color: 'var(--lp-text-tertiary)',
              lineHeight: 1.5,
            }}
          >
            {description}
          </div>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-end">
        <ChevronRight
          aria-hidden
          size={18}
          strokeWidth={2}
          style={{ color: 'var(--lp-text-tertiary)' }}
        />
      </div>
    </Link>
  );
}

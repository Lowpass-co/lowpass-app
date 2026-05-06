/* ============================================
   LOWPASS — Sprint 7 §4 — <ArtistInitialsChip>

   Initials chip on var(--color-lp-orange). Used as the final
   fallback in any avatar slot when no image URL resolved. Lives
   in its own component because every artist surface (hero,
   product cards, list cards, dropdown rows) wants the same
   initials treatment but at different sizes.
   ============================================ */

import { getArtistInitials } from '@/lib/artists/imageUrl';

export function ArtistInitialsChip({
  name,
  size,
  fontSize,
}: {
  name: string;
  /** Rendered width/height in px. */
  size: number;
  /** Font size for the initials. Default = 40% of size. */
  fontSize?: number;
}) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: 'var(--lp-radius-full)',
        background: 'var(--color-lp-orange)',
        color: 'var(--lp-text-inverse)',
        fontSize: fontSize ?? Math.round(size * 0.4),
        fontWeight: 'var(--lp-weight-bold)',
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {getArtistInitials(name)}
    </span>
  );
}

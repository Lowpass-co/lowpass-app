'use client';

/* ============================================
   LOWPASS — <TourIdentityChip>

   Compact tour identity for a product context band (Fix 3): a small
   avatar + "Artist · Tour". Shared by Budget + Operations so the
   collapsed two-band layout reads identically across products.
   ============================================ */

interface TourIdentityChipProps {
  artistName: string | null;
  artistLogoUrl: string | null;
  tourName: string;
}

export function TourIdentityChip({
  artistName,
  artistLogoUrl,
  tourName,
}: TourIdentityChipProps) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {artistLogoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- small avatar, external URL, no LCP concern
        <img
          src={artistLogoUrl}
          alt=""
          className="h-6 w-6 shrink-0 rounded-md object-cover"
          style={{ border: '1px solid var(--lp-border)' }}
        />
      ) : (
        <span
          aria-hidden
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
          style={{
            background: 'color-mix(in srgb, var(--color-lp-orange) 14%, transparent)',
            color: 'var(--color-lp-orange)',
            fontSize: '11px',
            fontWeight: 700,
          }}
        >
          {(artistName ?? tourName).slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="min-w-0 truncate" style={{ fontSize: '13px' }}>
        {artistName ? (
          <span style={{ color: 'var(--lp-text-secondary)' }}>
            {artistName}
            <span style={{ color: 'var(--lp-text-tertiary)' }}> · </span>
          </span>
        ) : null}
        <span style={{ color: 'var(--lp-text)', fontWeight: 600 }}>{tourName}</span>
      </span>
    </div>
  );
}

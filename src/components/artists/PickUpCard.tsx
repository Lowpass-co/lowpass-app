/* ============================================
   LOWPASS — Sprint 7 §5 — <PickUpCard>

   "Pick up where you left off" card on the workspace landing.
   Resolves to the most-recently-updated tour in the workspace
   (server-side, in getWorkspaceLandingData). Renders with the
   artist's logo + tour title + last-edit context line + an
   orange Resume button linking to the matching product surface.
   ============================================ */

import { ArtistInitialsChip } from './ArtistInitialsChip';
import { PickUpResumeButton } from './PickUpResumeButton';
import type { WorkspaceLandingPickUp } from '@/server/workspace/getWorkspaceLandingData';

export function PickUpCard({ pickUp }: { pickUp: WorkspaceLandingPickUp }) {
  return (
    <section
      style={{
        padding: 'var(--lp-space-5)',
        background: 'var(--lp-panel)',
        border: '1px solid var(--lp-border-strong)',
        borderRadius: 'var(--lp-radius-lg)',
      }}
    >
      <div
        className="flex flex-wrap items-baseline justify-between"
        style={{ gap: 'var(--lp-space-3)', marginBottom: 'var(--lp-space-3)' }}
      >
        <span
          className="lp-label-caps"
          style={{ color: 'var(--lp-text-tertiary)' }}
        >
          Pick up where you left off
        </span>
      </div>
      <div
        className="flex flex-wrap items-center"
        style={{ gap: 'var(--lp-space-4)' }}
      >
        {/* Logo */}
        <div className="shrink-0">
          {pickUp.artistLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pickUp.artistLogoUrl}
              alt=""
              width={56}
              height={56}
              style={{
                width: 56,
                height: 56,
                borderRadius: 'var(--lp-radius-full)',
                objectFit: 'cover',
                background: 'var(--lp-bg-deep)',
              }}
            />
          ) : (
            <ArtistInitialsChip name={pickUp.artistName} size={56} />
          )}
        </div>

        {/* Title + context */}
        <div className="min-w-0 flex-1">
          <div
            className="truncate"
            style={{
              fontSize: 'var(--lp-text-md)',
              fontWeight: 'var(--lp-weight-medium)',
              color: 'var(--lp-text)',
            }}
          >
            <span style={{ color: 'var(--lp-text)' }}>{pickUp.artistName}</span>
            <span
              aria-hidden
              style={{
                margin: '0 var(--lp-space-2)',
                color: 'var(--lp-text-tertiary)',
              }}
            >
              ·
            </span>
            <span style={{ color: 'var(--lp-text-secondary)' }}>
              {pickUp.tourName}
            </span>
          </div>
          <div
            className="mt-1 truncate"
            style={{
              fontSize: 'var(--lp-text-sm)',
              color: 'var(--lp-text-tertiary)',
            }}
          >
            {pickUp.lastEditSummary}
          </div>
        </div>

        {/* Resume button — client island resolves last-used product (item 1) */}
        <PickUpResumeButton
          tourId={pickUp.tourId}
          fallbackProduct={pickUp.resumeProduct}
        />
      </div>
    </section>
  );
}

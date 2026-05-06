/* ============================================
   LOWPASS — Sprint 5 §2 — <ArtistTourSwitcherClientWrapper>

   Thin client component that owns the [isCreateTourOpen] state
   so <ProductHeader> (a server component) can mount the
   switcher + the new-tour slide-over together. The slide-over
   is built in Phase 3 — Phase 2 ships a placeholder div.
   ============================================ */

'use client';

import { useState } from 'react';
import { ArtistTourSwitcher } from './ArtistTourSwitcher';

type ArtistMin = {
  id: string;
  name: string;
  branding: unknown;
  spotify_image_url?: string | null;
};

type TourMin = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
};

interface ArtistTourSwitcherClientWrapperProps {
  initialArtists: ArtistMin[];
  initialTours: TourMin[] | null;
}

export function ArtistTourSwitcherClientWrapper({
  initialArtists,
  initialTours,
}: ArtistTourSwitcherClientWrapperProps) {
  const [isCreateTourOpen, setIsCreateTourOpen] = useState(false);

  return (
    <>
      <ArtistTourSwitcher
        initialArtists={initialArtists}
        initialTours={initialTours}
        onCreateTour={() => setIsCreateTourOpen(true)}
      />
      {isCreateTourOpen ? (
        // Phase 2 placeholder — Phase 3 swaps this for
        // <TourCreateSlideOver>.
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Create new tour (placeholder)"
          onClick={() => setIsCreateTourOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 'var(--lp-z-modal)',
            background: 'color-mix(in srgb, var(--lp-bg-deep) 85%, transparent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              padding: 'var(--lp-space-6)',
              background: 'var(--lp-panel)',
              border: '1px solid var(--lp-border-strong)',
              borderRadius: 'var(--lp-radius-lg)',
              boxShadow: 'var(--lp-shadow-popover)',
              maxWidth: 360,
              cursor: 'default',
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 'var(--lp-text-base)',
                color: 'var(--lp-text)',
              }}
            >
              Tour creation coming in Phase 3.
            </p>
            <p
              style={{
                marginTop: 'var(--lp-space-3)',
                marginBottom: 0,
                fontSize: 'var(--lp-text-sm)',
                color: 'var(--lp-text-secondary)',
              }}
            >
              Click outside to close.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

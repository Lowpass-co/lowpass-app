/* ============================================
   LOWPASS — Sprint 8.4 §2 — <EditArtistButton>

   Client island that replaces the legacy <Link
   href="/artists/[id]/edit"> in <ArtistHero>. Owns the
   ArtistEditSlideOver open state and triggers a router refresh
   on save so the hero / landing card / switcher all see the
   updated values.

   The legacy /artists/[id]/edit route stays mounted (the page
   file is unchanged) so deep-linked URLs still resolve. Sprint 9
   retirement will remove it once the slide-over is the
   universally-used path.
   ============================================ */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import {
  ArtistEditSlideOver,
  type ArtistEditSlideOverArtist,
} from './ArtistEditSlideOver';

export function EditArtistButton({
  artist,
}: {
  artist: ArtistEditSlideOverArtist;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-transition inline-flex shrink-0 items-center"
        style={{
          gap: 'var(--lp-space-2)',
          padding: 'var(--lp-space-2) var(--lp-space-3)',
          fontSize: 'var(--lp-text-sm)',
          fontWeight: 'var(--lp-weight-medium)',
          color: 'var(--lp-text-secondary)',
          background: 'var(--lp-panel)',
          border: '1px solid var(--lp-border-strong)',
          borderRadius: 'var(--lp-radius-md)',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--lp-panel-hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--lp-panel)';
        }}
      >
        <Pencil aria-hidden size={14} strokeWidth={2} />
        Edit profile
      </button>
      <ArtistEditSlideOver
        open={open}
        onClose={() => setOpen(false)}
        artist={artist}
        onSaved={() => {
          // Re-render the (server) page so the hero reflects the
          // new name / Spotify link / branding.
          router.refresh();
        }}
      />
    </>
  );
}

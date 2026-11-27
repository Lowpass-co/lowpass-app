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

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  // ?edit=profile opens the panel straight away (the rider editor's "Add the
  // artist's logo" lands here); the param is then dropped from the address so
  // a refresh doesn't reopen it.
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(() => searchParams.get('edit') === 'profile');
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('edit') !== 'profile') return;
    url.searchParams.delete('edit');
    window.history.replaceState(window.history.state, '', url.toString());
  }, []);

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

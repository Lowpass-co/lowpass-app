/* ============================================
   LOWPASS — Sprint 8.1 §3 (8a) — <WorkspaceNewArtistButton>

   Thin client wrapper for the workspace landing's "+ New artist"
   button. Replaces the Sprint 7 placeholder Link to /artists/new
   (which 404'd).

   Owns the open-state, mounts <ArtistCreateSlideOver>, and on
   success calls router.refresh() so the workspace landing's
   server-fetched artists grid re-renders with the new artist.
   ============================================ */

'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { ArtistCreateSlideOver } from '@/components/shell-v2/ArtistCreateSlideOver';

export function WorkspaceNewArtistButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const onCreated = useCallback(
    (artist: { id: string }) => {
      // Navigate to the new artist's detail page. The workspace
      // landing rerenders on next visit; if the user comes back,
      // the server fetch picks up the new row.
      router.push(`/artists/${artist.id}`);
    },
    [router],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-transition inline-flex items-center"
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
        <Plus aria-hidden size={14} strokeWidth={2.25} />
        New artist
      </button>
      <ArtistCreateSlideOver
        open={open}
        onClose={() => setOpen(false)}
        onCreated={onCreated}
      />
    </>
  );
}

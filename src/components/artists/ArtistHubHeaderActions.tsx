/* ============================================
   LOWPASS — Artist Hub header actions (Phase B nav redesign)

   Client wrapper that owns the "+ Add new artist" slide-over state
   for the Artist Hub. The hub itself is a Server Component, so any
   stateful affordance (NewArtistSlideOver) needs to live in a
   client component.

   Sits in the hub's top strip, to the right of the "← All artists"
   back link.
   ============================================ */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Settings } from 'lucide-react';
import Link from 'next/link';
import { NewArtistSlideOver } from '@/components/artists/NewArtistSlideOver';

export function ArtistHubHeaderActions({ artistId }: { artistId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/artists/${artistId}/edit`}
        className="btn-transition inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium"
        style={{
          borderColor: 'var(--lp-border)',
          color: 'var(--lp-text-secondary)',
          background: 'var(--lp-surface)',
        }}
        aria-label="Artist settings"
      >
        <Settings className="h-4 w-4" />
        Settings
      </Link>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-transition inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium"
        style={{
          borderColor: 'var(--color-lp-orange)',
          color: 'var(--color-lp-orange)',
          background: 'color-mix(in srgb, var(--color-lp-orange) 4%, transparent)',
        }}
      >
        <Plus className="h-4 w-4" />
        Add new artist
      </button>
      <NewArtistSlideOver
        open={open}
        onClose={() => setOpen(false)}
        onCreated={(created) => {
          setOpen(false);
          // Route to the freshly created artist's hub so the operator
          // sees their addition immediately.
          router.push(`/artists/${created.id}`);
          router.refresh();
        }}
      />
    </div>
  );
}

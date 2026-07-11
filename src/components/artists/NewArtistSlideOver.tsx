/* ============================================
   LOWPASS — New artist slide-over (Budget-style)

   Same shell as LineItemDetailPanel: right rail, backdrop,
   sticky header + scroll body + footer actions.
   Form body reuses ArtistNewBlock from New Tour flow.
   ============================================ */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArtistNewBlock, type NewArtistPayload } from '@/components/artists/ArtistNewBlock';
import { SlideOver } from '@/components/shell/SlideOver';

export function NewArtistSlideOver({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (artist: { id: string; name: string }) => void | Promise<void>;
}) {
  const [payload, setPayload] = useState<NewArtistPayload>({ name: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPayload({ name: '' });
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const handleSubmit = useCallback(async () => {
    if (!payload.name.trim()) {
      setError('Enter an artist name or choose one from Spotify.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const createRes = await fetch('/api/artists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: payload.name.trim(),
          ...(payload.spotify_id && { spotify_id: payload.spotify_id }),
          ...(payload.spotify_image_url && { spotify_image_url: payload.spotify_image_url }),
          ...(payload.spotify_banner_url && { spotify_banner_url: payload.spotify_banner_url }),
          branding: {
            ...(payload.logo_url && { logo_url: payload.logo_url }),
            ...(payload.banner_url && { banner_url: payload.banner_url }),
          },
        }),
      });
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        throw new Error(typeof err.error === 'string' ? err.error : 'Failed to create artist');
      }
      const newArtist = (await createRes.json()) as { id: string; name?: string };
      await onCreated({ id: newArtist.id, name: newArtist.name ?? payload.name.trim() });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }, [payload, onCreated, onClose]);

  // §3 hygiene — on the <SlideOver> primitive (SLIDE_OVER_CONTRACT). Width 480px
  // = the primitive's default token (--lp-slideover-width), so the rail is the
  // same size; header/body/footer structure is 1:1. `backdrop` keeps the old
  // bg dim. The close guard blocks close (X / overlay / Esc) mid-submit.
  return (
    <SlideOver
      open={open}
      onClose={() => {
        if (!submitting) onClose();
      }}
      title="New artist"
      subtitle="Search Spotify or add manually — optional logo for exports (same as New Tour)."
      backdrop
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="rounded-lg border border-lp-border bg-lp-surface px-4 py-2.5 text-sm font-medium text-lp-text hover:bg-lp-surface-hover disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleSubmit()}
            className="rounded-lg bg-lp-orange px-4 py-2.5 text-sm font-semibold text-white hover:bg-lp-orange-hover disabled:opacity-50"
          >
            {submitting ? 'Adding…' : 'Add New Artist'}
          </button>
        </div>
      }
    >
      <div className="px-4 py-4">
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400">
            {error}
          </div>
        )}
        <ArtistNewBlock value={payload} onChange={setPayload} />
      </div>
    </SlideOver>
  );
}

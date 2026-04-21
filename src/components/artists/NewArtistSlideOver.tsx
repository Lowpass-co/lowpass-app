/* ============================================
   LOWPASS — New artist slide-over (Budget-style)

   Same shell as LineItemDetailPanel: right rail, backdrop,
   sticky header + scroll body + footer actions.
   Form body reuses ArtistNewBlock from New Tour flow.
   ============================================ */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { ArtistNewBlock, type NewArtistPayload } from '@/components/artists/ArtistNewBlock';
import { cn } from '@/lib/utils';

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

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20 md:block"
        aria-hidden
        onClick={() => {
          if (!submitting) onClose();
        }}
      />
      <div
        className={cn(
          'fixed top-0 right-0 z-50 flex h-full w-full flex-col border-l border-lp-border bg-lp-bg shadow-2xl',
          'transition-transform duration-200 ease-out md:w-[480px]'
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-artist-slide-title"
      >
        <header className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-2 border-b border-lp-border bg-lp-bg p-4">
          <div className="min-w-0">
            <h2 id="new-artist-slide-title" className="text-lg font-bold text-lp-text">
              New artist
            </h2>
            <p className="mt-1 text-xs text-lp-text-secondary">
              Search Spotify or add manually — optional logo for exports (same as New Tour).
            </p>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="rounded-lg p-1.5 text-lp-text-secondary hover:bg-lp-surface hover:text-lp-text disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400">
              {error}
            </div>
          )}
          <ArtistNewBlock value={payload} onChange={setPayload} />
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-lp-border bg-lp-bg p-4">
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
        </footer>
      </div>
    </>
  );
}

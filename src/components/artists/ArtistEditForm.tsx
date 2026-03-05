'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArtistNewBlock, type NewArtistPayload } from '@/components/artists/ArtistNewBlock';
import type { Artist } from '@/types';

function artistToPayload(artist: Artist): NewArtistPayload {
  const branding = artist.branding ?? {};
  return {
    name: artist.name ?? '',
    spotify_id: artist.spotify_id ?? undefined,
    spotify_image_url: artist.spotify_image_url ?? undefined,
    spotify_banner_url: artist.spotify_banner_url ?? undefined,
    logo_url: branding.logo_url ?? undefined,
    banner_url: branding.banner_url ?? undefined,
  };
}

export function ArtistEditForm({ artist }: { artist: Artist }) {
  const [payload, setPayload] = useState<NewArtistPayload>(() => artistToPayload(artist));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/artists/${artist.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: payload.name,
          spotify_id: payload.spotify_id ?? null,
          spotify_image_url: payload.spotify_image_url ?? null,
          spotify_banner_url: payload.spotify_banner_url ?? null,
          logo_url: payload.logo_url,
          banner_url: payload.banner_url,
          branding: {
            ...(artist.branding ?? {}),
            logo_url: payload.logo_url,
            banner_url: payload.banner_url,
          },
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Save failed');
      }
      setMessage({ type: 'success', text: 'Saved.' });
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 rounded-xl border border-lp-border bg-lp-surface p-6">
      <ArtistNewBlock value={payload} onChange={setPayload} />
      {message && (
        <div
          className={
            message.type === 'error'
              ? 'text-sm text-red-600 dark:text-red-400'
              : 'text-sm text-emerald-600 dark:text-emerald-400'
          }
        >
          {message.text}
          {message.type === 'success' && (
            <span className="ml-2">
              <Link href="/tours" className="font-medium underline hover:no-underline">
                Back to tours
              </Link>
            </span>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link
          href="/tours"
          className="text-sm font-medium text-lp-text-secondary hover:text-lp-text"
        >
          Cancel
        </Link>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-lp-orange px-4 py-2.5 text-sm font-medium text-white hover:bg-lp-orange-hover disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

/* ============================================
   LOWPASS — Artist Picker grid

   Renders the post-auth picker UI: header ("Artists" + subtitle +
   "+ Add new artist") on top, then a responsive card grid. Each
   card is a Link to /artists/[id] with the artist's image (or an
   initials chip in --color-lp-orange) plus a sub-line showing
   tour + upcoming-show counts.

   The legacy edit/delete affordances (context menu) are preserved
   on each card so this surface remains the canonical "manage
   artists" page; the redesign adds the picker semantics on top.
   ============================================ */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { Artist } from '@/types';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import { useToast } from '@/components/ui/Toast';
import { NewArtistSlideOver } from '@/components/artists/NewArtistSlideOver';
import { cn } from '@/lib/utils';

export type ArtistPickerEntry = Pick<
  Artist,
  'id' | 'name' | 'slug' | 'spotify_image_url'
> & {
  branding?: Artist['branding'] | null;
  tourCount: number;
  showCount: number;
};

function deriveInitials(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '?';
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '?';
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return (tokens[0][0] + tokens[tokens.length - 1][0]).toUpperCase();
}

/** Pull a logo URL out of the freeform `branding` JSONB if present. */
function pickLogoUrl(branding: ArtistPickerEntry['branding']): string | null {
  if (!branding || typeof branding !== 'object') return null;
  const b = branding as Record<string, unknown>;
  const candidates = [b.logo_url, b.logoUrl, b.image_url, b.imageUrl];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c;
  }
  return null;
}

export function ArtistsList({
  artists: initialArtists,
}: {
  artists: ArtistPickerEntry[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [artists, setArtists] = useState(initialArtists);
  const [deleteOpen, setDeleteOpen] = useState<ArtistPickerEntry | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newArtistOpen, setNewArtistOpen] = useState(false);

  const handleDeleteConfirm = async () => {
    if (!deleteOpen) return;
    const id = deleteOpen.id;
    try {
      const res = await fetch(`/api/artists/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to delete artist');
      }
      showToast('Artist deleted');
      setDeleteOpen(null);
      setDeletingId(id);
      setTimeout(() => {
        setArtists((prev) => prev.filter((a) => a.id !== id));
        setDeletingId(null);
      }, 300);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  const handleArtistCreated = (created: { id: string; name: string }) => {
    // Optimistically prepend the new artist with zero counts so the
    // operator sees their addition without a round-trip. The next
    // visit refetches counts server-side.
    setArtists((prev) => [
      {
        id: created.id,
        name: created.name,
        slug: '',
        spotify_image_url: undefined,
        branding: null,
        tourCount: 0,
        showCount: 0,
      },
      ...prev,
    ]);
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1
            style={{
              color: 'var(--lp-text)',
              fontSize: 'var(--lp-text-2xl)',
              fontWeight: 'var(--lp-weight-semibold)',
            }}
          >
            Artists
          </h1>
          <p
            className="mt-1"
            style={{ color: 'var(--lp-text-secondary)', fontSize: 'var(--lp-text-base)' }}
          >
            Pick an artist to start working.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNewArtistOpen(true)}
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
      </div>

      {artists.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-20 text-center"
          style={{ borderColor: 'var(--lp-border)' }}
        >
          <p style={{ color: 'var(--lp-text-secondary)' }}>No artists yet.</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--lp-text-tertiary)' }}>
            Add your first artist to get started.
          </p>
          <button
            type="button"
            onClick={() => setNewArtistOpen(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium"
            style={{
              borderColor: 'var(--color-lp-orange)',
              color: 'var(--color-lp-orange)',
              background: 'color-mix(in srgb, var(--color-lp-orange) 4%, transparent)',
            }}
          >
            <Plus className="h-4 w-4" />
            Add new artist
          </button>
        </div>
      ) : (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}
        >
          {artists.map((artist) => {
            const logoUrl = artist.spotify_image_url || pickLogoUrl(artist.branding);
            const initials = deriveInitials(artist.name);
            const subline = `${artist.tourCount} tour${artist.tourCount === 1 ? '' : 's'} · ${artist.showCount} active show${artist.showCount === 1 ? '' : 's'}`;
            return (
              <div
                key={artist.id}
                className={cn(
                  'group relative rounded-xl border transition-all duration-300',
                  deletingId === artist.id && 'pointer-events-none -translate-y-2 scale-95 opacity-0',
                )}
                style={{
                  borderColor: 'var(--lp-border)',
                  background: 'var(--lp-surface)',
                }}
              >
                <div
                  className="absolute right-2 top-2 z-10"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ContextMenu
                    items={[
                      {
                        label: 'Edit',
                        icon: Pencil,
                        onClick: () => router.push(`/artists/${artist.id}`),
                      },
                      {
                        label: 'Delete Artist',
                        icon: Trash2,
                        variant: 'danger',
                        onClick: () => setDeleteOpen(artist),
                      },
                    ]}
                    align="right"
                  />
                </div>
                <Link
                  href={`/artists/${artist.id}`}
                  className="block rounded-xl p-5 transition-colors"
                  style={{ color: 'var(--lp-text)' }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full"
                      style={{
                        background: logoUrl
                          ? 'var(--lp-bg-tertiary)'
                          : 'var(--color-lp-orange)',
                      }}
                    >
                      {logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={logoUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span
                          aria-hidden
                          style={{
                            color: 'var(--lp-text-inverse, #FFFFFF)',
                            fontSize: 'var(--lp-text-base)',
                            fontWeight: 'var(--lp-weight-semibold)',
                          }}
                        >
                          {initials}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3
                        className="truncate"
                        style={{
                          color: 'var(--lp-text)',
                          fontWeight: 'var(--lp-weight-semibold)',
                        }}
                      >
                        {artist.name ?? '—'}
                      </h3>
                      <p
                        className="mt-0.5 truncate text-sm"
                        style={{ color: 'var(--lp-text-secondary)' }}
                      >
                        {subline}
                      </p>
                    </div>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      )}

      <NewArtistSlideOver
        open={newArtistOpen}
        onClose={() => setNewArtistOpen(false)}
        onCreated={(artist) => {
          handleArtistCreated(artist);
          setNewArtistOpen(false);
        }}
      />

      <DeleteConfirmationModal
        open={!!deleteOpen}
        itemName={deleteOpen?.name ?? 'Artist'}
        onClose={() => setDeleteOpen(null)}
        onConfirm={handleDeleteConfirm}
        description="This will not delete tours associated with this artist."
      />
    </div>
  );
}

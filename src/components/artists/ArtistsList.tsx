'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2, Music } from 'lucide-react';
import type { Artist } from '@/types';
import { cn } from '@/lib/utils';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import { useToast } from '@/components/ui/Toast';

export function ArtistsList({ artists: initialArtists }: { artists: Artist[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [artists, setArtists] = useState(initialArtists);
  const [deleteOpen, setDeleteOpen] = useState<Artist | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  if (artists.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-lp-border py-20">
        <p className="text-lp-text-secondary">No artists yet.</p>
        <p className="mt-1 text-sm text-lp-text-tertiary">
          Add an artist when creating a tour.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {artists.map((artist, index) => (
          <div
            key={artist.id}
            className={cn(
              'group relative flex flex-col rounded-xl border border-lp-border bg-lp-surface p-5 card-hover hover:border-lp-orange/30 hover:bg-lp-surface-hover transition-all duration-300',
              deletingId === artist.id && 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
            )}
          >
            <div className="absolute right-3 top-3 z-10" onClick={(e) => e.stopPropagation()}>
              <ContextMenu
                items={[
                  { label: 'Edit', icon: Pencil, onClick: () => router.push(`/artists/${artist.id}`) },
                  { label: 'Delete Artist', icon: Trash2, variant: 'danger', onClick: () => setDeleteOpen(artist) },
                ]}
                align="right"
              />
            </div>
            <Link href={`/artists/${artist.id}`} className="flex min-w-0 flex-1 flex-col pr-10">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-lp-bg-tertiary">
                  <Music size={24} className="text-lp-text-tertiary" />
                </div>
                <h3 className="font-semibold text-lp-text truncate">{artist.name ?? '—'}</h3>
              </div>
            </Link>
          </div>
        ))}
      </div>

      <DeleteConfirmationModal
        open={!!deleteOpen}
        itemName={deleteOpen?.name ?? 'Artist'}
        onClose={() => setDeleteOpen(null)}
        onConfirm={handleDeleteConfirm}
        description="This will not delete tours associated with this artist."
      />
    </>
  );
}

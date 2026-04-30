'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

export function ArtistPageHeader({ artistId, artistName }: { artistId: string; artistName: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingFade, setDeletingFade] = useState(false);

  const menuItems = [
    { label: 'Edit artist', icon: Pencil, onClick: () => router.push(`/artists/${artistId}/edit`) },
    { label: 'Delete artist', icon: Trash2, variant: 'danger' as const, onClick: () => setDeleteOpen(true) },
  ];

  return (
    <>
      <div className={cn('sticky top-0 z-10 -mx-6 flex items-center gap-4 border-b border-lp-border bg-lp-bg px-6 py-4', deletingFade && 'opacity-0 bg-red-500/10 transition-all duration-200')}>
        <Link
          href="/tours"
          className="flex items-center gap-1 text-sm font-medium text-lp-text-secondary hover:text-lp-text"
        >
          <ArrowLeft size={16} />
          Tours
        </Link>
        <h1 className="flex-1 text-lg font-semibold text-lp-text">Artist</h1>
        <ContextMenu items={menuItems} align="right" />
      </div>

      <DeleteConfirmationModal
        open={deleteOpen}
        itemName={artistName}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          const res = await fetch(`/api/artists/${artistId}`, { method: 'DELETE' });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error ?? 'Failed to delete artist');
          }
          showToast('Artist deleted');
        }}
        onDeleted={() => {
          setDeletingFade(true);
          setTimeout(() => {
            router.push('/tours');
            router.refresh();
          }, 200);
        }}
      />
    </>
  );
}

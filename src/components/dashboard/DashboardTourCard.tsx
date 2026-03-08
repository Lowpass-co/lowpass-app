'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Pencil, Trash2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import type { Tour } from '@/types';
import { cn } from '@/lib/utils';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import { useToast } from '@/components/ui/Toast';

const statusColors: Record<string, string> = {
  planning: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  active: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  completed: 'bg-gray-500/10 text-gray-500',
  archived: 'bg-gray-500/10 text-gray-400',
};

export function DashboardTourCard({ tour, onDeleted }: { tour: Tour; onDeleted?: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const artistName = tour.artist?.name ?? '—';
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const contextMenuItems = [
    { label: 'Edit tour', icon: Pencil, onClick: () => router.push(`/tours/create?edit=${tour.id}`) },
    { label: 'Delete tour', icon: Trash2, variant: 'danger' as const, onClick: () => setDeleteOpen(true) },
  ];

  return (
    <>
      <div
        className={cn(
          'group relative flex items-center justify-between rounded-xl border border-lp-border bg-lp-surface p-5 transition-all duration-300',
          deleting && 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
        )}
      >
        <div className="absolute right-3 top-3 z-10" onClick={(e) => e.stopPropagation()}>
          <ContextMenu items={contextMenuItems} align="right" />
        </div>
        <Link
          href={`/tours/${tour.id}`}
          className="flex min-w-0 flex-1 items-center justify-between pr-10"
        >
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-lp-text">{artistName}</h3>
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-medium',
                  statusColors[tour.status] ?? statusColors.planning
                )}
              >
                {tour.status}
              </span>
            </div>
            <p className="text-sm text-lp-text-secondary">{tour.name}</p>
            <div className="flex items-center gap-4 text-xs text-lp-text-tertiary">
              <span>
                {formatDate(tour.start_date)} – {formatDate(tour.end_date)}
              </span>
            </div>
          </div>
          <ArrowRight size={16} className="shrink-0 text-lp-text-tertiary group-hover:text-lp-orange transition-colors" />
        </Link>
      </div>

      <DeleteConfirmationModal
        open={deleteOpen}
        itemName={tour.name}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          const res = await fetch(`/api/tours/${tour.id}`, { method: 'DELETE' });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error ?? 'Failed to delete tour');
          }
          showToast('Tour deleted');
        }}
        onDeleted={() => {
          setDeleting(true);
          setTimeout(() => {
            router.refresh();
            onDeleted?.();
          }, 300);
        }}
      />
    </>
  );
}

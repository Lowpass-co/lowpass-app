/* ============================================
   LOWPASS — Tour Card (Kanban style)

   Compact card with artist, name, dates, status.
   Context menu: Edit tour, Rename tour, Delete tour.
   ============================================ */

'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Pencil, Type, Trash2 } from 'lucide-react';
import { formatDate, capitaliseStatus } from '@/lib/utils';
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

export function TourCard({ tour, onDeleted, index = 0 }: { tour: Tour; onDeleted?: () => void; index?: number }) {
  const router = useRouter();
  const { showToast } = useToast();
  const artistName = tour.artist?.name ?? '—';
  const statusClass = statusColors[tour.status] ?? statusColors.planning;

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingFade, setDeletingFade] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [editName, setEditName] = useState(tour.name);
  const [savingName, setSavingName] = useState(false);
  const [advancePercent, setAdvancePercent] = useState<number | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditName(tour.name);
  }, [tour.name]);

  useEffect(() => {
    if (isRenaming) setTimeout(() => renameInputRef.current?.focus(), 50);
  }, [isRenaming]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tours/${tour.id}/advance`)
      .then((r) => (r.ok ? r.json() : { dates: [] }))
      .then((j) => {
        if (cancelled) return;
        const dates = (j.dates ?? []) as { day_type: string; advance: { status: string } | null }[];
        const showDates = dates.filter((d) => d.day_type === 'show' || d.day_type === 'festival');
        if (showDates.length === 0) {
          setAdvancePercent(null);
          return;
        }
        const complete = showDates.filter((d) => d.advance?.status === 'complete').length;
        setAdvancePercent(Math.round((complete / showDates.length) * 100));
      })
      .catch(() => { if (!cancelled) setAdvancePercent(null); });
    return () => { cancelled = true; };
  }, [tour.id]);

  const saveRename = async () => {
    const name = editName.trim();
    if (!name || name === tour.name) {
      setIsRenaming(false);
      setEditName(tour.name);
      return;
    }
    setSavingName(true);
    try {
      const res = await fetch(`/api/tours/${tour.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to rename');
      }
      showToast('Tour renamed');
      setIsRenaming(false);
      router.refresh();
    } catch {
      setEditName(tour.name);
      setIsRenaming(false);
    } finally {
      setSavingName(false);
    }
  };

  const contextMenuItems = [
    {
      label: 'Edit tour',
      icon: Pencil,
      onClick: () => router.push(`/tours/${tour.id}/edit`),
    },
    {
      label: 'Rename tour',
      icon: Type,
      onClick: () => setIsRenaming(true),
    },
    {
      label: 'Delete tour',
      icon: Trash2,
      variant: 'danger' as const,
      onClick: () => setDeleteOpen(true),
    },
  ];

  return (
    <>
      <div
        className={cn(
          'group relative flex flex-col rounded-xl border border-lp-border bg-lp-surface p-5 card-hover hover:border-lp-orange/30 hover:bg-lp-surface-hover transition-all duration-300',
          !deletingFade && 'animate-slide-up',
          deletingFade && 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
        )}
        style={!deletingFade ? { animationDelay: `${index * 30}ms` } : undefined}
      >
        <div className="absolute right-3 top-3 z-10" onClick={(e) => e.stopPropagation()}>
          <ContextMenu items={contextMenuItems} align="right" />
        </div>

        <Link href={`/tours/${tour.id}`} className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium text-lp-text-tertiary">{artistName}</p>
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={saveRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveRename();
                    if (e.key === 'Escape') {
                      setEditName(tour.name);
                      setIsRenaming(false);
                    }
                  }}
                  disabled={savingName}
                  onClick={(e) => e.preventDefault()}
                  className="w-full rounded-lg border border-lp-border bg-lp-surface px-2 py-1 text-base font-semibold text-lp-text focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20"
                />
              ) : (
                <h3 className="font-semibold text-lp-text">{tour.name}</h3>
              )}
              <p className="text-sm text-lp-text-secondary">
                {formatDate(tour.start_date)} – {formatDate(tour.end_date)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {advancePercent != null && (
                <Link
                  href={`/tours/${tour.id}/advance`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 rounded-full border border-lp-border bg-lp-bg-secondary p-1 pr-1.5"
                  title={`Advance ${advancePercent}%`}
                >
                  <svg className="h-6 w-6 -rotate-90" viewBox="0 0 24 24" aria-hidden>
                    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" className="text-lp-bg-tertiary" />
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-lp-orange"
                      strokeDasharray={`${(advancePercent / 100) * 62.83} 62.83`}
                    />
                  </svg>
                  <span className="text-xs font-medium text-lp-text">{advancePercent}%</span>
                </Link>
              )}
              <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', statusClass)}>
                {capitaliseStatus(tour.status)}
              </span>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-end">
            <span className="flex items-center gap-1 text-xs text-lp-text-tertiary group-hover:text-lp-orange">
              Open
              <ArrowRight size={14} />
            </span>
          </div>
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
          setDeletingFade(true);
          setTimeout(() => {
            router.push('/tours');
            router.refresh();
            onDeleted?.();
          }, 300);
        }}
      />
    </>
  );
}

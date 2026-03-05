/* ============================================
   LOWPASS — Tour Card (Kanban style)

   Compact card with artist, name, dates, status.
   Three-dots menu: Open, Delete (with confirm).
   ============================================ */

'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, MoreVertical, Trash2, ExternalLink } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import type { Tour } from '@/types';
import { cn } from '@/lib/utils';

const statusColors: Record<string, string> = {
  planning: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  active: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  completed: 'bg-gray-500/10 text-gray-500',
  archived: 'bg-gray-500/10 text-gray-400',
};

const CONFIRM_WORD = 'delete';

export function TourCard({ tour }: { tour: Tour }) {
  const router = useRouter();
  const artistName = tour.artist?.name ?? '—';
  const statusClass = statusColors[tour.status] ?? statusColors.planning;

  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [advancePercent, setAdvancePercent] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const confirmInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    if (deleteConfirmOpen) {
      setDeleteInput('');
      setDeleteError(null);
      setTimeout(() => confirmInputRef.current?.focus(), 50);
    }
  }, [deleteConfirmOpen]);

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

  const handleDeleteConfirm = async () => {
    if (deleteInput.trim().toLowerCase() !== CONFIRM_WORD) {
      setDeleteError(`Type "${CONFIRM_WORD}" to confirm`);
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/tours/${tour.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete tour');
      }
      setDeleteConfirmOpen(false);
      router.push('/tours');
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete tour');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="group relative flex flex-col rounded-xl border border-lp-border bg-lp-surface p-5 transition-all hover:border-lp-orange/30 hover:bg-lp-surface-hover">
        <div className="absolute right-3 top-3 z-10" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen((o) => !o);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-lp-text-tertiary transition-colors hover:bg-lp-bg-tertiary hover:text-lp-text"
            aria-label="Tour options"
          >
            <MoreVertical size={18} />
          </button>

          {menuOpen && (
            <div
              className="tour-card-menu absolute right-0 top-full z-20 mt-1 min-w-[180px] overflow-hidden rounded-xl border border-lp-border bg-lp-surface py-1 shadow-lg"
            >
              <Link
                href={`/tours/${tour.id}`}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 text-sm text-lp-text transition-colors hover:bg-lp-orange/10 hover:text-lp-orange"
              >
                <ExternalLink size={14} />
                Open tour
              </Link>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setMenuOpen(false);
                  setDeleteConfirmOpen(true);
                }}
                className="tour-card-delete-option flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
              >
                <Trash2 size={14} />
                Delete tour
              </button>
            </div>
          )}
        </div>

        <Link href={`/tours/${tour.id}`} className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium text-lp-text-tertiary">{artistName}</p>
              <h3 className="font-semibold text-lp-text">{tour.name}</h3>
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
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-medium',
                  statusClass
                )}
              >
                {tour.status}
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

      {deleteConfirmOpen && (
        <div
          className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50 p-4"
          onClick={() => !deleting && setDeleteConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-lp-border bg-lp-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-lp-text">Delete this tour?</h3>
            <p className="mt-2 text-sm text-lp-text-secondary">
              <strong className="text-lp-text">{tour.name}</strong> will be permanently deleted. All routing, advance data, and links to this tour will be removed. This cannot be undone.
            </p>
            <p className="mt-4 text-sm font-medium text-lp-text">To confirm:</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-sm text-lp-text-secondary">
              <li>Type the word <kbd className="rounded border border-lp-border bg-lp-bg-tertiary px-1.5 py-0.5 font-mono text-xs">{CONFIRM_WORD}</kbd> in the box below.</li>
              <li>Press Enter or click &quot;Delete tour&quot;.</li>
            </ol>
            <input
              ref={confirmInputRef}
              type="text"
              value={deleteInput}
              onChange={(e) => {
                setDeleteInput(e.target.value);
                setDeleteError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleDeleteConfirm();
                if (e.key === 'Escape') setDeleteConfirmOpen(false);
              }}
              placeholder={`Type "${CONFIRM_WORD}"`}
              disabled={deleting}
              className="mt-3 w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2.5 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20 disabled:opacity-50"
              autoComplete="off"
            />
            {deleteError && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{deleteError}</p>
            )}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => !deleting && setDeleteConfirmOpen(false)}
                disabled={deleting}
                className="rounded-lg border border-lp-border bg-lp-surface px-4 py-2.5 text-sm font-medium text-lp-text hover:bg-lp-surface-hover disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={deleting || deleteInput.trim().toLowerCase() !== CONFIRM_WORD}
                className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 dark:bg-red-600 dark:hover:bg-red-700"
              >
                {deleting ? 'Deleting…' : 'Delete tour'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

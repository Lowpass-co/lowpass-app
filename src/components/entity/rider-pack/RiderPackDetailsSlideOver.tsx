'use client';

/* ============================================
   LOWPASS — <RiderPackDetailsSlideOver> (revamp #21)

   The click-open rider detail is now the MANAGEMENT hub — you manage a pack in
   the same place you open it, not a separate blocky surface:
     - Rename (inline title edit → PATCH /api/rider-packs/[id] { title }).
     - Status + Sharing log — read-only: status is DERIVED from the pack's export
       history (draft → sent → signed), so it isn't hand-edited; it reflects sends.
     - Open in editor — the rich send / export / recipient (reassign) flows live
       in the full builder; one click through rather than a duplicated surface.
     - Delete — inline confirm.
   ============================================ */

import { useState } from 'react';
import Link from 'next/link';
import { Trash2, Pencil, ExternalLink, Check, X } from 'lucide-react';
import { SlideOver } from '@/components/ui/SlideOver';
import { useToast } from '@/components/ui/Toast';

export type RiderPackDetails = {
  id: string;
  title: string | null;
  status: 'draft' | 'sent' | 'signed';
  recipientLabel: string;
  lastSentRelative: string;
  updatedRelative: string;
};

export default function RiderPackDetailsSlideOver({
  pack,
  onClose,
  onDeleted,
  onUpdated,
  editorHref,
}: {
  pack: RiderPackDetails;
  onClose: () => void;
  /** Fired after a successful delete so the list can drop the row + refresh. */
  onDeleted?: () => void;
  /** Fired after a rename so the list can refresh its row. */
  onUpdated?: () => void;
  /** Link into the full builder (send / export / recipient live there). */
  editorHref?: string;
}) {
  const { showToast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Rename (inline). Local title so the header updates immediately on save.
  const [title, setTitle] = useState(pack.title ?? '');
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(pack.title ?? '');
  const [savingName, setSavingName] = useState(false);

  const saveName = async () => {
    const next = draftName.trim();
    if (!next || next === (title || '').trim()) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      const res = await fetch(`/api/rider-packs/${pack.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: next }),
      });
      if (!res.ok) throw new Error(`Rename failed (${res.status})`);
      setTitle(next);
      setEditingName(false);
      showToast('Pack renamed', 'success');
      onUpdated?.();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not rename the pack', 'error');
    } finally {
      setSavingName(false);
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/rider-packs/${pack.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      showToast('Pack deleted', 'success');
      onDeleted?.();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not delete the pack', 'error');
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <SlideOver open onClose={onClose} title={title || 'Untitled pack'} subtitle={pack.recipientLabel}>
      <div className="flex h-full flex-col">
        <div className="flex-1 space-y-5 text-sm">
          {/* Rename (inline) */}
          <section className="space-y-1">
            <h4 className="text-xs uppercase tracking-wider text-lp-text-secondary">Name</h4>
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void saveName();
                    else if (e.key === 'Escape') { setDraftName(title); setEditingName(false); }
                  }}
                  disabled={savingName}
                  className="flex-1 rounded-md border bg-lp-surface px-2 py-1.5 text-sm text-lp-text"
                  style={{ borderColor: 'var(--lp-border)' }}
                />
                <button type="button" onClick={() => void saveName()} disabled={savingName} aria-label="Save name"
                  className="btn-transition rounded-md px-2 py-1.5 text-lp-text-inverse disabled:opacity-60" style={{ background: 'var(--lp-orange)' }}>
                  <Check className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button type="button" onClick={() => { setDraftName(title); setEditingName(false); }} disabled={savingName} aria-label="Cancel rename"
                  className="btn-transition rounded-md border px-2 py-1.5 text-lp-text-secondary" style={{ borderColor: 'var(--lp-border)' }}>
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <p className="text-lp-text">{title || 'Untitled pack'}</p>
                <button type="button" onClick={() => { setDraftName(title); setEditingName(true); }}
                  className="btn-transition inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs text-lp-text-secondary hover:text-lp-text"
                  style={{ borderColor: 'var(--lp-border)' }}>
                  <Pencil className="h-3 w-3" aria-hidden /> Rename
                </button>
              </div>
            )}
          </section>

          <section className="space-y-1">
            <h4 className="text-xs uppercase tracking-wider text-lp-text-secondary">Status</h4>
            <p className="capitalize">{pack.status}</p>
            <p className="text-xs text-lp-text-tertiary">Reflects the latest send (draft → sent → signed).</p>
          </section>
          <section className="space-y-1">
            <h4 className="text-xs uppercase tracking-wider text-lp-text-secondary">Sharing log</h4>
            <p>Last sent: {pack.lastSentRelative}</p>
            <p>Updated: {pack.updatedRelative}</p>
          </section>

          {/* Send / export / recipient live in the full editor. */}
          {editorHref ? (
            <section className="space-y-1">
              <h4 className="text-xs uppercase tracking-wider text-lp-text-secondary">Send &amp; recipient</h4>
              <Link href={editorHref}
                className="btn-transition inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium text-lp-text"
                style={{ borderColor: 'var(--lp-border)' }}>
                <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Open in editor
              </Link>
            </section>
          ) : null}
        </div>

        {/* Delete — slide-over footer, inline confirm. */}
        <div className="mt-6 border-t pt-4" style={{ borderColor: 'var(--lp-border)' }}>
          {confirming ? (
            <div className="space-y-3">
              <p className="text-sm text-lp-text">
                Delete <span className="font-semibold">&ldquo;{title || 'Untitled pack'}&rdquo;</span>? This
                permanently removes the pack, its sections, and its history. This can&rsquo;t be undone.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => void doDelete()}
                  className="btn-transition rounded-md px-3 py-1.5 text-sm font-semibold text-lp-text-inverse disabled:opacity-60"
                  style={{ background: 'var(--color-lp-error)' }}
                >
                  {deleting ? 'Deleting…' : 'Delete permanently'}
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setConfirming(false)}
                  className="btn-transition rounded-md border px-3 py-1.5 text-sm text-lp-text-secondary hover:text-lp-text"
                  style={{ borderColor: 'var(--lp-border)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="btn-transition inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium"
              style={{ borderColor: 'color-mix(in srgb, var(--color-lp-error) 40%, transparent)', color: 'var(--color-lp-error)' }}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete pack
            </button>
          )}
        </div>
      </div>
    </SlideOver>
  );
}

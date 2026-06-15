'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { SlideOver } from '@/components/shell/SlideOver';
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
}: {
  pack: RiderPackDetails;
  onClose: () => void;
  /** Fired after a successful delete so the list can drop the row + refresh. */
  onDeleted?: () => void;
}) {
  const { showToast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
    <SlideOver open onClose={onClose} title={pack.title || 'Untitled pack'} subtitle={pack.recipientLabel}>
      <div className="flex h-full flex-col">
        <div className="flex-1 space-y-5 text-sm">
          <section className="space-y-1">
            <h4 className="text-xs uppercase tracking-wider text-lp-text-secondary">Status</h4>
            <p className="capitalize">{pack.status}</p>
          </section>
          <section className="space-y-1">
            <h4 className="text-xs uppercase tracking-wider text-lp-text-secondary">Sharing log</h4>
            <p>Last sent: {pack.lastSentRelative}</p>
            <p>Updated: {pack.updatedRelative}</p>
          </section>
          <section className="space-y-1">
            <h4 className="text-xs uppercase tracking-wider text-lp-text-secondary">Comments</h4>
            <p className="text-lp-text-secondary">Threaded comments for rider-pack delivery are shown in the full editor.</p>
          </section>
        </div>

        {/* Delete (D4) — slide-over footer, inline confirm. */}
        <div className="mt-6 border-t pt-4" style={{ borderColor: 'var(--lp-border)' }}>
          {confirming ? (
            <div className="space-y-3">
              <p className="text-sm text-lp-text">
                Delete <span className="font-semibold">&ldquo;{pack.title || 'Untitled pack'}&rdquo;</span>? This
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

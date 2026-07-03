'use client';

/* ============================================
   LOWPASS — <LinkedRiderPackControl> (B2)

   Link/unlink control for pairing a stage-plot pack with a channel-list pack
   (rider_packs.linked_rider_pack_id). Presentational: the parent owns the
   direction (which pack's FK is written) via onCommit — the stage-plot surface
   writes its own pack's link; the channel-list surface writes the chosen
   stage-plot pack's link back to itself. Mirrors the FieldContact ref-picker
   pattern (pick a reference, store an id).
   ============================================ */

import { useState } from 'react';
import { useToast } from '@/components/ui/Toast';

export interface LinkCandidate {
  id: string;
  title: string;
}

export function LinkedRiderPackControl({
  label,
  value,
  candidates,
  onCommit,
}: {
  /** e.g. "Channel list" (on a stage-plot surface) or "Stage plot" (on a channel-list surface). */
  label: string;
  /** The currently-linked candidate id, or null. */
  value: string | null;
  candidates: LinkCandidate[];
  /** Persist the new link (null = unlink). Parent decides which pack is PATCHed. */
  onCommit: (next: string | null) => Promise<void>;
}) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  const commit = async (next: string | null) => {
    setBusy(true);
    try {
      await onCommit(next);
      showToast(next ? `Linked ${label.toLowerCase()}` : `Unlinked ${label.toLowerCase()}`, 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Link failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 'var(--lp-text-2xs)', fontWeight: 600, color: 'var(--lp-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </span>
      <select
        value={value ?? ''}
        disabled={busy || candidates.length === 0}
        onChange={(e) => void commit(e.target.value === '' ? null : e.target.value)}
        style={{
          fontSize: 'var(--lp-text-xs)',
          padding: '4px 8px',
          borderRadius: 6,
          border: '1px solid var(--lp-border)',
          background: 'var(--lp-surface)',
          color: 'var(--lp-text)',
          cursor: busy ? 'default' : 'pointer',
          maxWidth: 200,
        }}
      >
        <option value="">{candidates.length === 0 ? 'None available' : 'Not linked'}</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>{c.title || 'Untitled'}</option>
        ))}
      </select>
      {value ? (
        <button
          type="button"
          onClick={() => void commit(null)}
          disabled={busy}
          title={`Unlink ${label.toLowerCase()}`}
          style={{ fontSize: 'var(--lp-text-xs)', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--lp-border)', background: 'transparent', color: 'var(--lp-text-secondary)', cursor: busy ? 'default' : 'pointer' }}
        >
          Unlink
        </button>
      ) : null}
    </div>
  );
}

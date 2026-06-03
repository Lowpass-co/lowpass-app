'use client';

/* ============================================
   LOWPASS — <AddManyChannelsModal> (§CL-FIX-4)

   Count prompt for the "+ Add many…" affordance. Inserts N
   blank input rows in one batch (ch.appendRows) so a festival
   channel list isn't 32 individual clicks. Default 8; clamped
   1..64. Remount via key={open} in the parent resets the count.
   ============================================ */

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface AddManyChannelsModalProps {
  open: boolean;
  onClose: () => void;
  /** Inserts `count` input rows; parent handles the network call. */
  onConfirm: (count: number) => void | Promise<void>;
}

const MIN = 1;
const MAX = 64;
const clamp = (n: number) => Math.max(MIN, Math.min(MAX, Math.floor(n)));

export function AddManyChannelsModal({ open, onClose, onConfirm }: AddManyChannelsModalProps) {
  const [count, setCount] = useState(8);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await onConfirm(clamp(count || MIN));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add multiple channels"
      subtitle="Inserts blank input rows at the end of the grid."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            Add {clamp(count || MIN)} channel{clamp(count || MIN) === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-lp-text-secondary">How many channels?</span>
        <input
          type="number"
          min={MIN}
          max={MAX}
          value={count}
          autoFocus
          onChange={(e) => setCount(e.target.value === '' ? 0 : clamp(Number(e.target.value)))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !busy) void submit();
          }}
          className="w-32 rounded-lg border border-lp-border bg-lp-bg px-3 py-2 text-sm tabular-nums text-lp-text outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-lp-orange)]"
        />
        <span className="text-[11px] text-lp-text-tertiary">
          Up to {MAX} at a time. Numbered after the last input row.
        </span>
      </label>
    </Modal>
  );
}

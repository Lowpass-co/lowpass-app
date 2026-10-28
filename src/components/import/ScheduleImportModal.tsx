'use client';

/* <ScheduleImportModal> — the Schedule page's AI import (Oct 2026).
   <ScheduleImportFlow> in a wide modal. Closing mid-read or mid-review asks
   first ("Discard this import?"), because the AI's reading would be lost —
   Adam: "with a warning if you go to close it". */

import { useCallback, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { ScheduleImportFlow, type ScheduleImportFlowProps } from './ScheduleImportFlow';

export interface ScheduleImportModalProps extends Omit<ScheduleImportFlowProps, 'mode' | 'onCancel' | 'onDirtyChange'> {
  open: boolean;
  onClose: () => void;
}

export function ScheduleImportModal({ open, onClose, onApplied, ...flow }: ScheduleImportModalProps) {
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const requestClose = useCallback(() => {
    if (dirty) setConfirming(true);
    else onClose();
  }, [dirty, onClose]);

  const finish = () => {
    setConfirming(false);
    setDirty(false);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={requestClose}
      title="Import schedule"
      subtitle="Drop a tour book, routing grid or itinerary — review what the AI found, then import."
      size="xl"
      closeOnBackdrop={false}
    >
      {confirming ? (
        <div
          role="alertdialog"
          aria-label="Discard this import?"
          className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2"
          style={{
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text)',
            background: 'color-mix(in srgb, var(--color-lp-status-needs-review) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-lp-status-needs-review) 40%, transparent)',
          }}
        >
          <span>Discard this import? What the AI read will be lost and nothing will be imported.</span>
          <span className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              style={{ padding: '4px 10px', borderRadius: 'var(--lp-radius-md)', border: '1px solid var(--lp-border-strong)', background: 'transparent', color: 'var(--lp-text)', cursor: 'pointer' }}
            >
              Keep reviewing
            </button>
            <button
              type="button"
              onClick={finish}
              style={{ padding: '4px 10px', borderRadius: 'var(--lp-radius-md)', border: '1px solid transparent', background: 'var(--color-lp-error)', color: 'var(--lp-text-inverse)', cursor: 'pointer' }}
            >
              Discard
            </button>
          </span>
        </div>
      ) : null}
      {open ? (
        <ScheduleImportFlow
          {...flow}
          mode="existing"
          onDirtyChange={setDirty}
          onCancel={requestClose}
          onApplied={(r) => {
            setDirty(false);
            onApplied?.(r);
            onClose();
          }}
        />
      ) : null}
    </Modal>
  );
}

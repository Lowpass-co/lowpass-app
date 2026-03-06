'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

const CONFIRM_WORD = 'DELETE';

export function DeleteConfirmationModal({
  open,
  itemName,
  onClose,
  onConfirm,
  onDeleted,
}: {
  open: boolean;
  itemName: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  /** Called after successful delete (before closing). Use to apply red fade-out on the item. */
  onDeleted?: () => void;
}) {
  const [confirmInput, setConfirmInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const canConfirm = confirmInput.trim().toUpperCase() === CONFIRM_WORD;

  useEffect(() => {
    if (open) {
      setConfirmInput('');
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleConfirm = async () => {
    if (!canConfirm) {
      setShake(true);
      setTimeout(() => setShake(false), 400);
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await onConfirm();
      onDeleted?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50 p-4 transition-opacity duration-150"
      onClick={() => !deleting && onClose()}
    >
      <div
        className="w-full max-w-md rounded-xl border border-lp-border bg-lp-surface p-6 shadow-xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-lp-text">Delete {itemName}?</h3>
        <p className="mt-2 text-sm text-lp-text-secondary">This action cannot be undone.</p>
        <p className="mt-3 text-sm font-medium text-lp-text">Type DELETE to confirm</p>
        <input
          ref={inputRef}
          type="text"
          value={confirmInput}
          onChange={(e) => {
            setConfirmInput(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirm();
            if (e.key === 'Escape') onClose();
          }}
          placeholder="Type DELETE to confirm"
          disabled={deleting}
          className="mt-2 w-full rounded-xl border border-lp-border bg-lp-surface px-3 py-2.5 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20 disabled:opacity-50"
          autoComplete="off"
        />
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => !deleting && onClose()}
            disabled={deleting}
            className="btn-transition rounded-xl border border-lp-border px-4 py-2.5 text-sm font-medium text-lp-text hover:bg-lp-surface-hover disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm || deleting}
            className={cn(
              'btn-transition rounded-xl px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed',
              shake && 'animate-shake-disabled'
            )}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

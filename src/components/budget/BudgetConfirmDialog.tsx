/* ============================================
   LOWPASS — Budget branded confirm dialog (Fix-pack B Task 5b)

   A Lowpass-branded replacement for native window.confirm(), built on
   the shared <Modal> primitive (scrim, focus trap, Escape, animation).
   Used for the budget delete actions.

   NOTE FOR FOLLOW-UP: this same component should replace window.confirm
   app-wide — it currently lives under components/budget but is generic;
   promote it to components/ui in a later pass.

   Usage:
     const { requestConfirm, dialog } = useBudgetConfirm();
     // render {dialog} once in the tree
     requestConfirm({ message: '…', onConfirm: () => doDelete() });
   ============================================ */

'use client';

import { useCallback, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';

export interface ConfirmRequest {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' (default) renders a red confirm button. */
  tone?: 'danger' | 'default';
  onConfirm: () => void;
}

function BudgetConfirmDialog({
  state,
  onClose,
}: {
  state: ConfirmRequest | null;
  onClose: () => void;
}) {
  const danger = (state?.tone ?? 'danger') === 'danger';
  return (
    <Modal
      open={state !== null}
      onClose={onClose}
      size="sm"
      title={state?.title ?? 'Are you sure?'}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="btn-transition rounded-md border"
            style={{
              borderColor: 'var(--lp-border)',
              background: 'var(--lp-surface)',
              color: 'var(--lp-text-secondary)',
              fontSize: 'var(--lp-text-sm)',
              fontWeight: 'var(--lp-weight-medium)',
              padding: 'var(--lp-space-2) var(--lp-space-3)',
            }}
          >
            {state?.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            onClick={() => {
              state?.onConfirm();
              onClose();
            }}
            className="btn-transition rounded-md"
            style={{
              background: danger ? 'var(--color-lp-error)' : 'var(--color-lp-orange)',
              color: 'var(--lp-text-inverse)',
              fontSize: 'var(--lp-text-sm)',
              fontWeight: 'var(--lp-weight-semibold)',
              padding: 'var(--lp-space-2) var(--lp-space-4)',
            }}
          >
            {state?.confirmLabel ?? 'Delete'}
          </button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        {danger ? (
          <span
            className="mt-0.5 inline-flex shrink-0 items-center justify-center rounded-full"
            style={{
              height: 28,
              width: 28,
              color: 'var(--color-lp-error)',
              background: 'color-mix(in srgb, var(--color-lp-error) 12%, transparent)',
            }}
          >
            <AlertTriangle className="h-4 w-4" aria-hidden />
          </span>
        ) : null}
        <p
          style={{
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text-secondary)',
            lineHeight: 1.5,
          }}
        >
          {state?.message}
        </p>
      </div>
    </Modal>
  );
}

/** Hook: returns a `requestConfirm(opts)` opener and the `dialog` node to
 *  render once in the component tree. */
export function useBudgetConfirm() {
  const [state, setState] = useState<ConfirmRequest | null>(null);
  const requestConfirm = useCallback((req: ConfirmRequest) => setState(req), []);
  const dialog = (
    <BudgetConfirmDialog state={state} onClose={() => setState(null)} />
  );
  return { requestConfirm, dialog };
}

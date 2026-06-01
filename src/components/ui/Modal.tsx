'use client';

/* ============================================
   LOWPASS — <Modal> canonical dialog shell
   (UX Audit 2026 — reference template)

   One shell for the hand-rolled dialogs (StageBoxPatchModal,
   NewSectionDialog, the budget template modal, etc.) so every
   modal has the same:

     - scrim at 50% black (skill: scrim-and-modal-legibility —
       40–60% range)
     - Escape-to-close + backdrop-click-to-close
     - body scroll lock while open
     - focus moved to the dialog on open, restored on close
       (skill: focus-management)
     - role="dialog" + aria-modal + aria-labelledby
     - close affordance top-right (skill: modal-escape)
     - enter animation from scale 0.98 → 1 + fade
       (skill: modal-motion), respecting reduced-motion via
       the global .lp-modal-enter keyframe fallback

   Token-clean. Sizes: sm 28rem / md 36rem / lg 48rem.
   ============================================ */

import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Size = 'sm' | 'md' | 'lg';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Optional sub-line under the title. */
  subtitle?: string;
  size?: Size;
  /** Footer actions (usually Button[]). Rendered right-aligned. */
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** When false, backdrop click does not close (use for
   *  dirty-state guards — the consumer wires its own confirm). */
  closeOnBackdrop?: boolean;
}

const SIZE_CLASS: Record<Size, string> = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
};

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  size = 'md',
  footer,
  children,
  closeOnBackdrop = true,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  /* Escape close + scroll lock + focus management. */
  useEffect(() => {
    if (!open) return;
    const prevActive = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prevActive?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={() => closeOnBackdrop && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          'lp-modal-enter flex max-h-[90vh] w-full flex-col rounded-xl border shadow-2xl outline-none',
          SIZE_CLASS[size],
        )}
        style={{ background: 'var(--lp-surface)', borderColor: 'var(--lp-border-strong)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {title ? (
          <header
            className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3"
            style={{ borderColor: 'var(--lp-border)' }}
          >
            <div className="min-w-0">
              <h2 id={titleId} className="text-sm font-semibold text-lp-text">
                {title}
              </h2>
              {subtitle ? (
                <p className="mt-0.5 text-xs text-lp-text-secondary">{subtitle}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="rounded p-1 text-lp-text-tertiary outline-none transition-colors hover:bg-lp-surface-hover hover:text-lp-text focus-visible:ring-2 focus-visible:ring-[var(--color-lp-orange)]"
            >
              <X className="h-4 w-4" />
            </button>
          </header>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>

        {footer ? (
          <footer
            className="flex shrink-0 items-center justify-end gap-2 border-t px-4 py-3"
            style={{ borderColor: 'var(--lp-border)' }}
          >
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

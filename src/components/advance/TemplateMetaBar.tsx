/* ============================================
   LOWPASS — Advance · Template Meta Bar (Variant parity §D.3)

   Sticky strip at the top of the builder canvas. Three columns:
     1. Template name input (inline-editable, focus-ring orange)
     2. Apply To Tour(s) — opens the existing
        ApplyAdvanceTemplateSlideOver
     3. Copy from Show… — opens the existing CopyAdvanceModal

   Wiring is shallow on purpose: the existing builder owns the
   template-name persistence path, the apply-to-tour flow, and
   the copy-from-show modal. This bar provides a unified entry
   point per the Variant spec without taking ownership.
   ============================================ */

'use client';

import { useState } from 'react';
import { LayoutTemplate, Copy } from 'lucide-react';

interface TemplateMetaBarProps {
  /** Initial template name. May be null when no layout template is
   *  applied yet — in that case the input shows a placeholder. */
  templateName: string | null;
  /** Optional persistence handler. The existing builder may already
   *  manage template-name editing internally; if so, this can be a
   *  no-op or trigger a router.refresh after a server mutation. */
  onRename?: (next: string) => void;
  /** Triggers the existing ApplyAdvanceTemplateSlideOver. */
  onApplyToTours?: () => void;
  /** Triggers the existing CopyAdvanceModal. */
  onCopyFromShow?: () => void;
}

export function TemplateMetaBar({
  templateName,
  onRename,
  onApplyToTours,
  onCopyFromShow,
}: TemplateMetaBarProps) {
  const [draft, setDraft] = useState(templateName ?? '');

  return (
    <div
      className="advance-read-no-print sticky top-0 z-30 grid items-center gap-3"
      style={{
        gridTemplateColumns: 'minmax(0, 1fr) auto auto',
        padding: '12px 16px',
        background: 'var(--lp-panel)',
        borderBottom: '1px solid var(--lp-border-strong)',
      }}
    >
      <div className="min-w-0">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (onRename && draft.trim() && draft.trim() !== (templateName ?? '')) {
              onRename(draft.trim());
            }
          }}
          placeholder="Template name"
          aria-label="Template name"
          style={{
            width: '100%',
            background: 'transparent',
            color: 'var(--lp-text)',
            fontSize: '16px',
            fontWeight: 600,
            border: 'none',
            outline: 'none',
            padding: '4px 6px',
            borderRadius: 2,
          }}
          onFocus={(e) => {
            e.currentTarget.style.outline = '1px solid var(--color-lp-orange)';
            e.currentTarget.style.background = 'var(--lp-bg-deep)';
          }}
          onBlurCapture={(e) => {
            e.currentTarget.style.outline = 'none';
            e.currentTarget.style.background = 'transparent';
          }}
        />
      </div>

      <button
        type="button"
        onClick={onApplyToTours}
        disabled={!onApplyToTours}
        className="btn-transition inline-flex items-center gap-1.5"
        style={{
          padding: '6px 10px',
          fontSize: '13px',
          fontWeight: 500,
          color: onApplyToTours
            ? 'var(--lp-text-secondary)'
            : 'var(--lp-text-tertiary)',
          background: 'var(--lp-bg)',
          border: '1px solid var(--lp-border-strong)',
          borderRadius: 4,
          cursor: onApplyToTours ? 'pointer' : 'not-allowed',
        }}
      >
        <LayoutTemplate className="h-3.5 w-3.5" />
        Apply to tour(s)
      </button>

      <button
        type="button"
        onClick={onCopyFromShow}
        disabled={!onCopyFromShow}
        className="btn-transition inline-flex items-center gap-1.5"
        style={{
          padding: '6px 10px',
          fontSize: '13px',
          fontWeight: 500,
          color: onCopyFromShow
            ? 'var(--lp-text-secondary)'
            : 'var(--lp-text-tertiary)',
          background: 'var(--lp-bg)',
          border: '1px solid var(--lp-border-strong)',
          borderRadius: 4,
          cursor: onCopyFromShow ? 'pointer' : 'not-allowed',
        }}
      >
        <Copy className="h-3.5 w-3.5" />
        Copy from show…
      </button>
    </div>
  );
}

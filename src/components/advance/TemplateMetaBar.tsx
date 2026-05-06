/* ============================================
   LOWPASS — Advance · Template Meta Bar (Variant parity §D.3 + Hotfix 3 §3)

   Sticky strip at the top of the advance canvas. Sits inside the inner
   <main overflow-y-auto> scroll context so it tracks the canvas (the
   prior outer-anchored AdvanceSubHeader, sticky against the page-level
   scroll context, drifted out of sync with content scrolled in the
   inner context — Hotfix 3 §3 root cause).

   Layout (left → right):
     [ Show / Template Builder tabs ]
     [ Template name input — flex 1 ]
     [ Apply to tour(s) · Copy from show… · Duplicate · Print · Export PDF ]

   Save is gone — autosave already handles it; the explicit button was
   display-only chrome.

   Wiring is shallow: the existing builder owns template-name persistence
   and the Apply / Copy modal slots; this bar provides a unified entry
   point per the Variant spec without taking ownership.
   ============================================ */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Copy, Download, LayoutTemplate, Printer } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

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
  /** Duplicate the current template/show. Currently aliased to
   *  onCopyFromShow — the old AdvanceSubHeader's ⌘D chip pointed at
   *  the same flow. A future "duplicate to other shows" surface can
   *  split this. */
  onDuplicate?: () => void;
  /** Active tab — 'show' = read view, 'builder' = template builder. */
  activeTab: 'show' | 'builder';
  /** Href for the Show tab (read mode). */
  showHref: string;
  /** Href for the Template Builder tab (?mode=edit). */
  builderHref: string;
}

export function TemplateMetaBar({
  templateName,
  onRename,
  onApplyToTours,
  onCopyFromShow,
  onDuplicate,
  activeTab,
  showHref,
  builderHref,
}: TemplateMetaBarProps) {
  const [draft, setDraft] = useState(templateName ?? '');
  const { showToast } = useToast();

  const tabs = [
    { key: 'show' as const, label: 'Show', href: showHref },
    { key: 'builder' as const, label: 'Template Builder', href: builderHref },
  ];

  return (
    <div
      className="advance-read-no-print sticky top-0 z-30 grid items-center gap-3"
      style={{
        gridTemplateColumns: 'auto minmax(0, 1fr) auto',
        padding: '12px 16px',
        background: 'var(--lp-panel)',
        borderBottom: '1px solid var(--lp-border-strong)',
      }}
    >
      {/* Left: Show / Template Builder tabs */}
      <nav
        className="inline-flex items-center gap-0.5 rounded-md border p-0.5"
        style={{
          borderColor: 'var(--lp-border-strong)',
          background: 'var(--lp-bg-deep)',
        }}
        role="tablist"
        aria-label="Advance tabs"
      >
        {tabs.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              role="tab"
              aria-selected={active}
              scroll={false}
              className="btn-transition rounded-sm px-2.5 py-1"
              style={{
                fontSize: '12px',
                fontWeight: active ? 600 : 500,
                background: active ? 'var(--lp-surface)' : 'transparent',
                color: active ? 'var(--lp-text)' : 'var(--lp-text-secondary)',
                boxShadow: active
                  ? `inset 0 -2px 0 var(--color-lp-orange)`
                  : 'none',
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {/* Middle: template name input */}
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

      {/* Right: action buttons. Apply / Copy preserved from §D.3.
          Duplicate / Print / Export PDF preserved from the retired
          AdvanceSubHeader (Hotfix 3 §3). Save dropped — autosave. */}
      <div className="flex items-center gap-2">
        <MetaButton
          label="Apply to tour(s)"
          icon={<LayoutTemplate className="h-3.5 w-3.5" />}
          onClick={onApplyToTours}
        />
        <MetaButton
          label="Copy from show…"
          icon={<Copy className="h-3.5 w-3.5" />}
          onClick={onCopyFromShow}
        />
        <MetaButton
          label="Duplicate"
          icon={<Copy className="h-3.5 w-3.5" />}
          onClick={onDuplicate ?? onCopyFromShow}
        />
        <MetaButton
          label="Print"
          icon={<Printer className="h-3.5 w-3.5" />}
          onClick={() => {
            if (typeof window !== 'undefined') window.print();
          }}
        />
        <MetaButton
          label="Export PDF"
          icon={<Download className="h-3.5 w-3.5" />}
          onClick={() =>
            showToast(
              'PDF export for advance is wired through the read-view print flow — use ⌘P for now.',
            )
          }
        />
      </div>
    </div>
  );
}

function MetaButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
}) {
  const enabled = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      className="btn-transition inline-flex items-center gap-1.5"
      style={{
        padding: '6px 10px',
        fontSize: '13px',
        fontWeight: 500,
        color: enabled ? 'var(--lp-text-secondary)' : 'var(--lp-text-tertiary)',
        background: 'var(--lp-bg)',
        border: '1px solid var(--lp-border-strong)',
        borderRadius: 4,
        cursor: enabled ? 'pointer' : 'not-allowed',
        whiteSpace: 'nowrap',
      }}
    >
      {icon}
      {label}
    </button>
  );
}

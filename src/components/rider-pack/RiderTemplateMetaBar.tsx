/* ============================================
   LOWPASS — Rider · Template Meta Bar (§RA4)

   Sticky strip at the top of the rider builder canvas. Ports
   src/components/advance/TemplateMetaBar.tsx:55-226 — sits inside the
   inner scroll context (sticky top-0), Show / Builder tab pills with
   the inset bottom orange underline on the active tab, a flex-1
   template-name input, and an action button cluster. Save is gone
   (autosave owns it), matching Advance.

   Rider deviations (data-shape justified):
   - Tabs: "Show" / "Builder" (the rider read view vs the template
     structure editor).
   - Actions: Apply to tour(s) · Duplicate · Print · Export PDF.
     Dropped Advance's "Copy from show…" (no per-show copy flow for
     riders). All are optional handler slots the shell wires (§RA6);
     a button with no handler renders disabled.
   ============================================ */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Copy, Download, LayoutTemplate, Printer } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

interface RiderTemplateMetaBarProps {
  /** Pack / template name; null shows a placeholder. */
  templateName: string | null;
  /** Persist a rename (shell-owned; may router.refresh after mutation). */
  onRename?: (next: string) => void;
  /** Assign this artist template to tour(s) (assign-to-tour flow). */
  onApplyToTours?: () => void;
  /** Duplicate the current pack/template. */
  onDuplicate?: () => void;
  /** Export to PDF (shell-wired); falls back to a hint toast. */
  onExportPdf?: () => void;
  /** Active tab — 'show' = read view, 'builder' = template builder. */
  activeTab: 'show' | 'builder';
  showHref: string;
  builderHref: string;
}

export function RiderTemplateMetaBar({
  templateName,
  onRename,
  onApplyToTours,
  onDuplicate,
  onExportPdf,
  activeTab,
  showHref,
  builderHref,
}: RiderTemplateMetaBarProps) {
  const [draft, setDraft] = useState(templateName ?? '');
  const { showToast } = useToast();

  const tabs = [
    { key: 'show' as const, label: 'Show', href: showHref },
    { key: 'builder' as const, label: 'Builder', href: builderHref },
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
      {/* Left: Show / Builder tabs */}
      <nav
        className="inline-flex items-center gap-0.5 rounded-md border p-0.5"
        style={{ borderColor: 'var(--lp-border-strong)', background: 'var(--lp-bg-deep)' }}
        role="tablist"
        aria-label="Rider tabs"
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
                boxShadow: active ? 'inset 0 -2px 0 var(--color-lp-orange)' : 'none',
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
          placeholder="Rider name"
          aria-label="Rider name"
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

      {/* Right: actions (optional handler slots; disabled without a handler). */}
      <div className="flex items-center gap-2">
        <MetaButton label="Apply to tour(s)" icon={<LayoutTemplate className="h-3.5 w-3.5" />} onClick={onApplyToTours} />
        <MetaButton label="Duplicate" icon={<Copy className="h-3.5 w-3.5" />} onClick={onDuplicate} />
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
          onClick={onExportPdf ?? (() => showToast('PDF export runs through the read-view print flow — use ⌘P for now.'))}
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

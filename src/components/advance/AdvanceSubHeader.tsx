/* ============================================
   LOWPASS — Advance · Sub-header (visual redesign §A.1)

   Sub-header that sits beneath <ProductHeader> on the per-show
   advance page. Layout:

   [ ADVANCE / Show name ]   [ Show | Template Builder ]   [ Ctrl+S Save · Ctrl+D Duplicate ]   [ Export PDF ]

   Notes:
   - "ADVANCE" is brand-orange. Slash + show name is the
     breadcrumb context for THIS show — sits *next to* the
     artist · tour breadcrumb in <ProductHeader>, not replacing it.
   - Tab nav switches between Show (read view) and Template Builder
     (edit view) via ?mode=edit. Same URL pattern that's been live
     since UX17 — Option A in the spec, picked for minimum diff.
   - Keyboard hint chips are display-only; the actual shortcuts are
     wired by AdvanceSectionBuilder's editor (Ctrl+S autosave,
     Ctrl+D triggers the existing copy-from-show flow).
   - "Export PDF" is a stub for the per-show PDF export. Until the
     export route lands it opens a non-disruptive toast hint.
   ============================================ */

'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Download, Printer } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

interface AdvanceSubHeaderProps {
  /** Show name (= tour name + date for non-show days). */
  showLabel: string;
  /** Active tab — 'show' = read view, 'builder' = template builder. */
  activeTab: 'show' | 'builder';
}

export function AdvanceSubHeader({ showLabel, activeTab }: AdvanceSubHeaderProps) {
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  function hrefForTab(tab: 'show' | 'builder'): string {
    const params = new URLSearchParams(searchParams);
    if (tab === 'builder') params.set('mode', 'edit');
    else params.delete('mode');
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <div
      className="lp-advance-subheader sticky z-40 flex flex-wrap items-center gap-3 border-b px-4 py-2"
      style={{
        top: 48 /* matches ProductHeader's h-12 */,
        background: 'var(--lp-panel)',
        borderColor: 'var(--lp-border-strong)',
      }}
    >
      {/* Left: ADVANCE / show name */}
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--color-lp-orange)',
          }}
        >
          Advance
        </span>
        <span
          style={{
            fontSize: '14px',
            color: 'var(--lp-text-tertiary)',
            fontWeight: 400,
          }}
        >
          /
        </span>
        <span
          className="truncate"
          style={{
            fontSize: '14px',
            fontWeight: 500,
            color: 'var(--lp-text)',
          }}
        >
          {showLabel}
        </span>
      </div>

      {/* Center: Show / Template Builder tabs */}
      <nav
        className="inline-flex items-center gap-0.5 rounded-md border p-0.5"
        style={{
          borderColor: 'var(--lp-border-strong)',
          background: 'var(--lp-bg-deep)',
        }}
        role="tablist"
        aria-label="Advance tabs"
      >
        {(
          [
            { key: 'show', label: 'Show' },
            { key: 'builder', label: 'Template Builder' },
          ] as const
        ).map((tab) => {
          const active = tab.key === activeTab;
          return (
            <Link
              key={tab.key}
              href={hrefForTab(tab.key)}
              role="tab"
              aria-selected={active}
              scroll={false}
              className="btn-transition rounded-sm px-2.5 py-1"
              style={{
                fontSize: '12px',
                fontWeight: active ? 600 : 500,
                background: active
                  ? 'var(--lp-surface)'
                  : 'transparent',
                color: active
                  ? 'var(--lp-text)'
                  : 'var(--lp-text-secondary)',
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

      {/* Right: keyboard hints + actions (Print, Export) */}
      <div className="hidden items-center gap-3 lg:flex">
        <KbdHint chord="⌘S" label="Save" />
        <KbdHint chord="⌘D" label="Duplicate" />
      </div>
      {activeTab === 'show' ? (
        <button
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined') window.print();
          }}
          className="btn-transition inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1"
          style={{
            borderColor: 'var(--lp-border-strong)',
            background: 'var(--lp-bg)',
            color: 'var(--lp-text-secondary)',
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          <Printer className="h-3.5 w-3.5" />
          Print
        </button>
      ) : null}
      <button
        type="button"
        onClick={() =>
          showToast(
            'PDF export for advance is wired through the read-view print flow — use ⌘P for now.',
          )
        }
        className="btn-transition inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1"
        style={{
          borderColor: 'var(--lp-border-strong)',
          background: 'var(--lp-bg)',
          color: 'var(--lp-text-secondary)',
          fontSize: '12px',
          fontWeight: 500,
        }}
      >
        <Download className="h-3.5 w-3.5" />
        Export PDF
      </button>
    </div>
  );
}

function KbdHint({ chord, label }: { chord: string; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5"
      style={{ fontSize: '11px', color: 'var(--lp-text-tertiary)' }}
    >
      <kbd
        className="lp-mono"
        style={{
          fontSize: '11px',
          padding: '2px 5px',
          borderRadius: 4,
          border: '1px solid var(--lp-border-subtle)',
          background: 'var(--lp-bg)',
          color: 'var(--lp-text-secondary)',
          lineHeight: 1,
        }}
      >
        {chord}
      </kbd>
      {label}
    </span>
  );
}

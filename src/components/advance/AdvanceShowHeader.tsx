/* ============================================
   LOWPASS — Advance · Sticky show big-header (visual redesign §A.3)

   First child of the main content area on the per-show advance
   page (renders inside the right column, beneath ProductHeader +
   sub-header). Big H1 show name, city + date, applied template
   chip, last-edited line, and an Advance Progress card with a
   progress bar and "X / Y sections complete" framing.

   Adam's lock: NO "Mark All Complete" button. NO "Tasks done"
   wording. Advance is not a to-do list — this card reads as a
   completion signal, not a task tick-off.

   Server-renderable. The page resolves last_updated_by_id → display
   name + computes the section progress before passing it down.
   ============================================ */

import Link from 'next/link';
import { LayoutTemplate, Pencil } from 'lucide-react';

interface AdvanceShowHeaderProps {
  showName: string;
  /** "Gulf Shores, AL · 22 Mar 2026" — pre-formatted by the page. */
  contextLine: string;
  /** Applied layout template name; null = no template applied. */
  templateName: string | null;
  /** When the advance instance was last touched + by whom. */
  lastEditedRelative: string | null;
  lastEditedBy: string | null;
  /** Progress across this advance instance's sections. */
  sectionsComplete: number;
  sectionsTotal: number;
  /** Active tab so the right-rail action label can adapt. */
  activeTab: 'show' | 'builder';
  /** Href for the "Edit template" action (toggles tab to builder). */
  builderHref: string;
}

export function AdvanceShowHeader({
  showName,
  contextLine,
  templateName,
  lastEditedRelative,
  lastEditedBy,
  sectionsComplete,
  sectionsTotal,
  activeTab,
  builderHref,
}: AdvanceShowHeaderProps) {
  const pct =
    sectionsTotal > 0
      ? Math.min(100, Math.round((sectionsComplete / sectionsTotal) * 100))
      : 0;

  return (
    <header
      className="lp-advance-show-header rounded-lg border p-4"
      style={{
        borderColor: 'var(--lp-border-strong)',
        background: 'var(--lp-surface)',
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="lp-h1 truncate">{showName}</h1>
          <p
            style={{
              fontSize: '14px',
              color: 'var(--lp-text-secondary)',
            }}
          >
            {contextLine}
          </p>
          <div
            className="flex flex-wrap items-center gap-2 pt-1"
            style={{ fontSize: '12px', color: 'var(--lp-text-tertiary)' }}
          >
            {templateName ? (
              <Link
                href={builderHref}
                className="btn-transition inline-flex items-center gap-1 rounded-full border px-2 py-0.5"
                style={{
                  borderColor: 'var(--lp-border-strong)',
                  background: 'var(--lp-bg-deep)',
                  color: 'var(--lp-text-secondary)',
                  fontSize: '11px',
                  fontWeight: 500,
                }}
                title="Open Template Builder"
              >
                <LayoutTemplate
                  className="h-3 w-3"
                  style={{ color: 'var(--color-lp-orange)' }}
                />
                Template: {templateName}
              </Link>
            ) : (
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--lp-text-tertiary)',
                  fontStyle: 'italic',
                }}
              >
                No layout template applied
              </span>
            )}
            {lastEditedRelative ? (
              <span>
                <span
                  style={{ color: 'var(--lp-text-tertiary)' }}
                >
                  Last edited
                </span>{' '}
                <span className="lp-mono">{lastEditedRelative}</span>
                {lastEditedBy ? (
                  <>
                    {' '}
                    by{' '}
                    <span style={{ color: 'var(--lp-text-secondary)' }}>
                      {lastEditedBy}
                    </span>
                  </>
                ) : null}
              </span>
            ) : null}
          </div>
        </div>

        {/* Right rail — Edit template action. NO "Mark All Complete"
            (Adam's lock: advance is not a to-do list). */}
        <div className="shrink-0">
          {activeTab === 'show' ? (
            <Link
              href={builderHref}
              className="btn-transition inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5"
              style={{
                borderColor: 'var(--lp-border-strong)',
                background: 'var(--lp-bg)',
                color: 'var(--lp-text)',
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit template
            </Link>
          ) : null}
        </div>
      </div>

      {/* Advance Progress card — completion signal, NOT a tasks-done bar. */}
      <div
        className="mt-4 rounded-md border p-3"
        style={{
          borderColor: 'var(--lp-border-subtle)',
          background: 'var(--lp-bg-deep)',
        }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--lp-text-tertiary)',
            }}
          >
            Advance progress
          </span>
          <span
            className="lp-mono"
            style={{
              fontSize: '12px',
              color: 'var(--lp-text-secondary)',
            }}
          >
            {sectionsTotal === 0 ? (
              'No sections yet'
            ) : (
              <>
                <span style={{ color: 'var(--lp-text)', fontWeight: 600 }}>
                  {sectionsComplete}
                </span>
                {' / '}
                {sectionsTotal} sections complete
              </>
            )}
          </span>
        </div>
        <div
          className="mt-2 overflow-hidden rounded-full"
          style={{
            height: 6,
            background: 'var(--lp-bg)',
          }}
          aria-hidden
        >
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background:
                pct >= 100
                  ? 'var(--color-lp-status-complete)'
                  : 'var(--color-lp-orange)',
              transition: 'width 200ms var(--lp-ease-standard, ease)',
            }}
          />
        </div>
      </div>
    </header>
  );
}

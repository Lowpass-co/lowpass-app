/* ============================================
   LOWPASS — Advance · Sticky show big-header (Variant parity §A)

   First child of the main content area on the per-show advance
   page (renders inside the right column, beneath ProductHeader +
   sub-header). Big H1 show name, city + date, applied template
   chip, last-edited line, and the chunky Advance Progress strip
   (progress bar + Complete/Pending/Overdue stat tiles + 64px
   circular ring) followed by the "X / Y sections complete" caption.

   Adam's lock: NO "Mark All Complete" button. NO "Tasks done"
   wording. Advance is not a to-do list — this card reads as a
   completion signal, not a task tick-off.

   Server-renderable. The page resolves last_updated_by_id → display
   name + computes the section progress before passing it down.
   ============================================ */

import Link from 'next/link';
import { LayoutTemplate, Package, Pencil } from 'lucide-react';
import { CircularProgressRing } from './CircularProgressRing';

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
  /** Sections with status not_started / in_progress, excluding overdue. */
  pendingSectionsCount: number;
  /** Not-started sections whose show date has already passed. */
  overdueSectionsCount: number;
  /** Active tab so the right-rail action label can adapt. */
  activeTab: 'show' | 'builder';
  /** Href for the "Edit template" action (toggles tab to builder). */
  builderHref: string;
  /** Sprint 12 §11b — href for the Advance Packet view, the
   *  shareable docs manifest at /advance/[tour]/[show]/packet. */
  packetHref: string;
}

export function AdvanceShowHeader({
  showName,
  contextLine,
  templateName,
  lastEditedRelative,
  lastEditedBy,
  sectionsComplete,
  sectionsTotal,
  pendingSectionsCount,
  overdueSectionsCount,
  activeTab,
  builderHref,
  packetHref,
}: AdvanceShowHeaderProps) {
  const pct =
    sectionsTotal > 0
      ? Math.min(100, Math.round((sectionsComplete / sectionsTotal) * 100))
      : 0;
  const hasOverdue = overdueSectionsCount > 0;

  return (
    <header
      className="lp-advance-show-header rounded-md border p-4"
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
                <span style={{ color: 'var(--lp-text-tertiary)' }}>
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
            (Adam's lock: advance is not a to-do list).
            §11b adds a Packet link beside it so operators can
            jump straight to the share view from the advance. */}
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={packetHref}
            className="btn-transition inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5"
            style={{
              borderColor: 'var(--lp-border-strong)',
              background: 'var(--lp-bg)',
              color: 'var(--lp-text)',
              fontSize: '13px',
              fontWeight: 500,
            }}
            title="Open the Advance Packet share view"
          >
            <Package className="h-3.5 w-3.5" />
            Packet
          </Link>
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

      {/* Advance Progress strip — progress bar + 3 stat tiles + circular ring.
          Completion signal, NOT a tasks-done bar. */}
      <div
        className="mt-4 rounded-md border p-4"
        style={{
          borderColor: 'var(--lp-border-strong)',
          background: 'var(--lp-panel)',
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="grid flex-1 items-center gap-3"
            style={{
              gridTemplateColumns: '3fr 1fr 1fr 1fr',
            }}
          >
            {/* Col 1: thick orange progress bar */}
            <div className="min-w-0">
              <div
                className="overflow-hidden rounded-full"
                style={{
                  height: 14,
                  background: 'var(--lp-border-subtle)',
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
                    transition:
                      'width 200ms var(--lp-ease-standard, ease)',
                  }}
                />
              </div>
            </div>
            {/* Col 2: Complete tile */}
            <StatTile
              label="Complete"
              value={sectionsComplete}
              tint="default"
            />
            {/* Col 3: Pending tile */}
            <StatTile
              label="Pending"
              value={pendingSectionsCount}
              tint="default"
            />
            {/* Col 4: Overdue tile (red when > 0) */}
            <StatTile
              label="Overdue"
              value={overdueSectionsCount}
              tint={hasOverdue ? 'overdue' : 'default'}
            />
          </div>
          {/* Circular ring on the right */}
          <div className="shrink-0">
            <CircularProgressRing percent={pct} size={64} />
          </div>
        </div>

        {/* "X / Y sections complete" caption below the strip */}
        <div
          className="mt-3"
          style={{ fontSize: '14px', color: 'var(--lp-text-secondary)' }}
        >
          {sectionsTotal === 0 ? (
            'No sections yet'
          ) : (
            <>
              <span
                className="lp-mono"
                style={{ color: 'var(--lp-text)', fontWeight: 600 }}
              >
                {sectionsComplete} / {sectionsTotal}
              </span>
              {' sections complete'}
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function StatTile({
  label,
  value,
  tint,
}: {
  label: string;
  value: number;
  tint: 'default' | 'overdue';
}) {
  return (
    <div className="min-w-0">
      <div
        className="lp-mono"
        style={{
          fontSize: '20px',
          fontWeight: 600,
          color:
            tint === 'overdue'
              ? 'var(--color-lp-day-tv)'
              : 'var(--lp-text)',
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--lp-text-tertiary)',
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </div>
  );
}

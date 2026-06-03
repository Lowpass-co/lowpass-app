/* ============================================
   LOWPASS — Rider · Per-pack glass hero (§RA2)

   Ports the Advance per-show glass hero (AdvanceShowHeader.tsx:99-289)
   to the Rider pack surface. Same glass panel, soft brand glow,
   chip/sub-line/lineage layout, action row, and completion stats —
   re-tokened identically so it stays adaptive (light/dark).

   Rider adaptation (riders have no date/venue):
   - date chip  → SCOPE chip (Artist / Tour / Show) — Layers icon + label
     (icon+label, not colour alone — color-not-only).
   - address sub-line → scope context (tour/artist name) with a
     scope-appropriate icon, so the slot isn't dead space.
   - template-lineage chip + last-edited → kept (riders inherit a parent
     template).
   - date-derived "Overdue" stat → "Needs review" (a real
     rider_sections.status), keeping the amber warning-tone slot.
   - actions: "Edit template" (show mode) + "Open public preview"
     (when a share token exists). No "Send Packet" (Advance-specific).

   Server-renderable. The page resolves last_updated_by_id → display
   name + computes section progress before passing it down.
   Reuses CircularProgressRing as-is (spec lock).
   ============================================ */

import Link from 'next/link';
import {
  LayoutTemplate,
  Pencil,
  Layers,
  Building2,
  User,
  Eye,
  AlertTriangle,
} from 'lucide-react';
import { CircularProgressRing } from '@/components/advance/CircularProgressRing';

export type RiderScope = 'artist' | 'tour' | 'show';

interface RiderPackHeaderProps {
  packTitle: string;
  /** artist | tour | show — the rider's primary classifier (date analog). */
  scope: RiderScope;
  /** Context line: tour name (tour scope) / artist name (artist scope). */
  scopeContext?: string | null;
  /** Parent template this pack inherits structure from; null = none. */
  templateName: string | null;
  /** When the pack was last touched + by whom. */
  lastEditedRelative: string | null;
  lastEditedBy: string | null;
  /** Progress across this pack's sections. */
  sectionsComplete: number;
  sectionsTotal: number;
  /** Sections with status in_progress. */
  inProgressCount: number;
  /** Sections with status needs_review. */
  needsReviewCount: number;
  /** Active tab so the action label can adapt. */
  activeTab: 'show' | 'builder';
  /** Href for the "Edit template" action (toggles to builder mode). */
  builderHref: string;
  /** Public read-only preview URL — shown only when a share token exists. */
  publicPreviewHref?: string | null;
}

const SCOPE_LABEL: Record<RiderScope, string> = {
  artist: 'Artist',
  tour: 'Tour',
  show: 'Show',
};

export function RiderPackHeader({
  packTitle,
  scope,
  scopeContext,
  templateName,
  lastEditedRelative,
  lastEditedBy,
  sectionsComplete,
  sectionsTotal,
  inProgressCount,
  needsReviewCount,
  activeTab,
  builderHref,
  publicPreviewHref,
}: RiderPackHeaderProps) {
  const pct =
    sectionsTotal > 0
      ? Math.min(100, Math.round((sectionsComplete / sectionsTotal) * 100))
      : 0;
  const showMissing = sectionsTotal > 0 && sectionsComplete < sectionsTotal;
  const ScopeContextIcon = scope === 'artist' ? User : Building2;

  return (
    <header
      className="lp-rider-pack-header relative overflow-hidden rounded-2xl border p-6 shadow-sm sm:p-8"
      style={{
        borderColor: 'var(--lp-border-strong)',
        background: 'var(--lp-surface)',
      }}
    >
      {/* Soft brand glow, top-right — token-tinted depth cue. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full blur-3xl"
        style={{
          background:
            'color-mix(in srgb, var(--color-lp-orange) 10%, transparent)',
        }}
      />

      <div className="relative flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        {/* ── Identity ───────────────────────────────────────────── */}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <span
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1"
              style={{
                borderColor: 'var(--lp-border-strong)',
                background: 'var(--lp-bg-deep)',
                color: 'var(--lp-text-secondary)',
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              <Layers className="h-3 w-3" />
              {SCOPE_LABEL[scope]}
            </span>
            {showMissing ? (
              <span
                className="inline-flex items-center gap-1.5"
                style={{
                  color:
                    'color-mix(in srgb, var(--color-lp-status-needs-review) 85%, var(--lp-text))',
                  fontSize: '12px',
                  fontWeight: 500,
                }}
              >
                <AlertTriangle className="h-3 w-3" />
                Missing info
              </span>
            ) : null}
          </div>

          <h1 className="lp-h1 truncate" style={{ letterSpacing: '-0.01em' }}>
            {packTitle}
          </h1>

          {scopeContext ? (
            <p
              className="mt-1.5 flex items-center gap-2"
              style={{ fontSize: '14px', color: 'var(--lp-text-secondary)' }}
            >
              <ScopeContextIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{scopeContext}</span>
            </p>
          ) : null}

          <div
            className="mt-2 flex flex-wrap items-center gap-2"
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
                title="Open template builder"
              >
                <LayoutTemplate
                  className="h-3 w-3"
                  style={{ color: 'var(--color-lp-orange)' }}
                />
                Template: {templateName}
              </Link>
            ) : (
              <span style={{ fontStyle: 'italic' }}>No parent template</span>
            )}
            {lastEditedRelative ? (
              <span>
                <span style={{ color: 'var(--lp-text-tertiary)' }}>Last edited</span>{' '}
                <span className="lp-mono">{lastEditedRelative}</span>
                {lastEditedBy ? (
                  <>
                    {' '}
                    by{' '}
                    <span style={{ color: 'var(--lp-text-secondary)' }}>{lastEditedBy}</span>
                  </>
                ) : null}
              </span>
            ) : null}
          </div>
        </div>

        {/* ── Actions — outlined secondary + orange primary (one primary). */}
        <div className="flex shrink-0 items-center gap-2">
          {activeTab === 'show' ? (
            <Link
              href={builderHref}
              className="btn-transition inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-lp-orange)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--lp-bg)]"
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
          {publicPreviewHref ? (
            <a
              href={publicPreviewHref}
              target="_blank"
              rel="noreferrer"
              className="btn-transition inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-lp-orange)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--lp-bg)]"
              style={{
                background: 'var(--color-lp-orange)',
                color: 'var(--lp-text-inverse)',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              <Eye className="h-3.5 w-3.5" />
              Open public preview
            </a>
          ) : null}
        </div>
      </div>

      {/* ── Stats row — completion ring + Complete / In progress / Needs review. */}
      <div
        className="relative mt-7 grid items-center gap-6 border-t pt-6"
        style={{
          borderColor: 'var(--lp-border-strong)',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        }}
      >
        <div
          className="flex items-center gap-4 pr-6"
          style={{ borderRight: '1px solid var(--lp-border-strong)' }}
        >
          <div className="shrink-0">
            <CircularProgressRing percent={pct} size={56} />
          </div>
          <div className="min-w-0">
            <p
              style={{
                fontSize: '10px',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--lp-text-tertiary)',
                marginBottom: 2,
              }}
            >
              Overall
            </p>
            <p style={{ fontSize: '14px', color: 'var(--lp-text)' }}>Completion</p>
          </div>
        </div>

        <HeroStat value={sectionsComplete} label="Complete" tone="default" />
        <HeroStat value={inProgressCount} label="In progress" tone="pending" />
        <HeroStat
          value={needsReviewCount}
          label="Needs review"
          tone={needsReviewCount > 0 ? 'review' : 'muted'}
        />
      </div>
    </header>
  );
}

function HeroStat({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: 'default' | 'pending' | 'review' | 'muted';
}) {
  const color =
    tone === 'pending'
      ? 'var(--color-lp-status-needs-review)'
      : tone === 'review'
        ? 'var(--color-lp-status-needs-review)'
        : tone === 'muted'
          ? 'var(--lp-text-tertiary)'
          : 'var(--lp-text)';
  return (
    <div className="flex flex-col justify-center">
      <span style={{ fontSize: '30px', fontWeight: 300, lineHeight: 1.05, color }}>{value}</span>
      <span
        style={{
          fontSize: '10px',
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--lp-text-tertiary)',
          marginTop: 6,
        }}
      >
        {label}
      </span>
    </div>
  );
}

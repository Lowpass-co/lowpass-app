/* ============================================
   LOWPASS — Advance · Per-show glass hero (UX Audit 2026 · T2)

   First child of the main content area on the per-show advance page.
   Reworked from the dense "big-header + progress strip" into the glass
   hero from Adam's redesign reference — but routed through --lp tokens
   so it stays adaptive (light/dark), not the mockup's hardcoded dark
   zinc/amber.

   Layout:
     ┌ glass panel (soft brand glow top-right) ─────────────────────┐
     │ [date chip] [Missing info]      [Edit Template] [Send Packet] │
     │ Venue Name (H1)                                               │
     │ ◍ address line                                                │
     │ template chip · last edited                                   │
     ├──────────────────────────────────────────────────────────────┤
     │ ◴ ring  OVERALL/Completion │ Complete │ Pending │ Overdue      │
     └──────────────────────────────────────────────────────────────┘

   Adam's locks carried forward: NO "Mark All Complete", NO "Tasks done"
   wording. Advance is a completion signal, not a to-do list.

   Buttons follow the app-wide language: Send Packet = brand-orange
   primary, Edit Template = outlined secondary (matches <Button>).

   Server-renderable. The page resolves last_updated_by_id → display
   name + computes the section progress before passing it down.
   ============================================ */

import Link from 'next/link';
import {
  LayoutTemplate,
  Pencil,
  Calendar,
  MapPin,
  AlertTriangle,
  Send,
} from 'lucide-react';
import { CircularProgressRing } from './CircularProgressRing';

interface AdvanceShowHeaderProps {
  showName: string;
  /** "Gulf Shores, AL · 22 Mar 2026" — pre-formatted fallback used for
   *  the date chip + sub-line when the discrete props below are absent. */
  contextLine: string;
  /** UX Audit 2026 — discrete date label for the chip ("02 Oct 2026"). */
  dateLabel?: string | null;
  /** UX Audit 2026 — venue address shown under the title with a pin. */
  addressLine?: string | null;
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
  /** Href for the "Edit Template" action (toggles tab to builder). */
  builderHref: string;
  /** Sprint 12 §11b — href for the Advance Packet view, the shareable
   *  docs manifest at /advance/[tour]/[show]/packet. The "Send Packet"
   *  primary points here; T3 turns this into the venue intake flow. */
  packetHref: string;
}

export function AdvanceShowHeader({
  showName,
  contextLine,
  dateLabel,
  addressLine,
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
  const showMissing = sectionsTotal > 0 && sectionsComplete < sectionsTotal;
  const dateChip = dateLabel || contextLine || null;
  const subLine = addressLine || contextLine || null;

  return (
    <header
      className="lp-advance-show-header relative overflow-hidden rounded-2xl border p-6 shadow-sm sm:p-8"
      style={{
        borderColor: 'var(--lp-border-strong)',
        background: 'var(--lp-surface)',
      }}
    >
      {/* Soft brand glow, top-right — the mockup's depth cue, token-tinted. */}
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
            {dateChip ? (
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
                <Calendar className="h-3 w-3" />
                {dateChip}
              </span>
            ) : null}
            {showMissing ? (
              <span
                className="advance-badge__dot-host inline-flex items-center gap-1.5"
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
            {showName}
          </h1>

          {subLine ? (
            <p
              className="mt-1.5 flex items-center gap-2"
              style={{ fontSize: '14px', color: 'var(--lp-text-secondary)' }}
            >
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{subLine}</span>
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
                title="Open Template Builder"
              >
                <LayoutTemplate
                  className="h-3 w-3"
                  style={{ color: 'var(--color-lp-orange)' }}
                />
                Template: {templateName}
              </Link>
            ) : (
              <span style={{ fontStyle: 'italic' }}>
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

        {/* ── Actions ────────────────────────────────────────────────
            App-wide button language: outlined secondary + orange primary.
            NO "Mark All Complete" (Adam's lock). */}
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
              Edit Template
            </Link>
          ) : null}
          <Link
            href={packetHref}
            className="btn-transition group inline-flex items-center gap-1.5 rounded-lg px-4 py-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-lp-orange)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--lp-bg)]"
            style={{
              background: 'var(--color-lp-orange)',
              color: '#FFFFFF',
              fontSize: '13px',
              fontWeight: 600,
            }}
            title="Open the Advance Packet — send to the venue to fill in"
          >
            <Send className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            Send Packet
          </Link>
        </div>
      </div>

      {/* ── Stats row — completion ring + Complete / Pending / Overdue.
          A completion signal, not a tasks-done bar. ─────────────────── */}
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
            <p style={{ fontSize: '14px', color: 'var(--lp-text)' }}>
              Completion
            </p>
          </div>
        </div>

        <HeroStat value={sectionsComplete} label="Complete" tone="default" />
        <HeroStat
          value={pendingSectionsCount}
          label="Pending"
          tone="pending"
        />
        <HeroStat
          value={overdueSectionsCount}
          label="Overdue"
          tone={hasOverdue ? 'overdue' : 'muted'}
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
  tone: 'default' | 'pending' | 'overdue' | 'muted';
}) {
  const color =
    tone === 'pending'
      ? 'var(--color-lp-status-needs-review)'
      : tone === 'overdue'
        ? 'var(--color-lp-error)'
        : tone === 'muted'
          ? 'var(--lp-text-tertiary)'
          : 'var(--lp-text)';
  return (
    <div className="flex flex-col justify-center">
      <span
        style={{
          fontSize: '30px',
          fontWeight: 300,
          lineHeight: 1.05,
          color,
        }}
      >
        {value}
      </span>
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

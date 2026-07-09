'use client';

/* ============================================================
   LOWPASS — <ShareSurface> (P3 · B4 · VIS-AS)

   The styled Share surface for a show's advance. Composes existing infra:
   - VIS-AS-01 venue-view preview: every section listed; TM-only sections shown
     dimmed with an eye-off ("hidden from venue"), NEVER omitted. The
     never-clobber rule is stated in words.
   - VIS-AS-02 intake link card: reuses <SendPacketButton> (generate / copy /
     revoke / expiry / recipient) + the venue-fillable count.
   - VIS-AS-03 packet builder: link to the existing packet builder (/packet).
   - VIS-AS-04 primary "Export advance" → the existing packet PDF route (single
     show; multi-show export lives in the packet builder).
   - VIS-AS-05 activity log with mono timestamps (empty-state honest for now).
   ============================================================ */

import Link from 'next/link';
import { Download, Eye, EyeOff, FileText, Send } from 'lucide-react';
import { SendPacketButton } from './SendPacketButton';

export interface ShareSectionView {
  templateId: string;
  label: string;
  tmOnly: boolean;
  totalFields: number;
  venueFillable: number;
}

export function ShareSurface({
  tourId,
  routingId,
  sections,
  fillableTotal,
}: {
  tourId: string;
  routingId: string;
  sections: ShareSectionView[];
  fillableTotal: number;
}) {
  const tmOnlyCount = sections.filter((s) => s.tmOnly).length;

  return (
    <div
      className="lp-view-tier mx-auto w-full"
      style={{ maxWidth: 900, padding: 'var(--lp-space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--lp-space-5)' }}
    >
      {/* Header + primary Export advance (VIS-AS-04) */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="lp-label-caps" style={{ color: 'var(--lp-text-tertiary)' }}>
            Share
          </div>
          <h1 style={{ margin: 0, fontSize: 'var(--lp-text-2xl)', fontWeight: 'var(--lp-weight-bold)', color: 'var(--lp-text)' }}>
            Send &amp; export
          </h1>
        </div>
        <a
          href={`/api/advance-packets/${tourId}/${routingId}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="btn-transition btn-primary-press inline-flex items-center gap-2 rounded-lg px-4 py-2.5"
          style={{
            fontSize: 'var(--lp-text-sm)',
            fontWeight: 'var(--lp-weight-semibold)',
            color: 'var(--lp-text-inverse, #fff)',
            background: 'var(--color-lp-orange)',
          }}
        >
          <Download size={16} />
          Export advance
        </a>
      </header>

      {/* VIS-AS-02 — intake link card */}
      <Card>
        <CardTitle icon={<Send size={15} />} title="Venue intake link" />
        <p style={{ margin: 0, fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>
          Generate a link the venue fills in.{' '}
          <span className="lp-mono" style={{ color: 'var(--lp-text)' }}>{fillableTotal}</span>{' '}
          field{fillableTotal === 1 ? '' : 's'} are venue-fillable. Set an expiry
          (preset: the day before the show) and an optional passphrase in the
          dialog; Copy to send, Revoke to kill an old link.
        </p>
        <p
          style={{
            margin: 0,
            fontSize: 'var(--lp-text-2xs)',
            color: 'var(--lp-text-tertiary)',
            padding: 'var(--lp-space-2) var(--lp-space-3)',
            borderRadius: 'var(--lp-radius-md)',
            background: 'color-mix(in srgb, var(--color-lp-orange) 5%, transparent)',
            border: '1px solid var(--lp-border-subtle)',
          }}
        >
          Never-clobber: a venue&apos;s answer only overwrites a field it actually
          filled in — a blank submission never wipes a value you entered.
        </p>
        <div>
          <SendPacketButton tourId={tourId} routingId={routingId} />
        </div>
      </Card>

      {/* VIS-AS-01 — venue-view preview */}
      <Card>
        <CardTitle
          icon={<Eye size={15} />}
          title="What the venue sees"
          note={tmOnlyCount > 0 ? `${tmOnlyCount} TM-only section${tmOnlyCount === 1 ? '' : 's'} hidden` : undefined}
        />
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} className="flex flex-col">
          {sections.length === 0 ? (
            <li style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-tertiary)', fontStyle: 'italic' }}>
              No sections yet — build the advance first.
            </li>
          ) : (
            sections.map((s) => (
              <li
                key={s.templateId}
                className="flex items-center gap-3"
                style={{
                  padding: 'var(--lp-space-2) 0',
                  borderTop: '1px solid var(--lp-border-subtle)',
                  opacity: s.tmOnly ? 0.5 : 1,
                }}
              >
                <span aria-hidden style={{ color: 'var(--lp-text-tertiary)', flexShrink: 0 }}>
                  {s.tmOnly ? <EyeOff size={15} /> : <Eye size={15} />}
                </span>
                <span className="min-w-0 flex-1 truncate" style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)' }}>
                  {s.label}
                </span>
                <span className="shrink-0 lp-mono" style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>
                  {s.tmOnly
                    ? 'hidden from venue'
                    : `${s.venueFillable}/${s.totalFields} fillable`}
                </span>
              </li>
            ))
          )}
        </ul>
      </Card>

      {/* VIS-AS-03 — packet builder + custom attachments (link to existing) */}
      <Card>
        <CardTitle icon={<FileText size={15} />} title="Advance packet" />
        <p style={{ margin: 0, fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>
          Assemble the packet (sections, attachments, page counts) and export one
          show or the whole run.
        </p>
        <Link
          href={`/advance/${tourId}/${routingId}/packet`}
          className="btn-transition inline-flex w-fit items-center gap-2 rounded-lg border px-3.5 py-2"
          style={{
            fontSize: 'var(--lp-text-sm)',
            fontWeight: 'var(--lp-weight-medium)',
            color: 'var(--lp-text)',
            borderColor: 'var(--lp-border-strong)',
            background: 'transparent',
            textDecoration: 'none',
          }}
        >
          Open packet builder
        </Link>
      </Card>

      {/* VIS-AS-05 — activity log */}
      <Card>
        <CardTitle title="Activity" />
        <div style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-tertiary)', fontStyle: 'italic' }}>
          No activity yet — opens, submissions and downloads will appear here with
          their timestamps.
        </div>
      </Card>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="flex flex-col rounded-xl border"
      style={{
        gap: 'var(--lp-space-3)',
        padding: 'var(--lp-space-4)',
        borderColor: 'var(--lp-border-strong)',
        background: 'var(--lp-surface)',
      }}
    >
      {children}
    </section>
  );
}

function CardTitle({
  icon,
  title,
  note,
}: {
  icon?: React.ReactNode;
  title: string;
  note?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {icon ? <span aria-hidden style={{ color: 'var(--color-lp-orange)' }}>{icon}</span> : null}
        <span style={{ fontSize: 'var(--lp-text-base)', fontWeight: 'var(--lp-weight-semibold)', color: 'var(--lp-text)' }}>
          {title}
        </span>
      </div>
      {note ? (
        <span className="lp-label-caps" style={{ color: 'var(--lp-text-tertiary)' }}>
          {note}
        </span>
      ) : null}
    </div>
  );
}

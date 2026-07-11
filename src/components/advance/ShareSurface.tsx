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
import { CheckCircle2, Download, Eye, EyeOff, FileText, MailOpen, Send } from 'lucide-react';
import { SendPacketButton } from './SendPacketButton';

export interface ShareSectionView {
  templateId: string;
  label: string;
  tmOnly: boolean;
  totalFields: number;
  venueFillable: number;
}

/** VIS-AS-05 — a real activity event, sourced from the intake link's persisted
 *  timestamps (opened = last_viewed_at, submitted = submitted_at). Downloads
 *  are not tracked yet (no events table) — surfaced as a flagged note, never
 *  fabricated. */
export interface ShareActivityEvent {
  kind: 'opened' | 'submitted';
  at: string;
  who?: string | null;
}

export function ShareSurface({
  tourId,
  routingId,
  sections,
  fillableTotal,
  activity = [],
}: {
  tourId: string;
  routingId: string;
  sections: ShareSectionView[];
  fillableTotal: number;
  activity?: ShareActivityEvent[];
}) {
  const tmOnlyCount = sections.filter((s) => s.tmOnly).length;
  // VIS-AS-03 — honest gaps + counts, all derived from the sections already
  // passed in (no new data). "Gaps" = venue-visible sections with nothing for
  // the venue to fill in yet; "empty" = sections with no fields at all.
  const venueSections = sections.filter((s) => !s.tmOnly);
  const emptyForVenueCount = venueSections.filter((s) => s.venueFillable === 0).length;
  const emptySectionCount = sections.filter((s) => s.totalFields === 0).length;
  const totalFields = sections.reduce((n, s) => n + s.totalFields, 0);

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
        {/* VIS-AS-03 — honest gaps: name what the venue will see as blank so
            it's not a surprise on their end. Silent when there's nothing to flag. */}
        {emptyForVenueCount > 0 ? (
          <p
            className="lp-mono"
            style={{
              margin: 0,
              fontSize: 'var(--lp-text-2xs)',
              color: 'var(--lp-text-tertiary)',
            }}
          >
            {emptyForVenueCount} venue-visible section
            {emptyForVenueCount === 1 ? '' : 's'} have nothing to fill in yet
            {emptySectionCount > 0 ? ` (${emptySectionCount} with no fields)` : ''}.
          </p>
        ) : null}
      </Card>

      {/* VIS-AS-03 — packet builder + custom attachments (link to existing) */}
      <Card>
        <CardTitle
          icon={<FileText size={15} />}
          title="Advance packet"
          note={`${sections.length} section${sections.length === 1 ? '' : 's'} · ${totalFields} field${totalFields === 1 ? '' : 's'}`}
        />
        <p style={{ margin: 0, fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>
          Bundle this show&apos;s riders, channel lists and hire jobs into one PDF,
          or export the whole run. Page counts are shown per document in the
          builder.
        </p>
        <p
          style={{
            margin: 0,
            fontSize: 'var(--lp-text-2xs)',
            color: 'var(--lp-text-tertiary)',
            fontStyle: 'italic',
          }}
        >
          Custom attachments (logos, financials, ad-hoc hire lists) aren&apos;t
          supported yet — only linked riders, channel lists and hire jobs bundle in.
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

      {/* VIS-AS-05 — activity log (opened / submitted from the intake link;
          downloads flagged as not-yet-tracked). */}
      <Card>
        <CardTitle title="Activity" />
        {activity.length === 0 ? (
          <div style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-tertiary)', fontStyle: 'italic' }}>
            No activity yet — when the venue opens or submits the intake link it
            appears here with a timestamp.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} className="flex flex-col">
            {activity.map((e, i) => (
              <li
                key={`${e.kind}-${e.at}-${i}`}
                className="flex items-center gap-3"
                style={{
                  padding: 'var(--lp-space-2) 0',
                  borderTop: i === 0 ? 'none' : '1px solid var(--lp-border-subtle)',
                }}
              >
                <span aria-hidden style={{ color: e.kind === 'submitted' ? 'var(--color-lp-status-complete)' : 'var(--lp-text-tertiary)', flexShrink: 0 }}>
                  {e.kind === 'submitted' ? <CheckCircle2 size={15} /> : <MailOpen size={15} />}
                </span>
                <span className="min-w-0 flex-1" style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)' }}>
                  {e.kind === 'submitted' ? 'Venue submitted' : 'Venue opened the link'}
                  {e.who ? <span style={{ color: 'var(--lp-text-tertiary)' }}> · {e.who}</span> : null}
                </span>
                <time
                  dateTime={e.at}
                  className="shrink-0 lp-mono"
                  style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}
                >
                  {formatActivityAt(e.at)}
                </time>
              </li>
            ))}
          </ul>
        )}
        <p style={{ margin: 0, fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)', fontStyle: 'italic' }}>
          Packet downloads aren&apos;t tracked yet.
        </p>
      </Card>
    </div>
  );
}

function formatActivityAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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

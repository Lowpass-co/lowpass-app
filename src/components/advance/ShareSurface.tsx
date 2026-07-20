'use client';

/* ============================================================
   LOWPASS — <ShareSurface> (V1-1 · venue packet reshape)

   Adam's ruling: "Nobody wants to click round an app, they want a PDF of each
   thing and then somewhere to enter their information." So the Share surface now
   LEADS with a downloadable PDF per artifact (rider(s), stage plot, channel list,
   day sheet) + ONE prominent no-signup intake link. The venue-view preview +
   activity log remain, below, as secondary context — the portal is the wrapper,
   the PDFs are the experience.

   Every artifact PDF is an existing branded route (assembly, not new builders):
   riders GET /api/rider-packs/[id]/pdf; stage plot / channel list / day sheet
   POST the shell export routes with default config. One click = one download.
   ============================================================ */

import { CheckCircle2, Download, Eye, EyeOff, FileText, Layers, ListMusic, MailOpen, Send } from 'lucide-react';
import { useState } from 'react';
import { SendPacketButton } from './SendPacketButton';

export interface ShareSectionView {
  templateId: string;
  label: string;
  tmOnly: boolean;
  totalFields: number;
  venueFillable: number;
}

export interface ShareActivityEvent {
  kind: 'opened' | 'submitted';
  at: string;
  who?: string | null;
}

/** One downloadable artifact on the packet. `method` picks the download path:
 *  GET routes (rider packs) open directly; POST routes (shell exports) fetch with
 *  a default config and stream the blob. */
export interface PacketArtifact {
  key: string;
  kind: 'rider' | 'stage_plot' | 'channel_list' | 'daysheet';
  title: string;
  href: string;
  method: 'GET' | 'POST';
  /** V1-3 — link to the ONE canonical rider_packs record (rider / stage plot). */
  editHref?: string;
}

const KIND_ICON: Record<PacketArtifact['kind'], React.ReactNode> = {
  rider: <FileText size={18} />,
  stage_plot: <Layers size={18} />,
  channel_list: <ListMusic size={18} />,
  daysheet: <FileText size={18} />,
};
const KIND_LABEL: Record<PacketArtifact['kind'], string> = {
  rider: 'Rider',
  stage_plot: 'Stage plot',
  channel_list: 'Channel list',
  daysheet: 'Day sheet',
};

export function ShareSurface({
  tourId,
  routingId,
  artist,
  tourName,
  show,
  artifacts,
  sections,
  fillableTotal,
  activity = [],
}: {
  tourId: string;
  routingId: string;
  artist: { name: string | null; imageUrl: string | null };
  tourName: string | null;
  show: { date: string | null; venue: string | null; city: string | null };
  artifacts: PacketArtifact[];
  sections: ShareSectionView[];
  fillableTotal: number;
  activity?: ShareActivityEvent[];
}) {
  const tmOnlyCount = sections.filter((s) => s.tmOnly).length;
  const venueSections = sections.filter((s) => !s.tmOnly);
  const emptyForVenueCount = venueSections.filter((s) => s.venueFillable === 0).length;
  const emptySectionCount = sections.filter((s) => s.totalFields === 0).length;

  const showLine = [fmtShowDate(show.date), show.venue, show.city].filter(Boolean).join(' · ');

  return (
    <div
      className="lp-view-tier mx-auto w-full"
      style={{ maxWidth: 980, padding: 'var(--lp-space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--lp-space-5)' }}
    >
      {/* Artwork + condensed-title header — the business card */}
      <header className="flex items-center gap-4">
        <ArtworkBadge name={artist.name} imageUrl={artist.imageUrl} />
        <div className="min-w-0">
          <div className="lp-label-caps" style={{ color: 'var(--lp-text-tertiary)' }}>Venue packet</div>
          <h1 className="lp-page-title" style={{ margin: '2px 0 0', fontSize: 'var(--lp-text-3xl, 30px)', color: 'var(--lp-text)' }}>
            {artist.name ?? 'Advance'}
          </h1>
          <div style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>
            {[tourName, showLine].filter(Boolean).join(' — ')}
          </div>
        </div>
      </header>

      {/* LEAD — one PDF per artifact */}
      <section
        className="flex flex-col rounded-xl border"
        style={{ gap: 'var(--lp-space-4)', padding: 'var(--lp-space-4)', borderColor: 'var(--lp-border-strong)', background: 'var(--lp-surface)' }}
      >
        <CardTitle icon={<Download size={15} />} title="Download the packet" note={`${artifacts.length} document${artifacts.length === 1 ? '' : 's'}`} />
        <p style={{ margin: 0, fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>
          A branded PDF for each thing the venue needs. One click, send whichever you like.
        </p>
        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--lp-space-3)' }}
        >
          {artifacts.map((a) => (
            <PdfCard key={a.key} artifact={a} />
          ))}
        </div>
      </section>

      {/* Prominent intake CTA — our no-signup feature, front and center */}
      <section
        className="flex flex-col rounded-xl border"
        style={{
          gap: 'var(--lp-space-3)',
          padding: 'var(--lp-space-4)',
          borderColor: 'var(--color-lp-orange)',
          background: 'color-mix(in srgb, var(--color-lp-orange) 5%, var(--lp-surface))',
        }}
      >
        <CardTitle icon={<Send size={15} />} title="…and one link for what we need back" />
        <p style={{ margin: 0, fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>
          <span className="lp-mono" style={{ color: 'var(--lp-text)' }}>{fillableTotal}</span>{' '}
          field{fillableTotal === 1 ? '' : 's'} for the venue to fill in — no account, no login. Set an expiry and an
          optional passphrase; Copy to send, Revoke to kill an old link.
        </p>
        <p
          style={{
            margin: 0, fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)',
            padding: 'var(--lp-space-2) var(--lp-space-3)', borderRadius: 'var(--lp-radius-md)',
            background: 'var(--lp-surface)', border: '1px solid var(--lp-border-subtle)',
          }}
        >
          Never-clobber: a venue&apos;s answer only overwrites a field it actually filled in — a blank submission never
          wipes a value you entered.
        </p>
        <div>
          <SendPacketButton tourId={tourId} routingId={routingId} />
        </div>
      </section>

      {/* Secondary — the portal preview (what the venue sees) */}
      <Card>
        <CardTitle
          icon={<Eye size={15} />}
          title="What the venue sees online"
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
                style={{ padding: 'var(--lp-space-2) 0', borderTop: '1px solid var(--lp-border-subtle)', opacity: s.tmOnly ? 0.5 : 1 }}
              >
                <span aria-hidden style={{ color: 'var(--lp-text-tertiary)', flexShrink: 0 }}>
                  {s.tmOnly ? <EyeOff size={15} /> : <Eye size={15} />}
                </span>
                <span className="min-w-0 flex-1 truncate" style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)' }}>{s.label}</span>
                <span className="shrink-0 lp-mono" style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>
                  {s.tmOnly ? 'hidden from venue' : `${s.venueFillable}/${s.totalFields} fillable`}
                </span>
              </li>
            ))
          )}
        </ul>
        {emptyForVenueCount > 0 ? (
          <p className="lp-mono" style={{ margin: 0, fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>
            {emptyForVenueCount} venue-visible section{emptyForVenueCount === 1 ? '' : 's'} have nothing to fill in yet
            {emptySectionCount > 0 ? ` (${emptySectionCount} with no fields)` : ''}.
          </p>
        ) : null}
        <div>
          <a
            href={`/advance/${tourId}/${routingId}/packet`}
            className="btn-transition inline-flex w-fit items-center gap-2 rounded-lg border px-3 py-1.5"
            style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)', borderColor: 'var(--lp-border-strong)', textDecoration: 'none' }}
          >
            Open packet builder
          </a>
        </div>
      </Card>

      {/* Secondary — activity */}
      <Card>
        <CardTitle title="Activity" />
        {activity.length === 0 ? (
          <div style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-tertiary)', fontStyle: 'italic' }}>
            No activity yet — when the venue opens or submits the intake link it appears here with a timestamp.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} className="flex flex-col">
            {activity.map((e, i) => (
              <li
                key={`${e.kind}-${e.at}-${i}`}
                className="flex items-center gap-3"
                style={{ padding: 'var(--lp-space-2) 0', borderTop: i === 0 ? 'none' : '1px solid var(--lp-border-subtle)' }}
              >
                <span aria-hidden style={{ color: e.kind === 'submitted' ? 'var(--color-lp-status-complete)' : 'var(--lp-text-tertiary)', flexShrink: 0 }}>
                  {e.kind === 'submitted' ? <CheckCircle2 size={15} /> : <MailOpen size={15} />}
                </span>
                <span className="min-w-0 flex-1" style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)' }}>
                  {e.kind === 'submitted' ? 'Venue submitted' : 'Venue opened the link'}
                  {e.who ? <span style={{ color: 'var(--lp-text-tertiary)' }}> · {e.who}</span> : null}
                </span>
                <time dateTime={e.at} className="shrink-0 lp-mono" style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>
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

/** One-click download card. GET → open the branded PDF directly; POST → fetch the
 *  shell route with a default config and stream the blob. */
function PdfCard({ artifact }: { artifact: PacketArtifact }) {
  const [busy, setBusy] = useState(false);

  async function download() {
    if (artifact.method === 'GET') {
      window.open(artifact.href, '_blank', 'noopener');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(artifact.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(typeof j.error === 'string' ? j.error : `Couldn't build ${artifact.title}`);
        return;
      }
      const cd = res.headers.get('Content-Disposition') ?? '';
      const name = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/.exec(cd)?.[1] ?? `${artifact.title}.pdf`;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = decodeURIComponent(name);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    // A div (not a button) so the optional Edit link isn't nested inside a button.
    <div
      className="flex items-center gap-3 rounded-lg border p-3"
      style={{ borderColor: 'var(--lp-border-strong)', background: 'var(--lp-panel)' }}
    >
      <span
        aria-hidden
        className="flex shrink-0 items-center justify-center rounded-md"
        style={{ height: 40, width: 40, color: 'var(--color-lp-orange)', background: 'color-mix(in srgb, var(--color-lp-orange) 10%, transparent)' }}
      >
        {KIND_ICON[artifact.kind]}
      </span>
      <button
        type="button"
        onClick={() => void download()}
        disabled={busy}
        data-testid={`packet-pdf-${artifact.kind}`}
        className="btn-transition min-w-0 flex-1 text-left"
        style={{ border: 0, background: 'transparent', cursor: busy ? 'wait' : 'pointer', padding: 0 }}
      >
        <span className="block truncate" style={{ fontSize: 'var(--lp-text-sm)', fontWeight: 'var(--lp-weight-semibold)', color: 'var(--lp-text)' }}>
          {artifact.title}
        </span>
        <span className="lp-label-caps" style={{ fontSize: 9, color: 'var(--lp-text-tertiary)' }}>
          {busy ? 'Building…' : `PDF · ${KIND_LABEL[artifact.kind]}`}
        </span>
      </button>
      {artifact.editHref ? (
        <a
          href={artifact.editHref}
          data-testid={`packet-edit-${artifact.kind}`}
          className="lp-label-caps shrink-0"
          style={{ fontSize: 9, color: 'var(--lp-text-tertiary)', textDecoration: 'none' }}
          title="Edit the source (one canonical record)"
        >
          Edit
        </a>
      ) : null}
      <button
        type="button"
        onClick={() => void download()}
        disabled={busy}
        aria-label={`Download ${artifact.title}`}
        className="shrink-0"
        style={{ border: 0, background: 'transparent', cursor: busy ? 'wait' : 'pointer', color: 'var(--lp-text-tertiary)', padding: 0 }}
      >
        <Download size={16} />
      </button>
    </div>
  );
}

function ArtworkBadge({ name, imageUrl }: { name: string | null; imageUrl: string | null }) {
  if (imageUrl) {
    // Plain <img> (not next/image) — matches the app's avatar convention and
    // avoids the remote-host allowlist dependency for Spotify CDN images.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt={name ?? 'Artist'} className="shrink-0 rounded-xl object-cover" style={{ height: 64, width: 64, border: '1px solid var(--lp-border)' }} />;
  }
  const initials = (name ?? '?').split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-xl"
      style={{ height: 64, width: 64, background: 'var(--lp-surface-hover, var(--lp-surface))', border: '1px solid var(--lp-border)', color: 'var(--lp-text-secondary)', fontWeight: 'var(--lp-weight-bold)', fontSize: 20 }}
    >
      {initials}
    </span>
  );
}

function fmtShowDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function formatActivityAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="flex flex-col rounded-xl border"
      style={{ gap: 'var(--lp-space-3)', padding: 'var(--lp-space-4)', borderColor: 'var(--lp-border-strong)', background: 'var(--lp-surface)' }}
    >
      {children}
    </section>
  );
}

function CardTitle({ icon, title, note }: { icon?: React.ReactNode; title: string; note?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {icon ? <span aria-hidden style={{ color: 'var(--color-lp-orange)' }}>{icon}</span> : null}
        <span style={{ fontSize: 'var(--lp-text-base)', fontWeight: 'var(--lp-weight-semibold)', color: 'var(--lp-text)' }}>{title}</span>
      </div>
      {note ? <span className="lp-label-caps" style={{ color: 'var(--lp-text-tertiary)' }}>{note}</span> : null}
    </div>
  );
}

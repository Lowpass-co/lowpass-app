'use client';

/* ============================================
   LOWPASS — Riders: Publish, Send, Applies-to, Start-from, Save-as-template
   (rebuild, Nov 2026)
   ============================================ */

import { useMemo, useState } from 'react';
import { Copy, Mail } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { SlideOver } from '@/components/ui/SlideOver';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { blockLabel, dayBefore, fmtDay, inForce } from '@/lib/riders/blocks';
import { gmailUrl, mailtoUrl, notifyEmail } from '@/lib/riders/email';
import { STARTERS } from '@/lib/riders/starters';
import { changeLine, nextVersion, versionLabel } from '@/lib/riders/summary';
import { RIDER_KIND_LABEL, type RiderBlock, type RiderChange, type RiderKind } from '@/lib/riders/types';
import type { RiderShow } from '@/server/riders/data';
import { linkUrl, showLabel, showStatus } from './RiderPanels';
import type { RiderEditorStore } from './useRiderEditor';

/* ---------- Publish ---------- */

export function PublishDialog({
  open,
  onClose,
  store,
  changes,
  onPublished,
}: {
  open: boolean;
  onClose: () => void;
  store: RiderEditorStore;
  changes: RiderChange[];
  onPublished: (affected: string[], label: string) => void;
}) {
  const { showToast } = useToast();
  const latest = store.data.latest;
  const prev = latest ? { major: latest.major, minor: latest.minor } : null;
  const [bump, setBump] = useState<'minor' | 'major'>('minor');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const label = versionLabel(nextVersion(prev, bump));
  const publish = async () => {
    setBusy(true);
    try {
      const out = await store.action<{ version: { label: string }; affected: string[] }>({ action: 'publish', bump, note }, { reloadOthers: true });
      setNote('');
      onClose();
      onPublished(out.affected, out.version.label);
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Publish version ${label}`}
      subtitle="Promoters see published versions only. This one is dated today and can’t be changed afterwards."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void publish()} disabled={busy}>
            {busy ? 'Publishing…' : `Publish ${label}`}
          </Button>
        </>
      }
    >
      <div className="rdx-stack">
        {prev ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--lp-space-2)' }}>
            <label className="rdx-radio" data-on={bump === 'minor'}>
              <input type="radio" name="bump" checked={bump === 'minor'} onChange={() => setBump('minor')} />
              <span>
                <b>{versionLabel(nextVersion(prev, 'minor'))}</b> — an update
                <br />
                <span className="rdx-mini">Items, counts, wording</span>
              </span>
            </label>
            <label className="rdx-radio" data-on={bump === 'major'}>
              <input type="radio" name="bump" checked={bump === 'major'} onChange={() => setBump('major')} />
              <span>
                <b>{versionLabel(nextVersion(prev, 'major'))}</b> — a new rider
                <br />
                <span className="rdx-mini">A new leg, a new production</span>
              </span>
            </label>
          </div>
        ) : null}
        <label className="rdx-field">
          In a line, for promoters (optional)
          <textarea rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. We switch to a DiGiCo from 14 Dec; hospitality trimmed." />
        </label>
        <div>
          <div className="rdx-mini" style={{ marginBottom: 'var(--lp-space-1)' }}>
            {prev ? (changes.length ? `${changes.length} ${changes.length === 1 ? 'change' : 'changes'} since ${latest!.label}` : 'Layout and formatting changes only') : 'The first version — everything goes out as it reads.'}
          </div>
          {changes.length ? (
            <ul className="rdx-changes-list">
              {changes.map((c, i) => (
                <li key={i}>{changeLine(c)}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Send (Notify) ---------- */

interface Draft {
  name: string;
  email: string;
}

/** The changes a show hasn't been sent: every version after the one it
 *  last got, only lines that apply on its date. */
function changesFor(store: RiderEditorStore, show: RiderShow, sentVersionId: string | null): { changes: RiderChange[]; first: boolean } {
  const versions = store.data.versions; // newest first
  if (!sentVersionId) return { changes: [], first: true };
  const idx = versions.findIndex((v) => v.id === sentVersionId);
  const newer = idx < 0 ? versions.slice(0, 1) : versions.slice(0, idx);
  const all = newer.reverse().flatMap((v) => v.changes);
  return { changes: all.filter((c) => !(c.from || c.until) || inForce({ from: c.from ?? null, until: c.until ?? null }, show.date)), first: false };
}

export function SendPanel({ open, onClose, store, only, me }: { open: boolean; onClose: () => void; store: RiderEditorStore; only: string[] | null; me: { name: string } }) {
  const { showToast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const latest = store.data.versions[0] ?? null;
  const [showAll, setShowAll] = useState(false);
  const shows = useMemo(() => {
    const all = store.data.shows;
    if (only && !showAll) return all.filter((s) => only.includes(s.routingId));
    return all.filter((s) => showAll || s.date >= today);
  }, [store.data.shows, only, showAll, today]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const draftFor = (s: RiderShow): Draft => {
    if (drafts[s.routingId]) return drafts[s.routingId];
    const link = store.data.links.find((l) => l.routingId === s.routingId);
    const adv = store.data.advanceRecipients[s.routingId];
    return { name: link?.recipientName ?? adv?.name ?? '', email: link?.recipientEmail ?? adv?.email ?? '' };
  };
  const tourLink = store.data.links.find((l) => l.routingId === null) ?? null;

  const send = async (s: RiderShow, how: 'gmail' | 'mail' | 'copy') => {
    if (!latest) return;
    setBusy(s.routingId);
    try {
      const d = draftFor(s);
      const st = showStatus(store, s);
      let link = st.link;
      if (!link) {
        const out = await store.api.action<{ links: { id: string; token: string; routingId: string | null }[] }>({ action: 'links', routingIds: [s.routingId] });
        link = (out.links.find((l) => l.routingId === s.routingId) as unknown as typeof link) ?? null;
      }
      if (!link) throw new Error('Couldn’t make the link');
      const sentVersion = store.data.sends.find((x) => x.linkId === link!.id)?.versionId ?? null;
      const { changes, first } = changesFor(store, s, sentVersion);
      const mail = notifyEmail({
        artist: store.data.tour.artistName,
        version: latest.label,
        publishedAt: latest.publishedAt,
        venue: s.venue,
        city: s.city,
        date: s.date,
        link: linkUrl(link.token),
        changes,
        note: latest.note,
        recipientName: d.name || null,
        senderName: me.name,
        first,
      });
      if (how === 'copy') await navigator.clipboard.writeText(`${mail.subject}\n\n${mail.body}`);
      else window.open(how === 'gmail' ? gmailUrl(d.email, mail.subject, mail.body) : mailtoUrl(d.email, mail.subject, mail.body), '_blank', 'noopener');
      await store.action({ action: 'sends', sends: [{ linkId: link.id, versionId: latest.id, email: d.email, name: d.name }] });
      showToast(how === 'copy' ? `Email copied — marked as sent v${latest.label}` : `Marked as sent v${latest.label}`);
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const copyTour = async () => {
    try {
      let token = tourLink?.token;
      if (!token) token = (await store.action<{ links: { token: string }[] }>({ action: 'links', routingIds: [null] })).links[0]?.token;
      if (token) {
        await navigator.clipboard.writeText(linkUrl(token));
        showToast('Tour link copied');
      }
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  };

  return (
    <SlideOver open={open} onClose={onClose} title={latest ? `Send version ${latest.label}` : 'Send the rider'} subtitle="Lowpass writes the email; you send it from your own inbox." width="wide">
      {!latest ? (
        <div className="rdx-side-empty">Publish the rider first — promoters only ever see a published version.</div>
      ) : (
        <div className="rdx-stack">
          <div className="rdx-banner">
            <span className="grow">
              <b>Whole-tour link</b> — every show’s dates tagged; for agents and management.
            </span>
            <button type="button" className="rdx-chip" onClick={() => void copyTour()}>
              <Copy size={13} aria-hidden /> Copy
            </button>
          </div>
          <div>
            {shows.map((s) => {
              const d = draftFor(s);
              const st = showStatus(store, s);
              return (
                <div key={s.routingId} className="rdx-send">
                  <span className="rdx-pill" data-tone={st.sentCurrent ? 'good' : st.sentLabel ? 'warn' : undefined}>
                    {st.sentCurrent ? `Has v${latest.label}` : st.sentLabel ? `Has v${st.sentLabel}` : 'Not sent'}
                  </span>
                  <div className="rdx-stack" style={{ gap: 'var(--lp-space-2)' }}>
                    <b style={{ fontSize: 'var(--lp-text-sm)' }}>{showLabel(s)}</b>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 'var(--lp-space-2)' }}>
                      <input type="text" value={d.name} placeholder="Name" aria-label={`Name for ${showLabel(s)}`} onChange={(e) => setDrafts((x) => ({ ...x, [s.routingId]: { ...d, name: e.target.value } }))} />
                      <input type="email" value={d.email} placeholder="promoter@venue.com" aria-label={`Email for ${showLabel(s)}`} onChange={(e) => setDrafts((x) => ({ ...x, [s.routingId]: { ...d, email: e.target.value } }))} />
                    </div>
                  </div>
                  <div className="rdx-send-actions">
                    <button type="button" className="rdx-chip" disabled={busy === s.routingId} onClick={() => void send(s, 'gmail')}>
                      <Mail size={13} aria-hidden /> Gmail
                    </button>
                    <button type="button" className="rdx-chip" disabled={busy === s.routingId} onClick={() => void send(s, 'mail')}>
                      <Mail size={13} aria-hidden /> Mail app
                    </button>
                    <button type="button" className="rdx-chip" disabled={busy === s.routingId} onClick={() => void send(s, 'copy')}>
                      <Copy size={13} aria-hidden /> Copy email
                    </button>
                  </div>
                </div>
              );
            })}
            {!shows.length ? <div className="rdx-side-empty">No upcoming shows.</div> : null}
          </div>
          <button type="button" className="rdx-link" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Only upcoming / the shows this version changes' : 'Show every show (past ones too)'}
          </button>
        </div>
      )}
    </SlideOver>
  );
}

/* ---------- Applies to / Change from a show ---------- */

export function DatesDialog({
  open,
  onClose,
  block,
  mode,
  store,
}: {
  open: boolean;
  onClose: () => void;
  block: RiderBlock | null;
  mode: 'set' | 'change';
  store: RiderEditorStore;
}) {
  const [from, setFrom] = useState(block?.from ?? '');
  const [until, setUntil] = useState(block?.until ?? '');
  const [showId, setShowId] = useState('');
  const shows = store.data.shows;
  if (!block) return null;
  const label = blockLabel(block, store.party);
  const apply = () => {
    if (mode === 'set') {
      store.edit(block.id, { from: from || null, until: until || null });
    } else {
      const s = shows.find((x) => x.routingId === showId);
      if (!s) return;
      const end = dayBefore(s.date);
      store.edit(block.id, { until: block.from && end < block.from ? block.from : end });
      store.insertAfter(block.riderId, block.id, block.kind, JSON.parse(JSON.stringify(block.content)), { from: s.date, until: block.until });
    }
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'set' ? 'Which shows does this apply to?' : 'Change it from a show'}
      subtitle={label}
      size="md"
      footer={
        <>
          {mode === 'set' && (block.from || block.until) ? (
            <Button
              variant="ghost"
              onClick={() => {
                store.edit(block.id, { from: null, until: null });
                onClose();
              }}
            >
              Every show
            </Button>
          ) : null}
          <Button variant="primary" onClick={apply} disabled={mode === 'change' && !showId}>
            {mode === 'set' ? 'Save' : 'Make the change'}
          </Button>
        </>
      }
    >
      {mode === 'set' ? (
        <div className="rdx-stack">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--lp-space-3)' }}>
            <label className="rdx-field">
              From
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="rdx-field">
              Until
              <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
            </label>
          </div>
          {shows.length ? (
            <label className="rdx-field">
              Or just one show
              <select
                value=""
                onChange={(e) => {
                  const s = shows.find((x) => x.routingId === e.target.value);
                  if (s) {
                    setFrom(s.date);
                    setUntil(s.date);
                  }
                }}
              >
                <option value="">Pick a show…</option>
                {shows.map((s) => (
                  <option key={s.routingId} value={s.routingId}>
                    {showLabel(s)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <span className="rdx-mini">Leave both empty for every show. Promoters see only what applies on their date.</span>
        </div>
      ) : (
        <div className="rdx-stack">
          <label className="rdx-field">
            From which show?
            <select value={showId} onChange={(e) => setShowId(e.target.value)}>
              <option value="">Pick a show…</option>
              {shows.map((s) => (
                <option key={s.routingId} value={s.routingId}>
                  {showLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <span className="rdx-mini">
            {showId
              ? `This line stops on ${fmtDay(dayBefore(shows.find((s) => s.routingId === showId)!.date))}; a copy starts on ${fmtDay(shows.find((s) => s.routingId === showId)!.date)} for you to edit.`
              : 'The line as it is now ends the day before; a copy starts on that show for you to change.'}
          </span>
        </div>
      )}
    </Modal>
  );
}

/* ---------- Start from ---------- */

export interface OtherRider {
  id: string;
  kind: RiderKind;
  title: string;
  tourName: string;
}

export function StartPanel({
  kind,
  store,
  otherRiders,
  replace,
  onDone,
  onCancel,
}: {
  kind: RiderKind;
  store: RiderEditorStore;
  otherRiders: OtherRider[];
  replace: boolean;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const start = async (source: Record<string, unknown>) => {
    if (replace && !window.confirm(`Replace everything in the ${RIDER_KIND_LABEL[kind]} rider? (Published versions stay as they are.)`)) return;
    setBusy(true);
    try {
      await store.action({ action: 'start', kind, source, replace }, { reloadOthers: true });
      onDone();
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const starters = STARTERS.filter((s) => s.kind === kind);
  const templates = store.data.templates.filter((t) => t.kind === kind);
  const others = otherRiders.filter((r) => r.kind === kind);
  return (
    <div className="rdx-stack" style={{ maxWidth: 860, margin: '0 auto', opacity: busy ? 0.6 : 1 }}>
      <div className="rdx-side-h" style={{ padding: 0 }}>
        Start the {RIDER_KIND_LABEL[kind].toLowerCase()} rider from
      </div>
      <div className="rdx-start">
        {starters.map((s) => (
          <button key={s.id} type="button" className="rdx-card" disabled={busy} onClick={() => void start({ starter: s.id })}>
            <b>{s.name}</b>
            <span>{s.blurb}</span>
          </button>
        ))}
        {templates.map((t) => (
          <button key={t.id} type="button" className="rdx-card" disabled={busy} onClick={() => void start({ template: t.id })}>
            <b>{t.name}</b>
            <span>Your template</span>
          </button>
        ))}
        <button type="button" className="rdx-card" disabled={busy} onClick={() => void start({ blank: true })}>
          <b>A blank page</b>
          <span>Write it from scratch.</span>
        </button>
      </div>
      {others.length ? (
        <label className="rdx-field" style={{ maxWidth: 420 }}>
          Or copy another tour’s rider
          <select value="" disabled={busy} onChange={(e) => e.target.value && void start({ rider: e.target.value })}>
            <option value="">Pick a rider…</option>
            {others.map((r) => (
              <option key={r.id} value={r.id}>
                {r.tourName} — {r.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {onCancel ? (
        <button type="button" className="rdx-link" onClick={onCancel} style={{ alignSelf: 'flex-start' }}>
          Cancel
        </button>
      ) : null}
    </div>
  );
}

/* ---------- Save as template ---------- */

export function TemplateDialog({ open, onClose, store, riderId, defaultName }: { open: boolean; onClose: () => void; store: RiderEditorStore; riderId: string | null; defaultName: string }) {
  const { showToast } = useToast();
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!riderId || !name.trim()) return;
    setBusy(true);
    try {
      await store.action({ action: 'template', riderId, name });
      showToast('Saved as a template — it’s in “Start from…” on every tour');
      onClose();
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Save as a template"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy || !name.trim()}>
            Save template
          </Button>
        </>
      }
    >
      <label className="rdx-field">
        Name
        <input autoFocus value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
      </label>
    </Modal>
  );
}

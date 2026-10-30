'use client';

/* ============================================
   <RequestFlow> — Request from venue (Oct 2026 rebuild).

   Lowpass writes the email and makes a link unique to the show; YOU send it
   from your own inbox (Open in Gmail / your mail app / Copy), so replies
   land with you and it doesn't read like an app email. The link tells
   Lowpass when it's opened and answered; answers wait for your review.
   Several shows step through one after another ("1 of 5"). The link is only
   made when you act, so opening this and closing it leaves nothing behind.
   ============================================ */

import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, Lock, Mail, Printer } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { ExportTemplateEditor } from '@/components/export/ExportTemplateEditor';
import { useToast } from '@/components/ui/Toast';
import { makeRequest, markSent } from './api';
import { fmtDay, fmtLong } from './format';
import './advance.css';

interface ShowLite {
  routingId: string;
  date: string;
  venue: string | null;
  city: string | null;
}
interface RequestInfo {
  show: { date: string; venue: string | null; city: string | null; artist: string | null };
  sections: { template_id: string; label: string; fields: { id: string; label: string; answered: boolean }[] }[];
  tmOnly: string[];
  recipient: { name: string; email: string };
}

function isoMinusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function RequestFlow({ tourId, routingIds, shows, onClose }: { tourId: string; routingIds: string[]; shows: ShowLite[]; onClose: () => void }) {
  const { showToast } = useToast();
  const [idx, setIdx] = useState(0);
  const routingId = routingIds[idx];
  const show = shows.find((s) => s.routingId === routingId);
  const [info, setInfo] = useState<RequestInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [due, setDue] = useState('');
  const [off, setOff] = useState<Set<string>>(new Set());
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [link, setLink] = useState<{ id: string; url: string; key: string } | null>(null);
  // The question sheet PDF (export dialog) for this request's link.
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setInfo(null);
    setErr(null);
    setLink(null);
    setOff(new Set());
    fetch(`/api/tours/${tourId}/advance/${routingId}/request`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? 'Couldn’t load this show');
        return j as RequestInfo;
      })
      .then((j) => {
        if (!live) return;
        setInfo(j);
        setName(j.recipient.name);
        setEmail(j.recipient.email);
        const today = new Date().toISOString().slice(0, 10);
        const twoWeeks = isoMinusDays(j.show.date, 14);
        setDue(twoWeeks > today ? twoWeeks : '');
        setOnlyMissing(j.sections.some((s) => s.fields.some((f) => f.answered)));
      })
      .catch((e: Error) => live && setErr(e.message));
    return () => {
      live = false;
    };
  }, [tourId, routingId]);

  const askFields = useMemo(() => {
    if (!info) return [] as string[];
    return info.sections
      .filter((s) => !off.has(s.template_id))
      .flatMap((s) => s.fields.filter((f) => !onlyMissing || !f.answered).map((f) => `${s.template_id}:${f.id}`));
  }, [info, off, onlyMissing]);
  const totalAskable = info?.sections.reduce((n, s) => n + s.fields.length, 0) ?? 0;
  const key = `${askFields.join(',')}|${name}|${email}`;

  const artist = info?.show.artist ?? 'Our';
  const venue = info?.show.venue ?? show?.venue ?? 'your venue';
  const subject = `${info?.show.artist ? `${info.show.artist} — ` : ''}${fmtDay(info?.show.date ?? show?.date)}, ${venue} — advance`;
  const body = (url: string) =>
    [
      `Hi ${name.trim() || 'there'},`,
      '',
      `${artist === 'Our' ? 'We’re' : `${artist} is`} at ${venue} on ${fmtLong(info?.show.date ?? show?.date)}. Could you fill in our advance${due ? ` by ${fmtLong(due)}` : ''}? It’s ${askFields.length} short ${askFields.length === 1 ? 'question' : 'questions'}${onlyMissing && askFields.length < totalAskable ? ' — just what we don’t have yet' : ''}.`,
      '',
      url,
      '',
      'If it’s easier, you can upload your tech pack on that page instead.',
      '',
      'Thanks,',
    ].join('\n');

  const ensureLink = async (): Promise<{ id: string; url: string } | null> => {
    if (link && link.key === key) return link;
    if (!askFields.length) {
      showToast('Pick at least one question', 'error');
      return null;
    }
    setBusy(true);
    try {
      const out = await makeRequest(tourId, routingId, {
        recipientName: name.trim() || undefined,
        recipientEmail: email.trim() || undefined,
        askFields: askFields.length === totalAskable ? null : askFields,
      });
      const l = { id: out.link.id, url: `${window.location.origin}${out.link.path}`, key };
      setLink(l);
      return l;
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Couldn’t make the link', 'error');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const sent = async (l: { id: string }, how: string) => {
    setDone((d) => new Set(d).add(routingId));
    setCopied(how);
    setTimeout(() => setCopied(null), 1600);
    try {
      await markSent(tourId, routingId, l.id);
    } catch {
      /* the link still works; only the "sent" date is missing */
    }
  };

  const gmail = async () => {
    const w = window.open('', '_blank'); // open now so the browser doesn't block it
    const l = await ensureLink();
    if (!l) {
      w?.close();
      return;
    }
    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body(l.url))}`;
    if (w) w.location.href = url;
    else window.open(url, '_blank');
    await sent(l, 'gmail');
  };
  const mailApp = async () => {
    const l = await ensureLink();
    if (!l) return;
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body(l.url))}`;
    await sent(l, 'mail');
  };
  const copyEmail = async () => {
    const l = await ensureLink();
    if (!l) return;
    await navigator.clipboard.writeText(`${subject}\n\n${body(l.url)}`);
    await sent(l, 'copy');
  };
  const copyLink = async () => {
    const l = await ensureLink();
    if (!l) return;
    await navigator.clipboard.writeText(l.url);
    await sent(l, 'link');
  };
  // A styled PDF of exactly the questions this request asks, with its link —
  // through the export dialog (templates, header, page size). Making the PDF
  // doesn't mark the request sent; sending it is still up to you.
  const printPdf = async () => {
    const l = await ensureLink();
    if (!l) return;
    setSheetFor(l.id);
  };

  const next = () => (idx < routingIds.length - 1 ? setIdx(idx + 1) : onClose());

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title="Request from venue"
      subtitle={`${fmtDay(show?.date)} · ${show?.venue ?? show?.city ?? 'Show'}${routingIds.length > 1 ? ` · ${idx + 1} of ${routingIds.length}` : ''}`}
      footer={
        routingIds.length > 1 ? (
          <div className="adv-row-flex" style={{ width: '100%' }}>
            <span className="adv-muted adv-grow" style={{ fontSize: 'var(--lp-text-xs)' }}>
              {done.size} of {routingIds.length} sent
            </span>
            <button type="button" className="adv-btn adv-btn-ghost" onClick={next}>{idx < routingIds.length - 1 ? 'Skip' : 'Finish'}</button>
            {idx < routingIds.length - 1 ? (
              <button type="button" className="adv-btn" onClick={next}>
                Next: {shows.find((s) => s.routingId === routingIds[idx + 1])?.venue ?? 'next show'} →
              </button>
            ) : null}
          </div>
        ) : (
          <button type="button" className="adv-btn" onClick={onClose}>Done</button>
        )
      }
    >
      {err ? <div className="adv-banner" style={{ fontSize: 'var(--lp-text-sm)' }}>{err}</div> : null}
      {!info && !err ? <div className="adv-muted" style={{ padding: 24, fontSize: 'var(--lp-text-sm)' }}>Loading…</div> : null}
      {info ? (
        <div key={routingId} className="adv-pane-enter" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 420px) minmax(0, 1fr)', gap: 22 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <label className="adv-label">To<input className="adv-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Production manager" /></label>
              <label className="adv-label">Email<input className="adv-field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@venue.com" /></label>
            </div>
            <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <legend className="adv-label" style={{ marginBottom: 6 }}>What they’ll answer</legend>
              {info.sections.length === 0 ? <span className="adv-muted" style={{ fontSize: 'var(--lp-text-sm)' }}>Nothing on this day a venue can answer yet.</span> : null}
              {info.sections.map((s) => {
                const n = s.fields.filter((f) => !onlyMissing || !f.answered).length;
                return (
                  <label key={s.template_id} className="adv-row-flex" style={{ gap: 10, minHeight: 32, fontSize: 'var(--lp-text-sm)', opacity: n ? 1 : 0.5 }}>
                    <input
                      type="checkbox"
                      style={{ accentColor: 'var(--lp-orange)', width: 15, height: 15 }}
                      checked={!off.has(s.template_id) && n > 0}
                      disabled={!n}
                      onChange={() => setOff((o) => { const x = new Set(o); if (x.has(s.template_id)) x.delete(s.template_id); else x.add(s.template_id); return x; })}
                    />
                    {s.label} <span className="adv-muted" style={{ fontSize: 'var(--lp-text-xs)' }}>{n}</span>
                  </label>
                );
              })}
              <label className="adv-row-flex" style={{ gap: 10, minHeight: 32, fontSize: 'var(--lp-text-sm)', marginTop: 6 }}>
                <input type="checkbox" style={{ accentColor: 'var(--lp-orange)', width: 15, height: 15 }} checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
                Only ask what we don’t have yet
              </label>
              {info.tmOnly.length ? (
                <span className="adv-row-flex adv-muted" style={{ gap: 8, fontSize: 'var(--lp-text-xs)', marginTop: 6 }}>
                  <Lock size={13} aria-hidden /> {info.tmOnly.join(', ')} {info.tmOnly.length === 1 ? 'is' : 'are'} yours only — never sent.
                </span>
              ) : null}
            </fieldset>
            <label className="adv-label">Answers by<input className="adv-field" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            <span className="adv-label">Your email — sent from your own inbox</span>
            <div style={{ border: '1px solid var(--lp-border)', borderRadius: 10, background: 'var(--lp-bg)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 'var(--lp-text-sm)', lineHeight: 1.55 }}>
              <div className="adv-row-flex" style={{ gap: 10, flexWrap: 'nowrap' }}>
                <span className="adv-muted" style={{ width: 56, flexShrink: 0 }}>Subject</span>
                <span>{subject}</span>
              </div>
              <div style={{ height: 1, background: 'var(--lp-border-light)' }} />
              <div style={{ whiteSpace: 'pre-line', color: 'var(--lp-text-secondary)' }}>{body(link?.url ?? 'lowpass.app/advance-intake/… (made when you send)')}</div>
            </div>
            <div className="adv-row-flex" style={{ gap: 8 }}>
              <button type="button" className="adv-btn adv-btn-primary" disabled={busy || !askFields.length} onClick={() => void gmail()}>
                {copied === 'gmail' ? <Check size={15} aria-hidden /> : <ExternalLink size={15} aria-hidden />} Open in Gmail
              </button>
              <button type="button" className="adv-btn" disabled={busy || !askFields.length} onClick={() => void mailApp()}>
                <Mail size={15} aria-hidden /> Mail app
              </button>
              <button type="button" className="adv-btn" disabled={busy || !askFields.length} onClick={() => void copyEmail()}>
                {copied === 'copy' ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />} {copied === 'copy' ? 'Copied' : 'Copy email'}
              </button>
              <button type="button" className="adv-btn" disabled={busy || !askFields.length} onClick={() => void printPdf()}>
                <Printer size={15} aria-hidden /> PDF of the questions
              </button>
              <button type="button" className="adv-btn adv-btn-ghost" disabled={busy || !askFields.length} onClick={() => void copyLink()}>
                {copied === 'link' ? 'Link copied' : 'Copy link only'}
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)', lineHeight: 1.5 }}>
              <span>✓ Replies land in your inbox, not in Lowpass.</span>
              <span>✓ The link is unique to this show — Lowpass sees when it’s opened and answered.</span>
              <span>✓ Answers wait for your review before they change anything.</span>
            </div>
            {done.has(routingId) ? (
              <div className="adv-banner adv-banner-info" style={{ fontSize: 'var(--lp-text-sm)' }}>
                Marked as sent. {routingIds.length > 1 && idx < routingIds.length - 1 ? 'On to the next show when you’re ready.' : ''}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {sheetFor ? (
        <ExportTemplateEditor
          surface="advance-questions"
          tourId={tourId}
          endpoint={`/api/tours/${tourId}/advance/${routingId}/export/questions`}
          extraBody={{ linkId: sheetFor }}
          onClose={() => setSheetFor(null)}
        />
      ) : null}
    </Modal>
  );
}

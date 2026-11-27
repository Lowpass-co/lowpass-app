'use client';

/* ============================================
   LOWPASS — <RiderPublic> — the promoter's live rider (rebuild, Nov 2026)

   Reads like the document it is (the same model + stylesheet as the PDF),
   with three things a PDF can't do: say which version you're reading and
   what changed, take "I've read it" with a name and date, and take a reply
   on any request line — which lands with the tour manager, who answers
   here and marks the line confirmed / substitute / cut for this show.
   ============================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ExternalLink, FileDown, MessageSquare, X } from 'lucide-react';
import { fmtDay } from '@/lib/riders/blocks';
import { linkHost } from '@/lib/riders/photos';
import { docModel, versionLine, type DocItem } from '@/lib/riders/render';
import { changeLine, changeReaches } from '@/lib/riders/summary';
import { RIDER_KIND_LABEL, type ResolvedAttachment, type RiderChange } from '@/lib/riders/types';
import type { PublicRider } from '@/server/riders/public';
import { RiderDocStyles, RiderDocView } from './RiderDocView';

type Msg = PublicRider['threads'][string][number];
type RequestItem = Extract<DocItem, { t: 'request' }>;

const remember = {
  /** Who acknowledged / replied last time on this browser — first visit: blanks. */
  get: (): { name: string; company: string } => {
    try {
      const v = JSON.parse(window.localStorage.getItem('lp-rider-me') ?? '{}') as { name?: unknown; company?: unknown } | null;
      return { name: typeof v?.name === 'string' ? v.name : '', company: typeof v?.company === 'string' ? v.company : '' };
    } catch {
      return { name: '', company: '' };
    }
  },
  set: (v: { name: string; company: string }) => {
    try {
      window.localStorage.setItem('lp-rider-me', JSON.stringify(v));
    } catch {
      /* private mode: fine */
    }
  },
};

class PostError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
  ) {
    super(message);
  }
}

async function post<T>(token: string, body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/public/riders/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new PostError('No connection — try again in a moment.', null);
  }
  const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string | null } & T;
  if (!res.ok) throw new PostError(j.error ?? 'Something went wrong — try again.', j.code ?? null);
  return j;
}

/** A newer version was published while the page was open: reading it is the fix. */
function ErrorLine({ err }: { err: PostError | null }) {
  if (!err) return null;
  return (
    <span className="rdp-err" role="alert">
      {err.message}
      {err.code === 'NEWER' || err.code === 'GONE' ? (
        <button type="button" className="rdp-link" onClick={() => window.location.reload()}>
          Load it
        </button>
      ) : null}
    </span>
  );
}

export function RiderPublic({ data, token }: { data: PublicRider; token: string }) {
  const version = data.versions[0];
  const snap = data.snapshot!;
  const [kind, setKind] = useState(snap.docs[0]?.kind ?? 'tech');
  const [history, setHistory] = useState(false);
  const [threads, setThreads] = useState(data.threads);
  const [acks, setAcks] = useState(data.acks);
  const [openLine, setOpenLine] = useState<string | null>(null);
  const showLine = data.show ? `For ${[data.show.venue, data.show.city].filter(Boolean).join(', ') || 'your show'} — ${fmtDay(data.show.date, true)}` : 'Every show on the tour';
  const header = { artist: data.artist, version: versionLine(version.label, version.publishedAt), show: showLine };
  const models = useMemo(
    () =>
      snap.docs.map((d) =>
        docModel(d, {
          date: data.show?.date ?? null,
          party: snap.party,
          docs: snap.docs,
          attachments: snap.attachments,
          states: data.states,
          embeds: snap.embeds,
          routingId: data.show?.routingId ?? null,
        }),
      ),
    [snap, data.show, data.states],
  );
  const [item, setItem] = useState<RequestItem | null>(null);
  const photoUrl = (path: string) => data.photos[path] ?? null;
  const model = models.find((m) => m.kind === kind) ?? models[0];
  const myAck = acks.find((a) => a.versionId === version.id) ?? null;
  const olderAck = !myAck ? acks[0] ?? null : null;
  // A show's link lists only what reaches that show (its dates, its own
  // input list / stage plot); the whole-tour link lists everything.
  const show = data.show;
  const reaches = useCallback((c: RiderChange) => !show || changeReaches(c, show, snap.embeds), [show, snap.embeds]);
  // Read an older version here before? Everything published since, newest first.
  const since = useMemo(() => {
    if (!olderAck) return [];
    const i = data.versions.findIndex((v) => v.id === olderAck.versionId);
    return (i < 0 ? data.versions.slice(0, 1) : data.versions.slice(0, i)).flatMap((v) => v.changes).filter(reaches);
  }, [olderAck, data.versions, reaches]);
  const fileHref = (a: ResolvedAttachment) => (a.id ? `/api/public/riders/${token}/file?kind=${a.kind}${a.kind === 'file' ? `&id=${a.id}` : ''}` : null);

  return (
    <main className="rdp-page">
      <RiderDocStyles />
      <div className="rdp-bar">
        <div className="rdp-bar-in">
          <div className="rdp-who">
            <span className="rdp-artist">{data.artist ?? data.tourName}</span>
            <span className="rdp-ver">
              Version {version.label} · {fmtDay(version.publishedAt.slice(0, 10), true)}
            </span>
          </div>
          <div className="rdp-actions">
            {data.versions.length > 1 || version.changes.length ? (
              <button type="button" className="rdp-btn" aria-expanded={history} onClick={() => setHistory((h) => !h)}>
                What changed <ChevronDown size={14} aria-hidden style={{ transform: history ? 'rotate(180deg)' : undefined }} />
              </button>
            ) : null}
            <a className="rdp-btn rdp-btn-primary" href={`/api/public/riders/${token}/pdf`}>
              <FileDown size={14} aria-hidden /> PDF
            </a>
          </div>
        </div>
      </div>

      {history ? (
        <section className="rdp-history" aria-label="Version history">
          {data.versions.map((v, vi) => (
            <div key={v.id} className="rdp-history-v">
              <div className="rdp-history-h">
                <b>Version {v.label}</b> · {fmtDay(v.publishedAt.slice(0, 10), true)}
                {vi === 0 ? <span className="rdp-current">Current</span> : null}
              </div>
              {v.note ? <p className="rdp-note">{v.note}</p> : null}
              {v.changes.some(reaches) ? (
                <ul>
                  {v.changes.filter(reaches).map((c, i) => (
                    <li key={i}>{changeLine(c)}</li>
                  ))}
                </ul>
              ) : v.changes.length ? (
                <p className="rdp-muted">Nothing that changes this show.</p>
              ) : (
                <p className="rdp-muted">
                  {vi === data.versions.length - 1 && data.versions.length < 30 ? 'First version.' : 'Only the order or the attached files changed.'}
                </p>
              )}
            </div>
          ))}
        </section>
      ) : null}

      <div className="rdp-wrap">
        <AckCard
          token={token}
          versionId={version.id}
          label={version.label}
          mine={myAck}
          older={olderAck}
          since={since}
          onMore={() => setHistory(true)}
          onAck={(a) => setAcks((x) => [a, ...x])}
        />

        {models.length > 1 ? (
          <div className="rdp-tabs" role="tablist" aria-label="Documents">
            {models.map((m) => (
              <button key={m.kind} type="button" role="tab" aria-selected={m.kind === model.kind} className="rdp-tab" onClick={() => setKind(m.kind)}>
                {RIDER_KIND_LABEL[m.kind]}
              </button>
            ))}
          </div>
        ) : null}

        <div className="rdp-paper">
          <RiderDocView
            model={model}
            header={header}
            fileHref={fileHref}
            photoUrl={photoUrl}
            onItem={setItem}
            lineExtras={(r) => (
              <LineThread
                key={r.id}
                token={token}
                blockId={r.id}
                messages={threads[r.id] ?? []}
                open={openLine === r.id}
                setOpen={(o) => setOpenLine(o ? r.id : null)}
                onSent={(m) => setThreads((t) => ({ ...t, [r.id]: [...(t[r.id] ?? []), m] }))}
              />
            )}
          />
        </div>
        {item ? (
          <ItemSheet
            item={item}
            photo={item.photo ? photoUrl(item.photo) : null}
            onClose={() => setItem(null)}
            onReply={() => {
              setOpenLine(item.id);
              setItem(null);
              setTimeout(() => document.getElementById(`line-${item.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
            }}
          />
        ) : null}
        <p className="rdp-foot">
          This page always shows the current version of the rider{data.show ? ' for your show' : ''}. Can’t do something? Reply on the line — the tour manager sees it straight away.
        </p>
      </div>
    </main>
  );
}

function AckCard({
  token,
  versionId,
  label,
  mine,
  older,
  since,
  onMore,
  onAck,
}: {
  token: string;
  versionId: string;
  label: string;
  mine: PublicRider['acks'][number] | null;
  older: PublicRider['acks'][number] | null;
  since: RiderChange[];
  onMore: () => void;
  onAck: (a: PublicRider['acks'][number]) => void;
}) {
  const [me, setMe] = useState(() => (typeof window === 'undefined' ? { name: '', company: '' } : remember.get()));
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<PostError | null>(null);
  if (mine) {
    return (
      <div className="rdp-ack rdp-ack-done" role="status">
        <Check size={16} aria-hidden /> Version {label} acknowledged by {mine.name}
        {mine.company ? ` (${mine.company})` : ''} · {fmtDay(mine.ackedAt.slice(0, 10), true)}
      </div>
    );
  }
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await post(token, { action: 'ack', versionId, name: me.name, company: me.company, email });
      remember.set(me);
      onAck({ versionId, versionLabel: label, name: me.name.trim(), company: me.company.trim() || null, ackedAt: new Date().toISOString() });
    } catch (e) {
      setErr(e instanceof PostError ? e : new PostError('Something went wrong — try again.', null));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="rdp-ack"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="rdp-ack-text">
        <b>Have you read version {label}?</b>
        <span>{older ? `Version ${older.versionLabel} was acknowledged here. Since then:` : 'Let the tour manager know — it takes a second.'}</span>
      </div>
      {older && since.length ? (
        <ul className="rdp-since">
          {since.slice(0, 6).map((c, i) => (
            <li key={i}>{changeLine(c)}</li>
          ))}
          {since.length > 6 ? (
            <li>
              <button type="button" className="rdp-link" onClick={onMore}>
                and {since.length - 6} more…
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
      <div className="rdp-ack-fields">
        <input required placeholder="Your name" aria-label="Your name" value={me.name} onChange={(e) => setMe({ ...me, name: e.target.value })} maxLength={120} />
        <input placeholder="Venue / company" aria-label="Venue or company" value={me.company} onChange={(e) => setMe({ ...me, company: e.target.value })} maxLength={120} />
        <input type="email" placeholder="Email (optional)" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
        <button type="submit" className="rdp-btn rdp-btn-primary" disabled={busy || !me.name.trim()}>
          {busy ? 'Saving…' : 'I’ve read it'}
        </button>
      </div>
      <ErrorLine err={err} />
    </form>
  );
}

function LineThread({
  token,
  blockId,
  messages,
  open,
  setOpen,
  onSent,
}: {
  token: string;
  blockId: string;
  messages: Msg[];
  open: boolean;
  setOpen: (o: boolean) => void;
  onSent: (m: Msg) => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<PostError | null>(null);
  const send = async () => {
    setBusy(true);
    setErr(null);
    try {
      const me = remember.get();
      const { reply } = await post<{ reply: Msg }>(token, { action: 'reply', blockId, body: text, name: me.name });
      onSent(reply);
      setText('');
      setOpen(false);
    } catch (e) {
      setErr(e instanceof PostError ? e : new PostError('Something went wrong — try again.', null));
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="rdp-thread">
      {messages.map((m) => (
        <span key={m.id} className="rdp-msg" data-author={m.author}>
          <span className="rdp-msg-who">
            {m.author === 'tour' ? `${m.name ?? 'Tour manager'} (tour)` : m.name ?? 'You'} · {fmtDay(m.createdAt.slice(0, 10))}
          </span>
          {m.body}
        </span>
      ))}
      {open ? (
        <span className="rdp-compose">
          <textarea autoFocus rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. We have a K2 system — or: we can only do a 4x8 riser" aria-label="Your reply" maxLength={2000} />
          <span className="rdp-compose-actions">
            <button type="button" className="rdp-btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="rdp-btn rdp-btn-primary" disabled={busy || !text.trim()} onClick={() => void send()}>
              {busy ? 'Sending…' : 'Send reply'}
            </button>
          </span>
          <ErrorLine err={err} />
        </span>
      ) : (
        <button type="button" className="rdp-reply" onClick={() => setOpen(true)}>
          <MessageSquare size={13} aria-hidden /> {messages.length ? 'Reply' : 'Reply on this line'}
        </button>
      )}
    </span>
  );
}

/** A request line's card: its photo, the exact item, what else will do. */
function ItemSheet({ item, photo, onClose, onReply }: { item: RequestItem; photo: string | null; onClose: () => void; onReply: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="rdp-sheet-back" onClick={onClose}>
      <div className="rdp-sheet" role="dialog" aria-modal="true" aria-label={item.item} onClick={(e) => e.stopPropagation()}>
        <button ref={closeRef} type="button" className="rdp-sheet-x" onClick={onClose} aria-label="Close">
          <X size={18} aria-hidden />
        </button>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- a signed storage URL
          <img className="rdp-sheet-photo" src={photo} alt={item.item} />
        ) : null}
        <div className="rdp-sheet-body">
          <div className="rdp-sheet-title">
            {item.qty ? <span className="rdp-sheet-qty">{item.qty}</span> : null}
            {item.item}
          </div>
          <div className="rdp-sheet-tags">
            {item.provider ? <span className="rd-who" data-who={item.providerId ?? undefined}>{item.provider}</span> : null}
            {item.optional ? <span className="rd-opt">If possible</span> : null}
            {item.perPerson ? <span className="rd-opt">{item.perPerson}</span> : null}
          </div>
          {item.alternatives ? (
            <p>
              <span className="rdp-muted">Or </span>
              {item.alternatives}
            </p>
          ) : null}
          {item.note ? <p>{item.note}</p> : null}
          <div className="rdp-sheet-actions">
            {item.link ? (
              <a className="rdp-btn rdp-btn-primary" href={item.link} target="_blank" rel="noopener noreferrer nofollow">
                See the exact item <ExternalLink size={14} aria-hidden />
                <span className="rdp-sheet-host">{linkHost(item.link)}</span>
              </a>
            ) : null}
            <button type="button" className="rdp-btn" onClick={onReply}>
              <MessageSquare size={14} aria-hidden /> Reply on this line
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

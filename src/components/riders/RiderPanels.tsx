'use client';

/* ============================================
   LOWPASS — Riders: the side panel (rebuild, Nov 2026)
     Outline  — the document's sections, click to jump
     Changes  — what Publish would send, since the last version
     Shows    — per show: link, sent / read / acknowledged, replies
     Replies  — promoters' notes on lines: answer, settle (confirmed /
                substitute / cut for that show), resolve
   ============================================ */

import { useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, FileDown, Mail } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { showsToSend } from '@/lib/riders/status';
import { fmtDay, inForce } from '@/lib/riders/blocks';
import { STATE_LABEL } from '@/lib/riders/render';
import { pickEmbeds, sameEmbeds, usesEmbed } from '@/lib/riders/embeds';
import { changeLine, diffSnapshots } from '@/lib/riders/summary';
import type { LineState, RiderBlock, RiderChange, RiderKind } from '@/lib/riders/types';
import type { RiderReplyRow, RiderShow } from '@/server/riders/data';
import type { RiderEditorStore } from './useRiderEditor';

export type SideTab = 'outline' | 'changes' | 'shows' | 'replies';

export function linkUrl(token: string): string {
  return `${typeof window !== 'undefined' ? window.location.origin : ''}/r/${token}`;
}

export function useDraftChanges(store: RiderEditorStore): { changes: RiderChange[]; layoutOnly: boolean; unpublished: boolean } {
  const { data, draftDocs, party } = store;
  // The input list / plot the draft would freeze — worked out only when the
  // copies or whether a block shows them change, never per keystroke (a plot
  // can be megabytes of SVG).
  const use = { inputList: usesEmbed(draftDocs, 'inputList'), stagePlot: usesEmbed(draftDocs, 'stagePlot') };
  const draftEmbeds = useMemo(() => pickEmbeds(data.embeds, { inputList: use.inputList, stagePlot: use.stagePlot }), [data.embeds, use.inputList, use.stagePlot]);
  const latest = data.latest?.snapshot ?? null;
  const embedsDiffer = useMemo(() => !latest || !sameEmbeds(latest.embeds, draftEmbeds), [latest, draftEmbeds]);
  return useMemo(() => {
    const next = { docs: draftDocs, party, embeds: draftEmbeds };
    const changes = diffSnapshots(latest, next);
    const differs = !latest || embedsDiffer || JSON.stringify({ d: latest.docs, p: latest.party }) !== JSON.stringify({ d: draftDocs, p: party });
    const anything = draftDocs.some((d) => d.blocks.length);
    return { changes, layoutOnly: !!latest && differs && !changes.length, unpublished: anything && differs };
  }, [latest, draftDocs, party, draftEmbeds, embedsDiffer]);
}

export function showLabel(s: RiderShow): string {
  return `${fmtDay(s.date)} · ${s.venue ?? s.city ?? 'Show'}`;
}

export function SidePanel({
  store,
  tab,
  setTab,
  activeRiderId,
  onJump,
  onSend,
  canEdit,
}: {
  store: RiderEditorStore;
  tab: SideTab;
  setTab: (t: SideTab) => void;
  activeRiderId: string | null;
  onJump: (blockId: string, kind?: RiderKind | null) => void;
  onSend: (routingIds?: string[]) => void;
  canEdit: boolean;
}) {
  const openReplies = useMemo(() => {
    const threads = threadsOf(store.data.replies);
    return threads.filter((t) => !t.resolved && t.messages[t.messages.length - 1].author === 'venue').length;
  }, [store.data.replies]);
  const { changes, unpublished } = useDraftChanges(store);
  const tabs: { id: SideTab; label: string; badge?: number }[] = [
    { id: 'outline', label: 'Outline' },
    { id: 'changes', label: 'Changes', badge: unpublished ? changes.length || undefined : undefined },
    { id: 'shows', label: 'Shows' },
    { id: 'replies', label: 'Replies', badge: openReplies || undefined },
  ];
  return (
    <aside className="rdx-side" aria-label="Rider panel">
      <div className="rdx-side-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" className="rdx-side-tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
            {t.badge ? <span className="rdx-badge">{t.badge}</span> : null}
          </button>
        ))}
      </div>
      <div className="rdx-side-body" role="tabpanel">
        {tab === 'outline' ? <Outline store={store} riderId={activeRiderId} onJump={onJump} /> : null}
        {tab === 'changes' ? <Changes store={store} changes={changes} unpublished={unpublished} onJump={onJump} /> : null}
        {tab === 'shows' ? <Shows store={store} onSend={onSend} canEdit={canEdit} /> : null}
        {tab === 'replies' ? <Replies store={store} canEdit={canEdit} onJump={onJump} /> : null}
      </div>
    </aside>
  );
}

function Outline({ store, riderId, onJump }: { store: RiderEditorStore; riderId: string | null; onJump: (id: string) => void }) {
  const heads = riderId ? store.blocksOf(riderId).filter((b): b is Extract<RiderBlock, { kind: 'heading' }> => b.kind === 'heading' && !!b.content.text.trim()) : [];
  if (!heads.length) return <div className="rdx-side-empty">Sections appear here as you add headings.</div>;
  return (
    <div>
      {heads.map((h) => (
        <button key={h.id} type="button" className={`rdx-row${h.content.level === 2 ? ' rdx-outline-2' : ''}`} onClick={() => onJump(h.id)}>
          <span className="grow">{h.content.text}</span>
        </button>
      ))}
    </div>
  );
}

function Changes({ store, changes, unpublished, onJump }: { store: RiderEditorStore; changes: RiderChange[]; unpublished: boolean; onJump: (id: string, kind?: RiderKind | null) => void }) {
  const latest = store.data.latest;
  if (!latest) return <div className="rdx-side-empty">Not published yet — the first version goes out as it reads.</div>;
  if (!unpublished) return <div className="rdx-side-empty">Nothing has changed since version {latest.label}.</div>;
  return (
    <div>
      <div className="rdx-side-h">Since version {latest.label}</div>
      {changes.length ? (
        changes.map((c, i) => (
          <button key={i} type="button" className="rdx-row rdx-change" data-t={c.type} onClick={() => c.blockId && store.blocks[c.blockId] && onJump(c.blockId, c.doc)}>
            <span className="grow">
              {changeLine(c)}
              {c.doc ? <span className="muted"> · {c.doc === 'tech' ? 'Tech' : 'Hospitality'}</span> : null}
            </span>
          </button>
        ))
      ) : (
        <div className="rdx-side-empty">Layout and formatting only.</div>
      )}
    </div>
  );
}

/* ---------- shows ---------- */

export function showStatus(store: RiderEditorStore, s: RiderShow) {
  const { links, sends, acks, versions, replies } = store.data;
  const link = links.find((l) => l.routingId === s.routingId) ?? null;
  const label = (id: string | null | undefined) => versions.find((v) => v.id === id)?.label ?? null;
  const latestId = versions[0]?.id ?? null;
  const sent = link ? sends.find((x) => x.linkId === link.id) ?? null : null;
  const ack = link ? acks.find((a) => a.linkId === link.id) ?? null : null;
  const open = link ? threadsOf(replies.filter((r) => r.linkId === link.id)).filter((t) => !t.resolved).length : 0;
  return {
    link,
    sentLabel: sent ? label(sent.versionId) : null,
    sentCurrent: !!sent && sent.versionId === latestId,
    readLabel: link?.lastViewedVersionId ? label(link.lastViewedVersionId) : null,
    ack,
    ackLabel: ack ? label(ack.versionId) : null,
    ackCurrent: !!ack && ack.versionId === latestId,
    open,
  };
}

function Shows({ store, onSend, canEdit }: { store: RiderEditorStore; onSend: (ids?: string[]) => void; canEdit: boolean }) {
  const { showToast } = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const shows = store.data.shows;
  const upcoming = shows.filter((s) => s.date >= today);
  const latest = store.data.versions[0] ?? null;
  const stale = showsToSend(upcoming, store.data.links, store.data.sends, latest?.id ?? null, today);
  if (!shows.length) return <div className="rdx-side-empty">No show days on this tour yet.</div>;
  const copy = async (s: RiderShow) => {
    try {
      const st = showStatus(store, s);
      let token = st.link?.token;
      if (!token) {
        const out = await store.action<{ links: { token: string }[] }>({ action: 'links', routingIds: [s.routingId] });
        token = out.links[0]?.token;
      }
      if (token) {
        await navigator.clipboard.writeText(linkUrl(token));
        showToast('Link copied');
      }
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  };
  return (
    <div>
      {latest && canEdit ? (
        <div style={{ padding: 'var(--lp-space-2) var(--lp-space-4)' }}>
          <button type="button" className="rdx-chip" onClick={() => onSend(stale.map((s) => s.routingId))} disabled={!stale.length}>
            <Mail size={14} aria-hidden /> {stale.length ? `Send v${latest.label} to ${stale.length} ${stale.length === 1 ? 'show' : 'shows'}` : `Every upcoming show has v${latest.label}`}
          </button>
        </div>
      ) : null}
      {shows.map((s) => {
        const st = showStatus(store, s);
        const past = s.date < today;
        return (
          <div key={s.routingId} style={{ opacity: past ? 0.6 : 1 }}>
            <button type="button" className="rdx-row" onClick={() => setOpen(open === s.routingId ? null : s.routingId)} aria-expanded={open === s.routingId}>
              <span className="grow">
                {showLabel(s)}
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--lp-space-1)', marginTop: 'var(--lp-space-1)' }}>
                  {st.sentLabel ? <span className="rdx-pill" data-tone={st.sentCurrent ? 'good' : 'warn'}>Sent v{st.sentLabel}</span> : <span className="rdx-pill">Not sent</span>}
                  {st.readLabel ? <span className="rdx-pill">Read v{st.readLabel}</span> : null}
                  {st.ack ? (
                    <span className="rdx-pill" data-tone={st.ackCurrent ? 'good' : 'warn'}>
                      <Check size={11} aria-hidden /> v{st.ackLabel} · {st.ack.name.split(' ')[0]}
                    </span>
                  ) : null}
                  {st.open ? <span className="rdx-pill" data-tone="new">{st.open} to answer</span> : null}
                </span>
              </span>
            </button>
            {open === s.routingId ? (
              <div style={{ padding: '0 var(--lp-space-4) var(--lp-space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--lp-space-2)' }}>
                <div className="rdx-row-actions" style={{ flexWrap: 'wrap' }}>
                  {canEdit ? (
                    <button type="button" className="rdx-chip" onClick={() => void copy(s)}>
                      <Copy size={13} aria-hidden /> Copy link
                    </button>
                  ) : null}
                  {canEdit && latest ? (
                    <button type="button" className="rdx-chip" onClick={() => onSend([s.routingId])}>
                      <Mail size={13} aria-hidden /> Email
                    </button>
                  ) : null}
                  {st.link ? (
                    <a className="rdx-chip" href={linkUrl(st.link.token)} target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={13} aria-hidden /> As the promoter sees it
                    </a>
                  ) : null}
                  {latest ? (
                    <a className="rdx-chip" href={store.api.pdfUrl({ routingId: s.routingId })}>
                      <FileDown size={13} aria-hidden /> PDF for this show
                    </a>
                  ) : null}
                </div>
                {store.data.acks.filter((a) => st.link && a.linkId === st.link.id).slice(0, 5).map((a) => (
                  <div key={a.id} className="rdx-mini">
                    Acknowledged v{store.data.versions.find((v) => v.id === a.versionId)?.label ?? '?'} by {a.name}
                    {a.company ? ` (${a.company})` : ''} · {fmtDay(a.ackedAt.slice(0, 10))}
                  </div>
                ))}
                {st.link?.recipientEmail ? <div className="rdx-mini">Goes to {st.link.recipientName ? `${st.link.recipientName} · ` : ''}{st.link.recipientEmail}</div> : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- replies ---------- */

export interface Thread {
  key: string;
  linkId: string;
  routingId: string | null;
  blockId: string;
  line: string;
  messages: RiderReplyRow[];
  resolved: boolean;
}

export function threadsOf(replies: readonly RiderReplyRow[]): Thread[] {
  const m = new Map<string, Thread>();
  for (const r of replies) {
    const key = `${r.linkId}:${r.blockId}`;
    const t = m.get(key) ?? { key, linkId: r.linkId, routingId: r.routingId, blockId: r.blockId, line: r.line, messages: [], resolved: false };
    t.messages.push(r);
    m.set(key, t);
  }
  return [...m.values()].map((t) => ({ ...t, resolved: t.messages.every((x) => !!x.resolvedAt) }));
}

function Replies({ store, canEdit, onJump }: { store: RiderEditorStore; canEdit: boolean; onJump: (id: string) => void }) {
  const threads = useMemo(() => {
    const all = threadsOf(store.data.replies);
    return all.sort((a, b) => Number(a.resolved) - Number(b.resolved) || (b.messages[b.messages.length - 1].createdAt > a.messages[a.messages.length - 1].createdAt ? 1 : -1));
  }, [store.data.replies]);
  if (!threads.length) return <div className="rdx-side-empty">When a promoter replies on a line, it lands here.</div>;
  return (
    <div>
      {threads.map((t) => (
        <ThreadCard key={t.key} t={t} store={store} canEdit={canEdit} onJump={onJump} />
      ))}
    </div>
  );
}

function ThreadCard({ t, store, canEdit, onJump }: { t: Thread; store: RiderEditorStore; canEdit: boolean; onJump: (id: string) => void }) {
  const { showToast } = useToast();
  const [text, setText] = useState('');
  const [sub, setSub] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const show = store.data.shows.find((s) => s.routingId === t.routingId) ?? null;
  const state = t.routingId ? store.data.states.find((s) => s.routingId === t.routingId && s.blockId === t.blockId) ?? null : null;
  const live = !!store.blocks[t.blockId] && (!show || inForce(store.blocks[t.blockId], show.date));
  const run = async (body: Record<string, unknown>, ok?: string) => {
    setBusy(true);
    try {
      await store.action(body);
      if (ok) showToast(ok);
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const settle = (s: LineState | null, note?: string): Promise<void> =>
    t.routingId ? run({ action: 'state', routingId: t.routingId, blockId: t.blockId, state: s, note: note ?? null }) : Promise.resolve();
  return (
    <div className="rdx-thread" data-resolved={t.resolved}>
      <div className="rdx-mini">{show ? showLabel(show) : 'Tour link'}</div>
      <button type="button" className="rdx-link" style={{ textAlign: 'left', color: 'var(--lp-text)' }} onClick={() => live && onJump(t.blockId)} disabled={!live}>
        <span className="rdx-thread-line">{t.line}</span>
        {state ? (
          <span className="rdx-pill" data-tone={state.state === 'confirmed' ? 'good' : state.state === 'substitute' ? 'warn' : undefined} style={{ marginLeft: 'var(--lp-space-2)' }}>
            {STATE_LABEL[state.state]}
            {state.note ? `: ${state.note}` : ''}
          </span>
        ) : null}
      </button>
      {t.messages.map((m) => (
        <div key={m.id} className="rdx-msg" data-author={m.author}>
          <span className="rdx-msg-who">
            {m.name || (m.author === 'venue' ? 'Venue' : 'You')} · {fmtDay(m.createdAt.slice(0, 10))}
          </span>
          {m.body}
        </div>
      ))}
      {canEdit ? (
        <>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Reply — the promoter sees it under this line" aria-label="Reply" data-submit-scope="" />
          <div className="rdx-thread-actions">
            <button
              type="button"
              className="rdx-chip"
              data-submit=""
              disabled={busy || !text.trim()}
              onClick={() => void run({ action: 'reply', linkId: t.linkId, blockId: t.blockId, body: text }).then(() => setText(''))}
            >
              Reply
            </button>
            {t.routingId ? (
              <>
                <button type="button" className="rdx-link" disabled={busy} onClick={() => void settle(state?.state === 'confirmed' ? null : 'confirmed')}>
                  {state?.state === 'confirmed' ? 'Unconfirm' : 'Confirm'}
                </button>
                {sub === null ? (
                  <button type="button" className="rdx-link" disabled={busy} onClick={() => setSub(state?.state === 'substitute' ? state.note ?? '' : '')}>
                    Substitute…
                  </button>
                ) : (
                  <span style={{ display: 'inline-flex', gap: 'var(--lp-space-1)' }}>
                    <input className="rdx-in" style={{ border: '1px solid var(--lp-border)', padding: 'var(--lp-space-1) var(--lp-space-2)', width: '10em' }} autoFocus value={sub} onChange={(e) => setSub(e.target.value)} placeholder="What they’ll give" aria-label="Substitute" />
                    <button type="button" className="rdx-link" onClick={() => void settle('substitute', sub).then(() => setSub(null))}>
                      Save
                    </button>
                  </span>
                )}
                <button type="button" className="rdx-link" disabled={busy} onClick={() => void settle(state?.state === 'cut' ? null : 'cut')}>
                  {state?.state === 'cut' ? 'Uncut' : 'Cut'}
                </button>
              </>
            ) : null}
            <button type="button" className="rdx-link" disabled={busy} onClick={() => void run({ action: 'resolve', linkId: t.linkId, blockId: t.blockId, reopen: t.resolved })} style={{ marginLeft: 'auto' }}>
              {t.resolved ? 'Reopen' : 'Resolve'}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

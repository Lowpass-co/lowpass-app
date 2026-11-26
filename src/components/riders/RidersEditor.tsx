'use client';

/* ============================================
   LOWPASS — <RidersEditor> — Production › Riders (rebuild, Nov 2026)

   Adam: "it is a document… it needs the writing because it's legally
   binding… make requests and demands really clearly… one link… a version
   number and edit date… things change as a tour goes on".

   Two documents (Tech · Hospitality) edited like a page: prose where the
   wording matters, request lines for everything that can be counted, the
   advance summary built from starred lines. Everything saves itself, block
   by block, live with whoever else is in it. Publish freezes both into a
   numbered, dated version; Send writes each show's email with its own link;
   promoters acknowledge and reply on lines, and their replies land in the
   side panel to answer and settle per show.
   ============================================ */

import { useCallback, useMemo, useState } from 'react';
import { ExternalLink, FileDown, Plus, Send, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { PageTitle } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { fmtDay } from '@/lib/riders/blocks';
import { keyAfter } from '@/lib/riders/position';
import { docModel } from '@/lib/riders/render';
import { repliesToAnswer } from '@/lib/riders/status';
import { RIDER_DEFAULT_TITLE, RIDER_KIND_LABEL, RIDER_KINDS, type BlockKind, type RiderBlock, type RiderKind } from '@/lib/riders/types';
import type { RiderEditorData } from '@/server/riders/data';
import { BlockRow, INSERTABLE, KIND_LABEL, type RowContext } from './BlockRow';
import { DatesDialog, PublishDialog, SendPanel, StartPanel, TemplateDialog, type OtherRider } from './RiderDialogs';
import { RiderDocStyles, RiderDocView } from './RiderDocView';
import { SidePanel, linkUrl, useDraftChanges, type SideTab } from './RiderPanels';
import { useRiderEditor } from './useRiderEditor';
import './riders.css';

export function RidersEditor({
  initial,
  tourId,
  me,
  canEdit,
  canBringOver,
  legacyCount,
  otherRiders,
  initialKind,
  initialSide,
}: {
  initial: RiderEditorData;
  tourId: string;
  me: { id: string; name: string };
  canEdit: boolean;
  canBringOver: boolean;
  legacyCount: number;
  otherRiders: OtherRider[];
  /** ?doc= — which document opens (⌘K, links from elsewhere). */
  initialKind?: RiderKind | null;
  /** ?panel= — which side tab opens (the Overview's "replies to answer" links here). */
  initialSide?: SideTab | null;
}) {
  const { showToast } = useToast();
  const onError = useCallback((m: string) => showToast(m, 'error'), [showToast]);
  const store = useRiderEditor(initial, { tourId, me, canEdit, onError });
  const { data } = store;
  const [kind, setKind] = useState<RiderKind>(() => initialKind ?? initial.riders[0]?.kind ?? 'tech');
  const rider = data.riders.find((r) => r.kind === kind) ?? null;
  const list = useMemo(() => (rider ? store.blocksOf(rider.id) : []), [rider, store]);
  const [side, setSide] = useState<SideTab>(initialSide ?? 'outline');
  const [publishing, setPublishing] = useState(false);
  const [sending, setSending] = useState<{ only: string[] | null } | null>(null);
  const [dates, setDates] = useState<{ block: RiderBlock; mode: 'set' | 'change' } | null>(null);
  const [restart, setRestart] = useState(false);
  const [templating, setTemplating] = useState(false);
  const [legacy, setLegacy] = useState(legacyCount);
  const [insertAt, setInsertAt] = useState<{ afterId: string; top: number; left: number } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; side: 'before' | 'after' } | null>(null);
  const draft = useDraftChanges(store);
  const latest = data.latest;
  const openReplies = useMemo(() => repliesToAnswer(data.replies), [data.replies]);

  const jump = useCallback(
    (blockId: string, k?: RiderKind | null) => {
      const b = store.blocks[blockId];
      const target = b ? data.riders.find((r) => r.id === b.riderId)?.kind : k ?? null;
      if (target && target !== kind) setKind(target);
      setTimeout(() => {
        document.getElementById(`blk-${blockId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        store.setFocus(blockId, '__keep');
      }, 60);
    },
    [data.riders, kind, store],
  );

  const drag: RowContext['drag'] = {
    id: dragId,
    over,
    start: setDragId,
    overAt: (id, s) => setOver((o) => (o?.id === id && o.side === s ? o : { id, side: s })),
    end: () => {
      setDragId(null);
      setOver(null);
    },
    drop: () => {
      if (dragId && over && rider) {
        const rest = list.filter((b) => b.id !== dragId);
        const i = rest.findIndex((b) => b.id === over.id);
        if (i >= 0) store.edit(dragId, { position: keyAfter(rest, over.side === 'before' ? i - 1 : i) });
      }
      setDragId(null);
      setOver(null);
    },
  };

  const ctx: RowContext | null = rider
    ? {
        store,
        riderId: rider.id,
        list,
        party: store.party,
        canEdit,
        tourId,
        onDates: (block, mode) => setDates({ block, mode }),
        onInsertMenu: (afterId, anchor) => {
          const r = anchor.getBoundingClientRect();
          setInsertAt({ afterId, top: r.bottom + 4, left: r.left });
        },
        drag,
      }
    : null;

  const add = (k: BlockKind, afterId: string | null = null) => {
    if (!rider) return;
    const after = afterId ?? list[list.length - 1]?.id ?? null;
    const prev = after ? store.blocks[after] : null;
    store.insertAfter(rider.id, after, k, undefined, prev && k !== 'heading' ? { from: prev.from, until: prev.until } : undefined, k === 'request' ? 'item' : undefined);
    setInsertAt(null);
  };

  const previewTour = async () => {
    try {
      let token = data.links.find((l) => l.routingId === null)?.token;
      if (!token) token = (await store.action<{ links: { token: string }[] }>({ action: 'links', routingIds: [null] })).links[0]?.token;
      if (token) window.open(linkUrl(token), '_blank', 'noopener');
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const bringOver = async () => {
    try {
      const res = await fetch('/api/riders/bring-over', { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as { riders?: number; templates?: number; error?: string };
      if (!res.ok) throw new Error(body.error ?? 'Couldn’t bring them over');
      setLegacy(0);
      await store.refresh();
      showToast(`Brought over ${body.riders ?? 0} ${body.riders === 1 ? 'rider' : 'riders'} and ${body.templates ?? 0} ${body.templates === 1 ? 'template' : 'templates'}`);
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const more = [
    ...(canEdit && rider ? [{ label: 'Start from… (replace)', onClick: () => setRestart(true) }] : []),
    ...(canEdit && rider && list.length ? [{ label: 'Save as a template…', onClick: () => setTemplating(true) }] : []),
    { label: 'Download draft PDF', icon: FileDown, onClick: () => window.open(store.api.pdfUrl({ version: 'draft' }), '_blank') },
    ...(latest ? [{ label: `Download v${latest.label} PDF`, icon: FileDown, onClick: () => window.open(store.api.pdfUrl({}), '_blank') }] : []),
  ];

  const statusText = { saved: 'Saved', saving: 'Saving…', error: 'Not saved — retrying', offline: 'Offline — will save' }[store.status];

  return (
    <div className="rdx-page">
      <RiderDocStyles />
      <div className="rdx-top">
        <div>
          <PageTitle>Riders</PageTitle>
          <div className="rdx-facts">
            {latest ? (
              <span>
                <b>Version {latest.label}</b> · published {fmtDay(latest.publishedAt.slice(0, 10), true)}
              </span>
            ) : (
              <span>Not published yet</span>
            )}
            {draft.unpublished && latest ? (
              <>
                <span className="rdx-dot">·</span>
                <span className="rdx-unpub">
                  {draft.changes.length ? `${draft.changes.length} ${draft.changes.length === 1 ? 'change' : 'changes'} not published` : 'Layout changes not published'}
                </span>
              </>
            ) : null}
            <span className="rdx-dot">·</span>
            <span>
              {data.shows.length} {data.shows.length === 1 ? 'show' : 'shows'}
            </span>
            {openReplies ? (
              <>
                <span className="rdx-dot">·</span>
                <button type="button" className="rdx-link" onClick={() => setSide('replies')}>
                  {openReplies} {openReplies === 1 ? 'reply' : 'replies'} to answer
                </button>
              </>
            ) : null}
          </div>
        </div>
        <div className="rdx-actions">
          {store.peers.length ? (
            <span className="rdx-peers" aria-label={`Also here: ${store.peers.map((p) => p.name).join(', ')}`}>
              {store.peers.slice(0, 4).map((p) => (
                <span key={p.userId} className="rdx-avatar" title={p.name}>
                  {p.name
                    .split(/\s+/)
                    .map((w) => w[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
              ))}
            </span>
          ) : null}
          {canEdit ? (
            <span className="rdx-status" data-s={store.status} aria-live="polite">
              {statusText}
            </span>
          ) : null}
          {latest ? (
            <Button variant="ghost" size="sm" onClick={() => void previewTour()}>
              <ExternalLink size={14} aria-hidden /> Preview
            </Button>
          ) : null}
          {canEdit ? (
            <Button variant="secondary" size="sm" onClick={() => setSending({ only: null })} disabled={!latest}>
              <Send size={14} aria-hidden /> Send
            </Button>
          ) : null}
          {canEdit ? (
            <Button variant="primary" size="sm" onClick={() => setPublishing(true)} disabled={!draft.unpublished}>
              <Upload size={14} aria-hidden /> {latest ? 'Publish' : 'Publish v1.0'}
            </Button>
          ) : null}
          <ContextMenu items={more} />
        </div>
      </div>

      {canBringOver && legacy > 0 ? (
        <div className="rdx-banner" role="status">
          <span className="grow">
            {legacy} {legacy === 1 ? 'rider' : 'riders'} from the old rider builder {legacy === 1 ? 'isn’t' : 'aren’t'} here yet. Tour riders join their tour’s documents; artist riders become templates. Nothing old is deleted.
          </span>
          <Button size="sm" variant="secondary" onClick={() => void bringOver()}>
            Bring them over
          </Button>
        </div>
      ) : null}

      <div className="rdx-body">
        <main>
          <div className="rdx-doctabs" role="tablist" aria-label="Documents">
            {RIDER_KINDS.map((k) => {
              const r = data.riders.find((x) => x.kind === k);
              const n = r ? store.blocksOf(r.id).filter((b) => b.kind === 'request').length : 0;
              return (
                <button key={k} type="button" role="tab" className="rdx-doctab" aria-selected={kind === k} onClick={() => setKind(k)}>
                  {RIDER_KIND_LABEL[k]}
                  {r ? <small>{n} {n === 1 ? 'line' : 'lines'}</small> : <small>not started</small>}
                </button>
              );
            })}
          </div>

          {!rider || (restart && canEdit) || (canEdit && !list.length) ? (
            canEdit ? (
              <StartPanel kind={kind} store={store} otherRiders={otherRiders} replace={!!rider && restart && list.length > 0} onDone={() => setRestart(false)} onCancel={restart ? () => setRestart(false) : undefined} />
            ) : (
              <div className="rdx-paper">
                <div className="rdx-side-empty">The {RIDER_KIND_LABEL[kind].toLowerCase()} rider hasn’t been started.</div>
              </div>
            )
          ) : canEdit && ctx ? (
            <div className="rdx-paper">
              <header className="rd-head" style={{ marginBottom: 'var(--lp-space-4)' }}>
                {data.tour.artistName ? <div className="rd-artist">{data.tour.artistName}</div> : null}
                <TitleInput value={rider.title || RIDER_DEFAULT_TITLE[kind]} onSave={(t) => void store.action({ action: 'title', riderId: rider.id, title: t }, { reloadOthers: true })} />
                <div className="rd-meta">
                  <b>{latest ? `Draft after version ${latest.label}` : 'Draft — not published'}</b> · {data.tour.name}
                </div>
              </header>
              {list.map((b, i) => (
                <BlockRow key={b.id} block={b} index={i} ctx={ctx} />
              ))}
              <div className="rdx-add" aria-label="Add to the rider">
                {INSERTABLE.map((k) => (
                  <button key={k} type="button" className="rdx-chip" onClick={() => add(k)}>
                    <Plus size={13} aria-hidden /> {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="rdx-paper">
              <RiderDocView
                model={docModel(store.draftDocs.find((d) => d.kind === kind)!, { date: null, party: store.party, docs: store.draftDocs, attachments: latest?.snapshot.attachments ?? [] })}
                header={{ artist: data.tour.artistName, version: latest ? `Draft after version ${latest.label}` : 'Draft — not published', show: null }}
              />
            </div>
          )}
        </main>
        <SidePanel store={store} tab={side} setTab={setSide} activeRiderId={rider?.id ?? null} onJump={jump} onSend={(ids) => setSending({ only: ids ?? null })} canEdit={canEdit} />
      </div>

      {insertAt ? (
        <InsertPopover at={insertAt} onPick={(k) => add(k, insertAt.afterId)} onClose={() => setInsertAt(null)} />
      ) : null}
      <PublishDialog
        open={publishing}
        onClose={() => setPublishing(false)}
        store={store}
        changes={draft.changes}
        onPublished={(affected, label) => {
          showToast(`Published version ${label}`);
          if (affected.length) setSending({ only: affected });
        }}
      />
      <SendPanel key={sending ? JSON.stringify(sending.only) : 'closed'} open={!!sending} onClose={() => setSending(null)} store={store} only={sending?.only ?? null} me={me} />
      {dates ? <DatesDialog key={`${dates.block.id}:${dates.mode}`} open onClose={() => setDates(null)} block={dates.block} mode={dates.mode} store={store} /> : null}
      {templating && rider ? (
        <TemplateDialog open onClose={() => setTemplating(false)} store={store} riderId={rider.id} defaultName={`${data.tour.artistName ? `${data.tour.artistName} — ` : ''}${RIDER_KIND_LABEL[kind]}`} />
      ) : null}
    </div>
  );
}

function TitleInput({ value, onSave }: { value: string; onSave: (t: string) => void }) {
  // Typed text while editing; the saved title otherwise (a colleague's rename lands).
  const [draft, setDraft] = useState<string | null>(null);
  const v = draft ?? value;
  return (
    <input
      className="rdx-doc-title"
      value={v}
      aria-label="Document title"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (v.trim() && v !== value) onSave(v.trim());
        setDraft(null);
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function InsertPopover({ at, onPick, onClose }: { at: { top: number; left: number }; onPick: (k: BlockKind) => void; onClose: () => void }) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 'var(--lp-z-dropdown)' as unknown as number }} onClick={onClose} aria-hidden />
      <div className="rdx-pop" role="menu" style={{ position: 'fixed', top: at.top, left: at.left }} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        {INSERTABLE.map((k, i) => (
          <button key={k} type="button" role="menuitem" autoFocus={i === 0} onClick={() => onPick(k)}>
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
    </>
  );
}

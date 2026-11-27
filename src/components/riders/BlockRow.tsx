'use client';

/* ============================================
   LOWPASS — Riders: one block in the editor (rebuild, Nov 2026)

   The chrome (+ insert, drag handle / menu, date tag, who else is here, the
   "whose wins" prompt) around an editor per kind. Request lines are rows
   you type straight down: Enter makes the next line, Backspace on an empty
   one removes it. Everything saves itself (useRiderEditor).
   ============================================ */

import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarRange, ChevronDown, Copy, ExternalLink, GripVertical, ImagePlus, Plus, Star, Trash2, X } from 'lucide-react';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu';
import { blockLabel, dateTag, fmtQty, parseQty, parseRequestText, requestLine } from '@/lib/riders/blocks';
import { embedFor, othersFor } from '@/lib/riders/embeds';
import { linkHost, typedLink } from '@/lib/riders/photos';
import { docFromText, proseText } from '@/lib/riders/prose';
import { perPersonFits, sectionAbove } from '@/lib/riders/perPerson';
import { keyAfter } from '@/lib/riders/position';
import { buildSummary } from '@/lib/riders/summary';
import { PROVIDERS, type BlockContentMap, type BlockKind, type RiderBlock, type RiderEmbeds, type RiderKind } from '@/lib/riders/types';
import { ProseEditor } from './ProseEditor';
import { InputsView, PlotView } from './RiderDocView';
import { uploadPhoto } from './photoUpload';
import type { RiderEditorStore } from './useRiderEditor';

export const KIND_LABEL: Record<BlockKind, string> = {
  heading: 'Section heading',
  text: 'Paragraph',
  request: 'Request line',
  table: 'Table',
  contacts: 'Key contacts',
  summary: 'Advance summary',
  files: 'Attachments',
  break: 'Page break',
  input_list: 'Input list',
  stage_plot: 'Stage plot',
};
/** What can be added to a document. The input list and stage plot are the
 *  tech rider's (their own tools write them; the block shows them). */
export function insertableFor(kind: RiderKind): BlockKind[] {
  return kind === 'tech'
    ? ['request', 'text', 'heading', 'table', 'contacts', 'summary', 'input_list', 'stage_plot', 'files', 'break']
    : ['request', 'text', 'heading', 'table', 'contacts', 'summary', 'files', 'break'];
}

/** A fresh request line after `c` keeps who provides it — nothing else. */
const NEXT_LINE = { qty: null, item: '', alternatives: '', note: '', summary: false, optional: false, perPerson: false, link: '', photo: null } as const;

/** Focus `ref` when the store says this block (and field) should have it. */
function useFocusWhen(active: boolean, at: number | undefined, ref: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>) {
  useEffect(() => {
    if (active && ref.current && document.activeElement !== ref.current) {
      ref.current.focus();
      const el = ref.current as HTMLInputElement;
      if (typeof el.value === 'string') el.setSelectionRange?.(el.value.length, el.value.length);
    }
  }, [active, at, ref]);
}

export interface RowContext {
  store: RiderEditorStore;
  riderId: string;
  list: RiderBlock[];
  party: number | null;
  canEdit: boolean;
  tourId: string;
  /** Which document the row is in. */
  kind: RiderKind;
  onDates: (b: RiderBlock, mode: 'set' | 'change') => void;
  onInsertMenu: (afterId: string, anchor: HTMLElement) => void;
  drag: { id: string | null; over: { id: string; side: 'before' | 'after' } | null; start: (id: string) => void; overAt: (id: string, side: 'before' | 'after') => void; drop: () => void; end: () => void };
}

export function BlockRow({ block, index, ctx }: { block: RiderBlock; index: number; ctx: RowContext }) {
  const { store, riderId, list, canEdit } = ctx;
  const focused = store.focus?.id === block.id;
  const peers = store.presenceByBlock[block.id] ?? [];
  const conflict = store.conflicts[block.id];
  const tag = dateTag(block.from, block.until);
  const rowRef = useRef<HTMLDivElement>(null);

  const menu: ContextMenuItem[] = canEdit
    ? [
        ...(block.kind === 'heading'
          ? [{ label: block.content.level === 1 ? 'Make it a sub-heading' : 'Make it a section', onClick: () => store.edit(block.id, { content: { ...block.content, level: block.content.level === 1 ? 2 : 1 } }) }]
          : []),
        ...(block.kind === 'text'
          ? [
              {
                label: 'Turn lines into requests',
                onClick: () => {
                  const lines = proseText(block.content.doc).split('\n').map((l) => parseRequestText(l.replace(/^•\s*/, ''))).filter((x): x is { qty: number | null; item: string } => !!x);
                  if (!lines.length) return;
                  let after: string | null = block.id;
                  for (const l of lines) after = store.insertAfter(riderId, after, 'request', { ...NEXT_LINE, provider: 'venue', qty: l.qty, item: l.item }, { from: block.from, until: block.until });
                  void store.remove([block.id]);
                },
              },
            ]
          : []),
        { label: 'Applies to…', icon: CalendarRange, onClick: () => ctx.onDates(block, 'set') },
        { label: 'Change from a show…', icon: CalendarRange, onClick: () => ctx.onDates(block, 'change') },
        {
          label: 'Duplicate',
          icon: Copy,
          onClick: () => store.insertAfter(riderId, block.id, block.kind, JSON.parse(JSON.stringify(block.content)), { from: block.from, until: block.until }),
        },
        ...(index > 0 ? [{ label: 'Move up', onClick: () => move(-1) }] : []),
        ...(index < list.length - 1 ? [{ label: 'Move down', onClick: () => move(1) }] : []),
        { label: 'Delete', icon: Trash2, variant: 'danger' as const, onClick: () => void store.remove([block.id]) },
      ]
    : [];

  function move(dir: -1 | 1) {
    // Without this block, "after the one before the previous" (up) or
    // "after the next one" (down) — the next one now sits at `index`.
    const rest = list.filter((b) => b.id !== block.id);
    store.edit(block.id, { position: keyAfter(rest, dir === -1 ? index - 2 : index) });
  }

  const dragSide = ctx.drag.over?.id === block.id ? ctx.drag.over.side : undefined;

  return (
    <div
      ref={rowRef}
      className="rdx-block"
      data-kind={block.kind}
      data-focus={focused}
      data-peer={peers.length > 0}
      data-dragover={dragSide}
      id={`blk-${block.id}`}
      onFocusCapture={() => !focused && store.setFocus(block.id, '__keep')}
      onDragOver={(e) => {
        if (!ctx.drag.id || ctx.drag.id === block.id) return;
        e.preventDefault();
        const r = rowRef.current!.getBoundingClientRect();
        ctx.drag.overAt(block.id, e.clientY < r.top + r.height / 2 ? 'before' : 'after');
      }}
      onDrop={(e) => {
        e.preventDefault();
        ctx.drag.drop();
      }}
    >
      {canEdit ? (
        <div className="rdx-gutter">
          <button type="button" className="rdx-gbtn" aria-label="Add below" title="Add below" onClick={(e) => ctx.onInsertMenu(block.id, e.currentTarget)}>
            <Plus size={14} aria-hidden />
          </button>
          <span
            className="rdx-gbtn"
            draggable
            title="Drag to move"
            aria-hidden
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', block.id);
              ctx.drag.start(block.id);
            }}
            onDragEnd={() => ctx.drag.end()}
          >
            <GripVertical size={14} />
          </span>
        </div>
      ) : null}
      {peers.length ? (
        // Who else is in this block: a name flag on its blue bar, top-left —
        // clear of the line's own controls on the right.
        <div className="rdx-peers">
          {peers.map((p) => (
            <span key={p.userId} className="rdx-peer" title={`${p.name} is here`}>
              {p.name.split(' ')[0]}
            </span>
          ))}
        </div>
      ) : null}
      <div className="rdx-aside">
        {tag ? (
          <button type="button" className="rdx-datetag" onClick={() => canEdit && ctx.onDates(block, 'set')} title="Which shows this applies to">
            {tag}
          </button>
        ) : null}
        {canEdit && menu.length ? <ContextMenu items={menu} /> : null}
      </div>
      {conflict ? (
        <div className="rdx-conflict" role="alert">
          <span className="grow">
            Changed by someone else a moment ago: <b>{blockLabel(conflict, ctx.party)}</b>
          </span>
          <button type="button" className="rdx-link" onClick={() => store.resolveConflict(block.id, 'theirs')}>
            Use theirs
          </button>
          <button type="button" className="rdx-link" onClick={() => store.resolveConflict(block.id, 'mine')}>
            Keep mine
          </button>
        </div>
      ) : null}
      <BlockBody block={block} ctx={ctx} focused={focused} />
    </div>
  );
}

function BlockBody({ block, ctx, focused }: { block: RiderBlock; ctx: RowContext; focused: boolean }) {
  switch (block.kind) {
    case 'heading':
      return <HeadingEditor block={block} ctx={ctx} focused={focused} />;
    case 'text':
      return (
        <ProseEditor
          doc={block.content.doc}
          editable={ctx.canEdit}
          autoFocus={focused && ctx.store.focus?.field !== '__keep' && block.version === 0}
          placeholder="Write here — or paste a list and turn it into request lines (⋮ menu)"
          onChange={(doc) => ctx.store.edit(block.id, { content: { doc } })}
        />
      );
    case 'request':
      return <RequestEditor block={block} ctx={ctx} focused={focused} />;
    case 'table':
      return <TableEditor block={block} ctx={ctx} />;
    case 'contacts':
      return <ContactsEditor block={block} ctx={ctx} />;
    case 'summary':
      return <SummaryEditor block={block} ctx={ctx} />;
    case 'files':
      return <FilesEditor block={block} ctx={ctx} />;
    case 'input_list':
      return <InputListBlock blockId={block.id} outputs={block.content.outputs} embeds={ctx.store.data.embeds} href={`/operations/${ctx.tourId}/channel-list`} canEdit={ctx.canEdit} edit={ctx.store.edit} />;
    case 'stage_plot':
      return <StagePlotBlock blockId={block.id} embeds={ctx.store.data.embeds} href={ctx.store.data.embedLinks?.stagePlot ?? `/operations/${ctx.tourId}/stage-plot`} />;
    case 'break':
      return <div className="rdx-break">Page break</div>;
    default:
      return null;
  }
}

/* ---------- heading ---------- */

function HeadingEditor({ block, ctx, focused }: { block: Extract<RiderBlock, { kind: 'heading' }>; ctx: RowContext; focused: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useFocusWhen(focused && ctx.store.focus?.field !== '__keep', ctx.store.focus?.at, ref);
  const level1 = block.content.level === 1;
  return (
    <div className={level1 ? 'rdx-h1-wrap' : 'rdx-h2-wrap'}>
      <input
        ref={ref}
        className={`rdx-in ${level1 ? 'rdx-h1' : 'rdx-h2'}`}
        value={block.content.text}
        placeholder={level1 ? 'Section' : 'Sub-heading'}
        readOnly={!ctx.canEdit}
        aria-label={level1 ? 'Section heading' : 'Sub-heading'}
        onChange={(e) => ctx.store.edit(block.id, { content: { ...block.content, text: e.target.value } })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            ctx.store.insertAfter(ctx.riderId, block.id, 'request', undefined, { from: block.from, until: block.until }, 'item');
          }
        }}
      />
    </div>
  );
}

/* ---------- request line ---------- */

function RequestEditor({ block, ctx, focused }: { block: Extract<RiderBlock, { kind: 'request' }>; ctx: RowContext; focused: boolean }) {
  const c = block.content;
  const itemRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const field = ctx.store.focus?.field;
  useFocusWhen(focused && field !== '__keep' && field !== 'qty', ctx.store.focus?.at, itemRef);
  useFocusWhen(focused && field === 'qty', ctx.store.focus?.at, qtyRef);
  // While typing, the box shows what's typed ("1." on the way to "1.5");
  // otherwise the saved number (someone else's edit lands at once).
  const shownQty = c.qty === null ? '' : fmtQty(c.qty);
  const [qtyDraft, setQtyDraft] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const showSub = more || !!c.alternatives || !!c.note || c.perPerson || c.optional || !!c.link || !!c.photo;
  const thumb = c.photo ? ctx.store.photoUrls[c.photo] ?? null : null;
  // Per person only where it means something (food, drink, towels, passes…);
  // a ticked box always shows so it can be unticked. If possible: any line.
  const perPersonOk = c.perPerson || perPersonFits(c.item, sectionAbove(ctx.list, ctx.list.findIndex((b) => b.id === block.id)));
  const set = (patch: Partial<BlockContentMap['request']>) => ctx.store.edit(block.id, { content: { ...c, ...patch } });
  const prevId = () => {
    const i = ctx.list.findIndex((b) => b.id === block.id);
    return i > 0 ? ctx.list[i - 1].id : null;
  };

  const onItemKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      ctx.store.insertAfter(ctx.riderId, block.id, 'request', { ...c, ...NEXT_LINE }, { from: block.from, until: block.until }, 'item');
    } else if (e.key === 'Backspace' && !c.item && c.qty === null && !c.alternatives && !c.note && !c.link && !c.photo) {
      e.preventDefault();
      const p = prevId();
      void ctx.store.remove([block.id]);
      if (p) ctx.store.setFocus(p, 'item');
    }
  };

  return (
    <>
      <div className="rdx-req">
        <input
          ref={qtyRef}
          className="rdx-in rdx-qty"
          inputMode="decimal"
          aria-label="Quantity"
          placeholder="—"
          value={qtyDraft ?? shownQty}
          readOnly={!ctx.canEdit}
          onFocus={() => setQtyDraft(shownQty)}
          onBlur={() => setQtyDraft(null)}
          onChange={(e) => {
            setQtyDraft(e.target.value);
            set({ qty: parseQty(e.target.value) });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              itemRef.current?.focus();
            }
          }}
        />
        <span className="rdx-itemwrap">
          {c.photo ? (
            <button type="button" className="rdx-thumb" onClick={() => setMore(true)} title="The photo on this line" aria-label="The photo on this line">
              {/* eslint-disable-next-line @next/next/no-img-element -- a signed storage URL, sized by CSS */}
              {thumb ? <img src={thumb} alt="" /> : null}
            </button>
          ) : null}
          <input
            ref={itemRef}
            className="rdx-in rdx-item"
            aria-label="Requested item"
            placeholder="What you need — e.g. 8x8x1 rolling drum riser"
            value={c.item}
            readOnly={!ctx.canEdit}
            onChange={(e) => set({ item: e.target.value })}
            onKeyDown={onItemKey}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text/plain');
              const lines = text.split(/\r?\n/).map(parseRequestText).filter((x): x is { qty: number | null; item: string } => !!x);
              if (lines.length < 2 || c.item) return;
              e.preventDefault();
              set({ qty: lines[0].qty, item: lines[0].item });
              let after: string | null = block.id;
              for (const l of lines.slice(1)) after = ctx.store.insertAfter(ctx.riderId, after, 'request', { ...c, ...NEXT_LINE, optional: c.optional, perPerson: c.perPerson, qty: l.qty, item: l.item }, { from: block.from, until: block.until });
            }}
          />
        </span>
        <select
          className="rdx-who"
          aria-label="Who provides it"
          data-who={c.provider ?? ''}
          value={c.provider ?? ''}
          disabled={!ctx.canEdit}
          onChange={(e) => set({ provider: (e.target.value || null) as typeof c.provider })}
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.short}
            </option>
          ))}
          <option value="">—</option>
        </select>
        <button
          type="button"
          className="rdx-star"
          aria-pressed={c.summary}
          aria-label={c.summary ? 'In the advance summary' : 'Add to the advance summary'}
          title={c.summary ? 'In the advance summary' : 'Add to the advance summary'}
          disabled={!ctx.canEdit}
          onClick={() => set({ summary: !c.summary })}
        >
          <Star size={15} fill={c.summary ? 'currentColor' : 'none'} aria-hidden />
        </button>
        <button type="button" className="rdx-star rdx-disclose" aria-expanded={showSub} aria-label="Details: alternatives, note, link, photo" title="Details — alternatives, note, link to the exact item, photo" onClick={() => setMore((m) => !m)}>
          <ChevronDown size={15} aria-hidden />
        </button>
        {showSub ? (
          <div className="rdx-req-sub">
            <span className="rdx-or">
              <i>Or</i>
              <input className="rdx-in" placeholder="what else is fine" value={c.alternatives} readOnly={!ctx.canEdit} onChange={(e) => set({ alternatives: e.target.value })} aria-label="Acceptable alternatives" />
            </span>
            <span className="rdx-or">
              <i>Note</i>
              <input className="rdx-in" placeholder="anything else" value={c.note} readOnly={!ctx.canEdit} onChange={(e) => set({ note: e.target.value })} aria-label="Note" />
            </span>
            {perPersonOk ? (
              <label>
                <input type="checkbox" className="lp-checkbox" checked={c.perPerson} disabled={!ctx.canEdit} onChange={(e) => set({ perPerson: e.target.checked })} /> per person
                {c.perPerson && c.qty !== null ? <span className="rdx-mini"> = {requestLine(c, ctx.party).match(/^\(([^)]+)\)/)?.[1] ?? '—'}</span> : null}
              </label>
            ) : null}
            <label>
              <input type="checkbox" className="lp-checkbox" checked={c.optional} disabled={!ctx.canEdit} onChange={(e) => set({ optional: e.target.checked })} /> if possible
            </label>
            {more || c.link || c.photo ? <ExactItem blockId={block.id} link={c.link} photo={c.photo} photoUrl={thumb} ctx={ctx} /> : null}
          </div>
        ) : null}
      </div>
    </>
  );
}

/* ---------- the exact item: a link + a photo ---------- */

function ExactItem({ blockId, link, photo, photoUrl, ctx }: { blockId: string; link: string; photo: string | null; photoUrl: string | null; ctx: RowContext }) {
  const { store, canEdit } = ctx;
  // What's typed, until it's committed (blur / Enter): a half-typed link
  // isn't a link, and the server drops anything that isn't one.
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'upload' | 'link'>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fromLink = async (url: string) => {
    setBusy('link');
    setProblem(null);
    try {
      const got = await store.api.photoFromLink(url);
      if (got.url) store.addPhotoUrl(got.path, got.url);
      store.patchContent(blockId, { photo: got.path });
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const commitLink = () => {
    if (linkDraft === null) return;
    const raw = linkDraft;
    setLinkDraft(null);
    if (!raw.trim()) {
      if (link) store.patchContent(blockId, { link: '' });
      setProblem(null);
      return;
    }
    const next = typedLink(raw);
    if (!next) {
      setProblem('That doesn’t look like a web link.');
      return;
    }
    setProblem(null);
    if (next === link) return;
    store.patchContent(blockId, { link: next });
    // A new link and no photo yet: take the shop's own product photo.
    if (!photo) void fromLink(next);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy('upload');
    setProblem(null);
    try {
      const got = await uploadPhoto(store.api, file);
      if (got.url) store.addPhotoUrl(got.path, got.url);
      store.patchContent(blockId, { photo: got.path });
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <span className="rdx-exact">
      <span className="rdx-or rdx-exact-link">
        <i>Link</i>
        <input
          className="rdx-in"
          inputMode="url"
          placeholder="the exact item — a shop or product page"
          value={linkDraft ?? link}
          readOnly={!canEdit}
          aria-label="Link to the exact item"
          onChange={(e) => setLinkDraft(e.target.value)}
          onBlur={commitLink}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        {link && linkDraft === null ? (
          <a className="rdx-exact-open" href={link} target="_blank" rel="noopener noreferrer nofollow" title={`Open ${linkHost(link)}`} aria-label={`Open ${linkHost(link)}`}>
            <ExternalLink size={13} aria-hidden />
          </a>
        ) : null}
      </span>
      <span className="rdx-exact-photo">
        {photo ? (
          <span className="rdx-exact-img">
            {/* eslint-disable-next-line @next/next/no-img-element -- a signed storage URL, sized by CSS */}
            {photoUrl ? <img src={photoUrl} alt="The item" /> : null}
          </span>
        ) : null}
        {busy ? (
          <span className="rdx-mini" role="status">
            {busy === 'link' ? 'Getting the shop’s photo…' : 'Uploading the photo…'}
          </span>
        ) : canEdit ? (
          <>
            <button type="button" className="rdx-link" onClick={() => fileRef.current?.click()}>
              <ImagePlus size={13} aria-hidden /> {photo ? 'Replace photo' : 'Photo'}
            </button>
            {!photo && link ? (
              <button type="button" className="rdx-link" onClick={() => void fromLink(link)}>
                Use the shop’s photo
              </button>
            ) : null}
            {photo ? (
              <button type="button" className="rdx-link" onClick={() => store.patchContent(blockId, { photo: null })}>
                Remove photo
              </button>
            ) : null}
          </>
        ) : null}
        {problem ? (
          <span className="rdx-mini rdx-exact-problem" role="alert">
            {problem}
          </span>
        ) : null}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
      </span>
    </span>
  );
}

/* ---------- the input list + stage plot (their own tools write them) ---------- */

/** The input list / stage plot are edited in their own tools: the whole
 *  preview is the way there (same tab; Back returns here and RidersEditor
 *  picks up the change). */
function EmbedOpen({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <Link href={href} className="rdx-embed-open" aria-label={label} title={label}>
      {children}
      <span className="rdx-embed-go" aria-hidden>
        {label} <ArrowRight size={13} />
      </span>
    </Link>
  );
}

const InputListBlock = memo(function InputListBlock({
  blockId,
  outputs,
  embeds,
  href,
  canEdit,
  edit,
}: {
  blockId: string;
  outputs: boolean;
  embeds: RiderEmbeds;
  href: string;
  canEdit: boolean;
  edit: RiderEditorStore['edit'];
}) {
  const list = embedFor(embeds, 'inputList', null);
  const others = othersFor(embeds, 'inputList');
  const hasOutputs = !!list?.outputs?.rows.length;
  return (
    <div className="rdx-embed">
      <EmbedOpen href={href} label={list ? 'Open the channel list' : 'Make the channel list'}>
        <InputsView it={{ t: 'inputs', id: blockId, list, outputs, others, tag: null }} />
      </EmbedOpen>
      {hasOutputs ? (
        <div className="rdx-row-actions rdx-embed-actions">
          <label className="rdx-mini">
            <input type="checkbox" className="lp-checkbox" checked={outputs} disabled={!canEdit} onChange={(e) => edit(blockId, { content: { outputs: e.target.checked } })} /> with outputs (IEM / mixes)
          </label>
        </div>
      ) : null}
    </div>
  );
});

const StagePlotBlock = memo(function StagePlotBlock({ blockId, embeds, href }: { blockId: string; embeds: RiderEmbeds; href: string }) {
  const plot = embedFor(embeds, 'stagePlot', null);
  return (
    <div className="rdx-embed">
      <EmbedOpen href={href} label={plot ? 'Open the stage plot' : 'Make the stage plot'}>
        <PlotView it={{ t: 'plot', id: blockId, plot, others: othersFor(embeds, 'stagePlot'), tag: null }} />
      </EmbedOpen>
    </div>
  );
});

/* ---------- table ---------- */

function TableEditor({ block, ctx }: { block: Extract<RiderBlock, { kind: 'table' }>; ctx: RowContext }) {
  const c = block.content;
  const set = (next: BlockContentMap['table']) => ctx.store.edit(block.id, { content: next });
  const ro = !ctx.canEdit;
  return (
    <div>
      <table className="rdx-grid">
        <thead>
          <tr>
            {c.columns.map((col, i) => (
              <th key={i}>
                <input className="rdx-in" value={col} placeholder={`Column ${i + 1}`} readOnly={ro} aria-label={`Column ${i + 1} heading`} onChange={(e) => set({ ...c, columns: c.columns.map((x, j) => (j === i ? e.target.value : x)) })} />
              </th>
            ))}
            <th className="rdx-x" />
          </tr>
        </thead>
        <tbody>
          {c.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci}>
                  <textarea className="rdx-in" rows={1} value={cell} readOnly={ro} aria-label={`Row ${ri + 1}, ${c.columns[ci] || `column ${ci + 1}`}`} onChange={(e) => set({ ...c, rows: c.rows.map((r, j) => (j === ri ? r.map((x, k) => (k === ci ? e.target.value : x)) : r)) })} />
                </td>
              ))}
              <td className="rdx-x">
                {!ro ? (
                  <button type="button" className="rdx-gbtn" aria-label={`Remove row ${ri + 1}`} onClick={() => set({ ...c, rows: c.rows.filter((_, j) => j !== ri) })}>
                    <X size={13} aria-hidden />
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!ro ? (
        <div className="rdx-row-actions">
          <button type="button" className="rdx-link" onClick={() => set({ ...c, rows: [...c.rows, c.columns.map(() => '')] })}>
            + Row
          </button>
          <button type="button" className="rdx-link" disabled={c.columns.length >= 8} onClick={() => set({ columns: [...c.columns, ''], rows: c.rows.map((r) => [...r, '']) })}>
            + Column
          </button>
          {c.columns.length > 1 ? (
            <button type="button" className="rdx-link" onClick={() => set({ columns: c.columns.slice(0, -1), rows: c.rows.map((r) => r.slice(0, -1)) })}>
              − Last column
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- contacts ---------- */

function ContactsEditor({ block, ctx }: { block: Extract<RiderBlock, { kind: 'contacts' }>; ctx: RowContext }) {
  const people = block.content.people;
  const crew = ctx.store.data.crew;
  const set = (next: typeof people) => ctx.store.edit(block.id, { content: { people: next } });
  const ro = !ctx.canEdit;
  const free = crew.filter((p) => !people.some((x) => x.personId === p.personId));
  const field = (i: number, k: 'name' | 'role' | 'phone' | 'email', label: string) => (
    <td>
      <input className="rdx-in" value={people[i][k]} placeholder={label} aria-label={label} readOnly={ro} onChange={(e) => set(people.map((p, j) => (j === i ? { ...p, [k]: e.target.value } : p)))} />
    </td>
  );
  return (
    <div>
      <table className="rdx-grid">
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>Phone</th>
            <th>Email</th>
            <th className="rdx-x" />
          </tr>
        </thead>
        <tbody>
          {people.map((_, i) => (
            <tr key={i}>
              {field(i, 'name', 'Name')}
              {field(i, 'role', 'Role')}
              {field(i, 'phone', 'Phone')}
              {field(i, 'email', 'Email')}
              <td className="rdx-x">
                {!ro ? (
                  <button type="button" className="rdx-gbtn" aria-label="Remove" onClick={() => set(people.filter((__, j) => j !== i))}>
                    <X size={13} aria-hidden />
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!ro ? (
        <div className="rdx-row-actions">
          <button type="button" className="rdx-link" onClick={() => set([...people, { name: '', role: '', phone: '', email: '', personId: null }])}>
            + Person
          </button>
          {free.length ? (
            <select
              className="rdx-who"
              value=""
              aria-label="Add someone from the crew"
              onChange={(e) => {
                const p = crew.find((x) => x.personId === e.target.value);
                if (p) set([...people, { name: p.name, role: p.role, phone: p.phone, email: p.email, personId: p.personId }]);
              }}
            >
              <option value="">+ From the crew…</option>
              {free.map((p) => (
                <option key={p.personId} value={p.personId}>
                  {p.name}
                  {p.role ? ` — ${p.role}` : ''}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- summary ---------- */

function SummaryEditor({ block, ctx }: { block: Extract<RiderBlock, { kind: 'summary' }>; ctx: RowContext }) {
  const groups = useMemo(() => buildSummary(ctx.store.draftDocs, ctx.party), [ctx.store.draftDocs, ctx.party]);
  const { data } = ctx.store;
  const savedSize = data.party.setting === null ? '' : String(data.party.setting);
  const [sizeDraft, setSizeDraft] = useState<string | null>(null);
  const size = sizeDraft ?? savedSize;
  const saveParty = (v: string) => {
    const n = v.trim() ? Number(v) : null;
    if (n !== null && (!Number.isFinite(n) || n < 1)) return;
    void ctx.store.action({ action: 'party', size: n }, { reloadOthers: true });
  };
  return (
    <section className="rd-summary">
      <div className="rd-summary-title">
        <input className="rdx-in" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 'var(--lp-weight-bold)', fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)' }} value={block.content.title} readOnly={!ctx.canEdit} aria-label="Summary title" onChange={(e) => ctx.store.edit(block.id, { content: { title: e.target.value } })} />
        {ctx.party ? <span className="rd-summary-party">Touring party of {ctx.party}</span> : null}
      </div>
      {groups.length ? (
        <div className="rd-summary-grid">
          {groups.map((g) => (
            <div key={g.heading}>
              <h4>{g.heading}</h4>
              <ul>
                {g.lines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <div className="rd-summary-empty">Star a request line (☆) to list it here.</div>
      )}
      <div className="rdx-summary-edit">
        <span>Touring party</span>
        <input
          className="rdx-in"
          inputMode="numeric"
          placeholder={data.party.crew ? String(data.party.crew) : '—'}
          value={size}
          readOnly={!ctx.canEdit}
          aria-label="Touring party size"
          onChange={(e) => setSizeDraft(e.target.value.replace(/[^\d]/g, ''))}
          onBlur={() => {
            if (size !== savedSize) saveParty(size);
            setSizeDraft(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <span className="rdx-mini">{data.party.setting === null ? `counted from the crew (${data.party.crew})` : `set by hand — clear it to count the crew (${data.party.crew})`}</span>
      </div>
    </section>
  );
}

/* ---------- attachments ---------- */

function FilesEditor({ block, ctx }: { block: Extract<RiderBlock, { kind: 'files' }>; ctx: RowContext }) {
  const items = block.content.items;
  const { data } = ctx.store;
  const set = (next: typeof items) => ctx.store.edit(block.id, { content: { items: next } });
  const ro = !ctx.canEdit;
  const line = (label: string, status: ReactNode, onRemove: () => void, key: string, extra?: ReactNode) => (
    <div className="rdx-file" key={key}>
      <span className="grow">
        <b>{label}</b> <span className="rdx-mini">{status}</span>
      </span>
      {extra}
      {!ro ? (
        <button type="button" className="rdx-gbtn" aria-label={`Remove ${label}`} onClick={onRemove}>
          <X size={13} aria-hidden />
        </button>
      ) : null}
    </div>
  );
  // An input list / stage plot attached here (riders made before the blocks
  // existed) is a PDF of the live document. One click moves it into the
  // rider as its block — shown, and frozen with each version.
  const toBlock = (i: number, kind: 'input_list' | 'stage_plot') => {
    ctx.store.insertAfter(ctx.riderId, block.id, kind, kind === 'input_list' ? { outputs: true } : {}, { from: block.from, until: block.until });
    const rest = items.filter((_, j) => j !== i);
    if (rest.length) set(rest);
    else void ctx.store.remove([block.id]);
  };
  const moveBtn = (i: number, kind: 'input_list' | 'stage_plot') =>
    !ro ? (
      <button type="button" className="rdx-link" onClick={() => toBlock(i, kind)}>
        Show it in the rider
      </button>
    ) : null;
  const unused = data.files.filter((f) => !items.some((i) => i.kind === 'file' && i.id === f.id));
  return (
    <div className="rdx-files">
      {items.map((it, i) =>
        it.kind === 'channel_list'
          ? line('Input list', data.has.channelList ? 'a PDF of the live channel list' : <Link href={`/operations/${ctx.tourId}/channel-list`}>no channel list on this tour yet</Link>, () => set(items.filter((_, j) => j !== i)), 'cl', moveBtn(i, 'input_list'))
          : it.kind === 'stage_plot'
            ? line('Stage plot', data.has.stagePlot ? 'a PDF of the live stage plot' : <Link href={`/operations/${ctx.tourId}/stage-plot`}>no stage plot on this tour yet</Link>, () => set(items.filter((_, j) => j !== i)), 'sp', moveBtn(i, 'stage_plot'))
            : line(it.label, data.files.some((f) => f.id === it.id) ? 'tour file' : 'no longer in tour files', () => set(items.filter((_, j) => j !== i)), it.id),
      )}
      {!items.length && !data.files.length ? (
        <div className="rdx-mini">
          No tour files to attach yet — <Link href={`/operations/${ctx.tourId}/files`}>add them in Files</Link>.
        </div>
      ) : null}
      {!ro && unused.length ? (
        <div className="rdx-row-actions">
          <select
            className="rdx-who"
            value=""
            aria-label="Attach a tour file"
            onChange={(e) => {
              const f = data.files.find((x) => x.id === e.target.value);
              if (f) set([...items, { kind: 'file', id: f.id, label: f.name }]);
            }}
          >
            <option value="">+ A tour file…</option>
            {unused.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}

/** Plain text → a prose doc (used by the insert menu's paste). */
export const textDoc = docFromText;

'use client';

/* ============================================
   LOWPASS — Channel PATCH MATRIX (G2-2, graded design)

   Replaces the vertical socket-strip board (ChannelPatchBoard) with a true
   matrix: CHANNELS down the left, SOCKETS across the top grouped by stage box /
   sub-snake (box-coloured group headers). A cell = one channel × one socket.

   Interactions (graded):
     · click a cell   → patch that channel to that socket; CLICK AGAIN UNPATCHES
                        (toggle). Assigning always clears the channel's other
                        socket family, so a channel is only ever in one place.
     · crosshair      → hovering a cell tints its whole row + column.
     · drag a diagonal → press a cell and drag down-right: patches a sequential
                        run (chan N→sock X, N+1→X+1, …). Live preview; commit on
                        release. (The diagonal IS the rule here — unlike the days
                        matrix, where a diagonal drag was a bug.)
     · conflict red   → a socket column holding >1 channel renders red.
     · keyboard       → arrows move a cursor cell; Enter toggles it.
   Toolbar: Patch in order · Clear patch (confirm) · Boxes filter.

   DATA-WRITE SAFETY (unchanged from the strip board): every assignment is one
   onPatch(channelId, SocketPatch) writing ONLY the socket-family columns
   (stage_box_id/position or sub_snake_id/position). row_index (the channel
   number) is NEVER written — patching assigns a physical socket, it never
   renumbers. No output_* columns are touched.

   HUE BUDGET (locked): orange = selection / cursor / drag-preview ONLY; red =
   conflict. Group headers carry the desaturated box colour.
   ============================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChannelListRow, StageBox, SubSnake } from '@/lib/rider-packs/types';

/** The only columns patch mode ever writes — a strict subset of RowPatch.
 *  Assigning sets one socket family and nulls the other; row_index is never here. */
export type SocketPatch = {
  stage_box_id?: string | null;
  stage_box_position?: number | null;
  sub_snake_id?: string | null;
  sub_snake_position?: number | null;
};

type StripKind = 'box' | 'snake';
type Strip = { kind: StripKind; id: string; label: string; colour: string; capacity: number };
type Socket = { strip: Strip; pos: number; col: number };
type Cell = { r: number; c: number };

/** Unpatch — nulls both socket families (static, so it's module-scoped). */
const CLEAR_PATCH: SocketPatch = { stage_box_id: null, stage_box_position: null, sub_snake_id: null, sub_snake_position: null };

/** The sequential diagonal path between two cells (down-right / any quadrant).
 *  A pure horizontal/vertical drag yields just the anchor — the gesture is
 *  diagonal by design. */
function diagPath(a: Cell, b: Cell): Cell[] {
  const dr = Math.sign(b.r - a.r);
  const dc = Math.sign(b.c - a.c);
  const steps = Math.min(Math.abs(b.r - a.r), Math.abs(b.c - a.c));
  const out: Cell[] = [];
  for (let i = 0; i <= steps; i++) out.push({ r: a.r + i * dr, c: a.c + i * dc });
  return out;
}

export function PatchMatrix({
  rows,
  stageBoxes,
  subSnakes,
  onPatch,
}: {
  /** Input rows only (row_kind='input'). Output rows never patch. */
  rows: ChannelListRow[];
  stageBoxes: StageBox[];
  subSnakes: SubSnake[];
  onPatch: (channelId: string, patch: SocketPatch) => void;
}) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [cursor, setCursor] = useState<Cell>({ r: 0, c: 0 });
  const [hover, setHover] = useState<Cell | null>(null);
  const [drag, setDrag] = useState<{ anchor: Cell; cursor: Cell } | null>(null);
  const dragRef = useRef<{ anchor: Cell; cursor: Cell } | null>(null);
  useEffect(() => { dragRef.current = drag; }, [drag]);
  const [confirmClear, setConfirmClear] = useState(false);

  const allStrips = useMemo<Strip[]>(
    () => [
      ...stageBoxes.slice().sort((a, b) => a.position - b.position)
        .map((b) => ({ kind: 'box' as const, id: b.id, label: b.label, colour: b.colour, capacity: b.capacity })),
      ...subSnakes.slice().sort((a, b) => a.position - b.position)
        .map((s) => ({ kind: 'snake' as const, id: s.id, label: s.label, colour: s.colour, capacity: s.capacity })),
    ],
    [stageBoxes, subSnakes],
  );
  const strips = useMemo(() => allStrips.filter((s) => !hidden.has(s.id)), [allStrips, hidden]);

  /** Flattened sockets in column order — the matrix's X axis. */
  const sockets = useMemo<Socket[]>(() => {
    const out: Socket[] = [];
    let col = 0;
    for (const strip of strips) {
      for (let pos = 1; pos <= strip.capacity; pos++) out.push({ strip, pos, col: col++ });
    }
    return out;
  }, [strips]);

  /** Channels down the left — the matrix's Y axis (by channel number). */
  const channels = useMemo(() => rows.slice().sort((a, b) => a.row_index - b.row_index), [rows]);

  /** Which socket-column a channel currently sits in (−1 = unpatched / off-view). */
  const colOfChannel = useCallback(
    (ch: ChannelListRow): number => {
      const s = sockets.find((sk) =>
        sk.strip.kind === 'box'
          ? ch.stage_box_id === sk.strip.id && ch.stage_box_position === sk.pos
          : ch.sub_snake_id === sk.strip.id && ch.sub_snake_position === sk.pos,
      );
      return s ? s.col : -1;
    },
    [sockets],
  );

  /** channelIndex → socketCol, and per-column occupancy (for conflicts). */
  const { rowCol, colCount } = useMemo(() => {
    const rc = new Map<number, number>();
    const cc = new Map<number, number>();
    channels.forEach((ch, r) => {
      const c = colOfChannel(ch);
      rc.set(r, c);
      if (c >= 0) cc.set(c, (cc.get(c) ?? 0) + 1);
    });
    return { rowCol: rc, colCount: cc };
  }, [channels, colOfChannel]);

  const patchFor = (strip: Strip, pos: number): SocketPatch =>
    strip.kind === 'box'
      ? { stage_box_id: strip.id, stage_box_position: pos, sub_snake_id: null, sub_snake_position: null }
      : { sub_snake_id: strip.id, sub_snake_position: pos, stage_box_id: null, stage_box_position: null };

  /** Toggle: patch channel r into socket c, or unpatch if already there. */
  const toggleCell = useCallback(
    (r: number, c: number) => {
      const ch = channels[r];
      const sock = sockets[c];
      if (!ch || !sock) return;
      if (rowCol.get(r) === c) onPatch(ch.id, CLEAR_PATCH);
      else onPatch(ch.id, patchFor(sock.strip, sock.pos));
    },
    [channels, sockets, rowCol, onPatch],
  );

  /** Commit a diagonal run of assignments (no toggle — always patches). */
  const commitDiagonal = useCallback(
    (path: Cell[]) => {
      for (const { r, c } of path) {
        const ch = channels[r];
        const sock = sockets[c];
        if (ch && sock) onPatch(ch.id, patchFor(sock.strip, sock.pos));
      }
    },
    [channels, sockets, onPatch],
  );

  // Mouse drag lifecycle: down arms a drag; a same-cell release is a click
  // (toggle); a multi-cell release commits the diagonal.
  useEffect(() => {
    const up = () => {
      const d = dragRef.current;
      if (d) {
        const path = diagPath(d.anchor, d.cursor);
        if (path.length <= 1) toggleCell(d.anchor.r, d.anchor.c);
        else commitDiagonal(path);
        setDrag(null);
      }
    };
    document.addEventListener('mouseup', up);
    return () => document.removeEventListener('mouseup', up);
  }, [toggleCell, commitDiagonal]);

  const patchInOrder = useCallback(() => {
    const emptyCols = sockets.filter((s) => !(colCount.get(s.col)! > 0)).map((s) => s);
    const unpatched = channels.filter((_, r) => (rowCol.get(r) ?? -1) < 0);
    let qi = 0;
    for (const sock of emptyCols) {
      if (qi >= unpatched.length) break;
      onPatch(unpatched[qi].id, patchFor(sock.strip, sock.pos));
      qi++;
    }
  }, [sockets, colCount, channels, rowCol, onPatch]);

  const doClearAll = useCallback(() => {
    for (const ch of channels) if (colOfChannel(ch) >= 0 || ch.stage_box_id || ch.sub_snake_id) onPatch(ch.id, CLEAR_PATCH);
    setConfirmClear(false);
  }, [channels, colOfChannel, onPatch]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const nR = channels.length, nC = sockets.length;
    if (nR === 0 || nC === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((p) => ({ ...p, r: Math.min(p.r + 1, nR - 1) })); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((p) => ({ ...p, r: Math.max(p.r - 1, 0) })); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setCursor((p) => ({ ...p, c: Math.min(p.c + 1, nC - 1) })); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setCursor((p) => ({ ...p, c: Math.max(p.c - 1, 0) })); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCell(cursor.r, cursor.c); }
  };

  // Cells currently in the drag preview (a Set of "r:c" keys).
  const previewKeys = useMemo(() => {
    if (!drag) return new Set<string>();
    return new Set(diagPath(drag.anchor, drag.cursor).map((p) => `${p.r}:${p.c}`));
  }, [drag]);

  const CH_W = 200;
  const CELL = 26;
  const channelLabel = (c: ChannelListRow) => `${c.row_index}. ${c.channel_name || 'Untitled'}`;

  if (allStrips.length === 0) {
    return (
      <div className="border-t border-lp-border bg-lp-surface px-4 py-8 text-center text-xs text-lp-text-tertiary">
        No stage boxes or sub-snakes yet. Add one via <span className="font-semibold">Manage stage I/O</span> or{' '}
        <span className="font-semibold">Manage sub-snakes</span> to open the patch matrix.
      </div>
    );
  }

  return (
    <div className="border-t border-lp-border bg-lp-surface p-3">
      {/* Toolbar */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={patchInOrder}
          className="rounded border border-lp-border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-lp-text-secondary hover:bg-lp-surface-hover"
        >
          Patch in order
        </button>
        <button
          type="button"
          onClick={() => setConfirmClear(true)}
          className="rounded border border-lp-border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-lp-text-secondary hover:bg-lp-surface-hover"
        >
          Clear patch
        </button>
        {allStrips.length > 1 && (
          <div className="ml-1 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-lp-text-tertiary">Boxes</span>
            {allStrips.map((s) => {
              const on = !hidden.has(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setHidden((prev) => {
                    const next = new Set(prev);
                    if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
                    return next;
                  })}
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                  style={{
                    borderColor: on ? 'var(--lp-border-strong)' : 'var(--lp-border)',
                    background: on ? 'var(--lp-bg)' : 'transparent',
                    color: on ? 'var(--lp-text)' : 'var(--lp-text-tertiary)',
                    opacity: on ? 1 : 0.6,
                  }}
                >
                  <span aria-hidden className="h-2 w-2 rounded-sm" style={{ background: s.colour, filter: 'saturate(0.55)' }} />
                  {s.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Matrix */}
      <div
        role="application"
        aria-label="Channel patch matrix"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onMouseLeave={() => setHover(null)}
        className="overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-lp-orange/40"
        style={{ maxHeight: 'min(70vh, 640px)', border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-md)', userSelect: 'none' }}
      >
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 11 }}>
          <thead>
            {/* Group header — box/snake label spanning its sockets. */}
            <tr>
              <th
                rowSpan={2}
                style={{ position: 'sticky', left: 0, top: 0, zIndex: 5, width: CH_W, minWidth: CH_W, background: 'var(--lp-panel)', textAlign: 'left', padding: '4px 10px', borderBottom: '1px solid var(--lp-border-strong)', borderRight: '1px solid var(--lp-border-strong)', fontSize: 10, fontWeight: 700, color: 'var(--lp-text-tertiary)' }}
              >
                Channel · socket
              </th>
              {strips.map((strip) => (
                <th
                  key={`${strip.kind}:${strip.id}`}
                  colSpan={strip.capacity}
                  style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--lp-panel)', padding: '3px 6px', borderBottom: '1px solid var(--lp-border-subtle)', borderLeft: '2px solid var(--lp-border-strong)', textAlign: 'left', whiteSpace: 'nowrap' }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--lp-text-secondary)' }}>
                    <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: strip.colour, filter: 'saturate(0.55)' }} />
                    {strip.label}
                  </span>
                </th>
              ))}
            </tr>
            {/* Socket-position header. */}
            <tr>
              {sockets.map((s) => {
                const isCol = hover?.c === s.col || cursor.c === s.col;
                return (
                  <th
                    key={s.col}
                    style={{ position: 'sticky', top: 22, zIndex: 2, width: CELL, minWidth: CELL, background: isCol ? 'color-mix(in srgb, var(--lp-orange) 10%, var(--lp-panel))' : 'var(--lp-panel)', padding: 0, borderBottom: '1px solid var(--lp-border-strong)', borderLeft: s.pos === 1 ? '2px solid var(--lp-border-strong)' : '1px solid var(--lp-border-subtle)', fontSize: 8.5, fontWeight: 600, color: 'var(--lp-text-tertiary)', textAlign: 'center', fontFamily: 'var(--lp-font-numeric)' }}
                    title={`${s.strip.label}${s.pos}`}
                  >
                    {s.pos}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {channels.map((ch, r) => {
              const isRow = hover?.r === r || cursor.r === r;
              return (
                <tr key={ch.id}>
                  <td
                    style={{ position: 'sticky', left: 0, zIndex: 1, width: CH_W, minWidth: CH_W, background: isRow ? 'color-mix(in srgb, var(--lp-orange) 8%, var(--lp-surface))' : 'var(--lp-surface)', padding: '2px 10px', borderBottom: '1px solid var(--lp-border-subtle)', borderRight: '1px solid var(--lp-border-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: CH_W }}
                    title={channelLabel(ch)}
                  >
                    <span style={{ fontFamily: 'var(--lp-font-numeric)', color: 'var(--lp-text-tertiary)' }}>{ch.row_index}</span>
                    <span style={{ color: 'var(--lp-text)' }}>{`  ${ch.channel_name || 'Untitled'}`}</span>
                  </td>
                  {sockets.map((s) => {
                    const c = s.col;
                    const patched = rowCol.get(r) === c;
                    const conflict = patched && (colCount.get(c) ?? 0) > 1;
                    const isCursor = cursor.r === r && cursor.c === c;
                    const inCross = hover?.r === r || hover?.c === c;
                    const inPreview = previewKeys.has(`${r}:${c}`);
                    return (
                      <td
                        key={c}
                        onMouseDown={(e) => { e.preventDefault(); setCursor({ r, c }); setDrag({ anchor: { r, c }, cursor: { r, c } }); }}
                        onMouseEnter={() => { setHover({ r, c }); setDrag((d) => (d ? { ...d, cursor: { r, c } } : null)); }}
                        style={{
                          width: CELL, minWidth: CELL, height: CELL, textAlign: 'center', cursor: 'pointer',
                          borderBottom: '1px solid var(--lp-border-subtle)',
                          borderLeft: s.pos === 1 ? '2px solid var(--lp-border-strong)' : '1px solid var(--lp-border-subtle)',
                          background: inPreview
                            ? 'color-mix(in srgb, var(--lp-orange) 30%, transparent)'
                            : conflict
                              ? 'color-mix(in srgb, var(--lp-error) 26%, transparent)'
                              : patched
                                ? 'color-mix(in srgb, var(--lp-orange) 22%, transparent)'
                                : inCross
                                  ? 'color-mix(in srgb, var(--lp-orange) 6%, transparent)'
                                  : 'transparent',
                          boxShadow: isCursor ? 'inset 0 0 0 2px var(--lp-orange)' : undefined,
                        }}
                        title={`${channelLabel(ch)} → ${s.strip.label}${s.pos}${conflict ? ' — CONFLICT' : ''}`}
                      >
                        {patched ? (
                          <span aria-hidden style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: conflict ? 'var(--lp-error)' : 'var(--lp-orange)' }} />
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-lp-text-tertiary">
        Click a cell to patch (click again to unpatch) · drag a diagonal to patch a run · arrows + Enter · orange = patched, red = conflict.
      </p>

      {confirmClear && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Clear all patches"
          onClick={() => setConfirmClear(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: 16 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 380, borderRadius: 'var(--lp-radius-lg)', border: '1px solid var(--lp-border-strong)', background: 'var(--lp-surface)', padding: 20 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--lp-text)' }}>Clear all patches?</h3>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--lp-text-secondary)', lineHeight: 1.45 }}>
              Every channel returns to unpatched. Channel numbers and names are untouched.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button type="button" onClick={() => setConfirmClear(false)} style={{ border: 0, cursor: 'pointer', borderRadius: 'var(--lp-radius-md)', padding: '7px 14px', fontSize: 13, color: 'var(--lp-text-secondary)', background: 'transparent' }}>Cancel</button>
              <button type="button" onClick={doClearAll} style={{ border: 0, cursor: 'pointer', borderRadius: 'var(--lp-radius-md)', padding: '7px 14px', fontSize: 13, fontWeight: 600, background: 'var(--lp-error)', color: 'var(--lp-text-inverse, #fff)' }}>Clear patch</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

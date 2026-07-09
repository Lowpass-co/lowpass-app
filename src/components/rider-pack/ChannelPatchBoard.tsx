'use client';

/* ============================================
   LOWPASS — Channel-list PATCH MODE (VIS-CL-07)

   A dLive/LV1-style patch surface. Stage boxes and sub-snakes render as
   vertical socket strips (A1–A16, B1–B8…). Each socket shows the channel
   currently assigned there (READ from existing channel_list_rows +
   stage_boxes / sub_snakes — no new tables). Unpatched channels queue on the
   left. Click-channel → click-socket (or drag) to patch; "Patch in order"
   fills empty sockets sequentially; arrows move the socket cursor + Enter
   assigns the selected channel.

   HUE BUDGET (locked): orange = the selected channel / socket / cursor ONLY.
   Strip headers carry the box colour (desaturated to match the grid stripes).

   DATA-WRITE SAFETY: patching is SURGICAL. Each assignment is one
   updateRow(channelId, patch) writing ONLY the socket-family columns:
     · stage box socket  → { stage_box_id, stage_box_position }
     · sub-snake socket  → { sub_snake_id, sub_snake_position }
   Unpatch nulls the same two columns. row_index (the channel number) is NEVER
   written here — patching assigns a physical socket, it does not renumber.
   No output_* columns and no other channel's row are ever touched.
   ============================================ */

import { useMemo, useState } from 'react';
import type { ChannelListRow, StageBox, SubSnake } from '@/lib/rider-packs/types';

/** The only columns patch mode ever writes — a strict subset of RowPatch. */
export type SocketPatch = {
  stage_box_id?: string | null;
  stage_box_position?: number | null;
  sub_snake_id?: string | null;
  sub_snake_position?: number | null;
};

type StripKind = 'box' | 'snake';
type Strip = { kind: StripKind; id: string; label: string; colour: string; capacity: number };
type Socket = { strip: Strip; pos: number };

export function ChannelPatchBoard({
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
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);

  const strips = useMemo<Strip[]>(
    () => [
      ...stageBoxes
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((b) => ({ kind: 'box' as const, id: b.id, label: b.label, colour: b.colour, capacity: b.capacity })),
      ...subSnakes
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((s) => ({ kind: 'snake' as const, id: s.id, label: s.label, colour: s.colour, capacity: s.capacity })),
    ],
    [stageBoxes, subSnakes],
  );

  /** Flattened socket list — the keyboard cursor indexes into this. */
  const sockets = useMemo<Socket[]>(
    () => strips.flatMap((strip) => Array.from({ length: strip.capacity }, (_, i) => ({ strip, pos: i + 1 }))),
    [strips],
  );

  const occupantsOf = (kind: StripKind, id: string, pos: number): ChannelListRow[] =>
    rows.filter((r) =>
      kind === 'box'
        ? r.stage_box_id === id && r.stage_box_position === pos
        : r.sub_snake_id === id && r.sub_snake_position === pos,
    );

  /** Unpatched = assigned to neither a box nor a snake socket. */
  const queue = useMemo(
    () =>
      rows
        .filter((r) => r.stage_box_id == null && r.sub_snake_id == null)
        .sort((a, b) => a.row_index - b.row_index),
    [rows],
  );

  const patchFor = (strip: Strip, pos: number): SocketPatch =>
    strip.kind === 'box'
      ? { stage_box_id: strip.id, stage_box_position: pos }
      : { sub_snake_id: strip.id, sub_snake_position: pos };

  const assign = (strip: Strip, pos: number, channelId: string) => {
    onPatch(channelId, patchFor(strip, pos));
    setSelectedChannelId(null);
  };

  const unpatch = (channel: ChannelListRow, kind: StripKind) => {
    onPatch(
      channel.id,
      kind === 'box'
        ? { stage_box_id: null, stage_box_position: null }
        : { sub_snake_id: null, sub_snake_position: null },
    );
  };

  const onSocketActivate = (socketIndex: number) => {
    setCursor(socketIndex);
    const { strip, pos } = sockets[socketIndex];
    if (selectedChannelId) {
      assign(strip, pos, selectedChannelId);
      return;
    }
    // Nothing selected → pick up the occupant (if any) so the next click moves it.
    const occ = occupantsOf(strip.kind, strip.id, pos);
    if (occ[0]) setSelectedChannelId(occ[0].id);
  };

  /** Fill every currently-empty socket from the queue, in order. */
  const patchInOrder = () => {
    const empties = sockets.filter((s) => occupantsOf(s.strip.kind, s.strip.id, s.pos).length === 0);
    let qi = 0;
    for (const sock of empties) {
      if (qi >= queue.length) break;
      onPatch(queue[qi].id, patchFor(sock.strip, sock.pos));
      qi += 1;
    }
    setSelectedChannelId(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (sockets.length === 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, sockets.length - 1));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedChannelId) {
        const { strip, pos } = sockets[cursor];
        assign(strip, pos, selectedChannelId);
      }
    } else if (e.key === 'Escape') {
      setSelectedChannelId(null);
    }
  };

  const channelLabel = (c: ChannelListRow) => `${c.row_index}. ${c.channel_name || 'Untitled'}`;

  if (strips.length === 0) {
    return (
      <div className="border-t border-lp-border bg-lp-surface px-4 py-8 text-center text-xs text-lp-text-tertiary">
        No stage boxes or sub-snakes yet. Add one via <span className="font-semibold">Manage stage I/O</span> or{' '}
        <span className="font-semibold">Manage sub-snakes</span> to open the patch board.
      </div>
    );
  }

  let socketIndex = -1;

  return (
    <div
      role="application"
      aria-label="Channel patch board"
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="grid grid-cols-[minmax(11rem,15rem)_1fr] gap-3 border-t border-lp-border bg-lp-surface p-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-lp-orange/40"
    >
      {/* ---- Unpatched queue ---- */}
      <div className="min-w-0">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-lp-text-tertiary">
            Unpatched ({queue.length})
          </span>
          <button
            type="button"
            onClick={patchInOrder}
            disabled={queue.length === 0}
            className="rounded border border-lp-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-lp-text-secondary hover:bg-lp-surface-hover disabled:opacity-40"
          >
            Patch in order
          </button>
        </div>
        <div className="flex max-h-[min(60vh,560px)] flex-col gap-1 overflow-y-auto pr-1">
          {queue.length === 0 && (
            <div className="rounded border border-dashed border-lp-border px-2 py-4 text-center text-[11px] text-lp-text-tertiary">
              All channels patched.
            </div>
          )}
          {queue.map((c) => {
            const selected = c.id === selectedChannelId;
            return (
              <button
                key={c.id}
                type="button"
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/plain', c.id)}
                onClick={() => setSelectedChannelId(selected ? null : c.id)}
                className="truncate rounded border px-2 py-1.5 text-left text-xs"
                style={{
                  borderColor: selected ? 'var(--color-lp-orange)' : 'var(--lp-border)',
                  background: selected ? 'color-mix(in srgb, var(--color-lp-orange) 12%, transparent)' : 'var(--lp-bg)',
                  color: 'var(--lp-text)',
                }}
                title={channelLabel(c)}
              >
                {channelLabel(c)}
              </button>
            );
          })}
        </div>
      </div>

      {/* ---- Socket strips ---- */}
      <div className="min-w-0 overflow-x-auto">
        <div className="flex gap-3">
          {strips.map((strip) => (
            <div key={`${strip.kind}:${strip.id}`} className="shrink-0">
              <div className="mb-1.5 flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: strip.colour, filter: 'saturate(0.55)' }}
                />
                <span className="text-[10px] font-bold uppercase tracking-wider text-lp-text-secondary">
                  {strip.label}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {Array.from({ length: strip.capacity }, (_, i) => {
                  socketIndex += 1;
                  const myIndex = socketIndex;
                  const pos = i + 1;
                  const occ = occupantsOf(strip.kind, strip.id, pos);
                  const conflict = occ.length > 1;
                  const isCursor = myIndex === cursor;
                  const occSelected = occ.some((o) => o.id === selectedChannelId);
                  const border = conflict
                    ? 'var(--lp-error)'
                    : isCursor || occSelected
                      ? 'var(--color-lp-orange)'
                      : 'var(--lp-border)';
                  return (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => onSocketActivate(myIndex)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const id = e.dataTransfer.getData('text/plain');
                        if (id) assign(strip, pos, id);
                      }}
                      className="flex h-8 w-40 items-center gap-1.5 rounded border px-1.5 text-left text-[11px]"
                      style={{
                        borderColor: border,
                        borderWidth: conflict || isCursor || occSelected ? 2 : 1,
                        background: 'var(--lp-bg)',
                        color: 'var(--lp-text)',
                      }}
                      title={
                        conflict
                          ? `Conflict: ${occ.map(channelLabel).join(' / ')}`
                          : occ[0]
                            ? channelLabel(occ[0])
                            : `Empty socket ${strip.label}${pos}`
                      }
                    >
                      <span className="w-8 shrink-0 font-mono text-[10px] text-lp-text-tertiary">
                        {strip.label}
                        {pos}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {conflict ? (
                          <span style={{ color: 'var(--lp-error)' }}>⚠ {occ.length} channels</span>
                        ) : occ[0] ? (
                          channelLabel(occ[0])
                        ) : (
                          <span className="text-lp-text-tertiary">—</span>
                        )}
                      </span>
                      {occ[0] && (
                        <span
                          role="button"
                          tabIndex={-1}
                          aria-label="Unpatch"
                          onClick={(e) => {
                            e.stopPropagation();
                            occ.forEach((o) => unpatch(o, strip.kind));
                          }}
                          className="shrink-0 rounded px-1 text-lp-text-tertiary hover:text-lp-error"
                        >
                          ×
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-lp-text-tertiary">
          Click a channel then a socket to patch — or drag. Arrows move the cursor; Enter assigns the selected
          channel. Orange = selection; red = conflict.
        </p>
      </div>
    </div>
  );
}

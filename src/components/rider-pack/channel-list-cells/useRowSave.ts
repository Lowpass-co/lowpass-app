'use client';

/* ============================================
   LOWPASS — useRowSave (§CL-5)

   The debounced per-row writer behind both ChannelBlock and
   OutputBlock. It exists as one hook because the two had the same
   twenty lines copy-pasted, and therefore the same three bugs.

   Adam's report was "populate wrong and then load later" — he types
   into a cell, and a moment later the old value is back.

   WHAT WAS WRONG

   1. The buffer was cleared BEFORE the await:

          const p = { ...patchRef.current };
          patchRef.current = {};          // <- here
          await ch.updateRow(...)

      so if the request failed, the edit was simply gone. No retry,
      no rollback, no toast, no console line — the promise rejection
      went into `void saveRow.flush()` and vanished. Silent data loss
      on a live tour. Worse, the throw escaped useDebouncedSave's
      drain loop, which leaves stagedRef set forever: isPending()
      then stays true for the life of the component and the row stops
      accepting server data at all.

      Now the buffer is held until the write RESOLVES, and only the
      keys the write actually carried are cleared — and only where
      they have not been retyped since, so a keystroke landing
      mid-flight survives instead of being swallowed by its own
      save's acknowledgement.

   2. `if (saveRow.isPending()) return` was the only guard on
      accepting a fresh `row` prop, and isPending() goes false the
      instant the drain resolves. A row fetched BEFORE the write but
      arriving AFTER it therefore won, and put the pre-edit value
      straight back on screen. That is exactly the reported symptom.

      The guard is now three conditions — nothing in flight, nothing
      buffered, nothing scheduled — and its other half lives in the
      parent: ChannelListEditor's refetchLocal will not START a read
      while any row write is outstanding, and drops its own result if
      a newer refetch overtook it. That is what onWriteActive is for.
      A guard on the writer alone cannot close this, because the
      stale read is issued by someone else.

   3. Failures were invisible. They now surface through onError, the
      buffer survives them, and one retry is attempted after a short
      pause — enough to ride out the kind of blip a tour bus gets,
      and bounded so a genuine schema error cannot spin.
   ============================================ */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import { createClient } from '@/lib/supabase-client';
import * as ch from '@/lib/rider-packs/channel-list';
import type { ChannelListRow } from '@/lib/rider-packs/types';

/** How long to wait before the single retry of a failed write. */
const RETRY_MS = 1500;

type Options = {
  row: ChannelListRow;
  /** Push the optimistic row up to the grid's shared state. */
  onUpdateLocal: (r: ChannelListRow) => void;
  /**
   * Called with `true` the moment this row has unsaved or in-flight
   * data, and with `false` only once it is fully settled. The parent
   * uses it to hold off refetches that would otherwise read around
   * the write. Need not be referentially stable — it is held in a ref.
   */
  onWriteActive?: (rowId: string, active: boolean) => void;
  /** Surface a failed write to the operator. */
  onError?: (message: string) => void;
  delayMs?: number;
};

export type RowSave = {
  /** The optimistic row — what the inputs render. */
  local: ChannelListRow;
  /** Stage a field change: updates `local`, notifies the parent, debounces the write. */
  queue: (patch: Partial<ChannelListRow>) => void;
  /** Write anything staged right now (blur, commit, close). */
  flush: () => Promise<void>;
};

export function useRowSave({
  row,
  onUpdateLocal,
  onWriteActive,
  onError,
  delayMs = 400,
}: Options): RowSave {
  const rowId = row.id;
  const patchRef = useRef<Partial<ChannelListRow>>({});
  const inFlightRef = useRef(0);
  const retriedRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* Declared here so the saveFn below can re-schedule ITSELF for the
     retry — it cannot close over `saveRow`, which the hook returns. */
  const saveRowRef = useRef<{ schedule: (value: number) => void } | null>(null);

  /* Callbacks live in a ref: useDebouncedSave cancels any pending
     save when its saveFn identity changes, so the saveFn must not
     depend on props that change every render. */
  const cbRef = useRef({ onUpdateLocal, onWriteActive, onError });
  useEffect(() => {
    cbRef.current = { onUpdateLocal, onWriteActive, onError };
  }, [onUpdateLocal, onWriteActive, onError]);

  /** Dirty = something typed and not yet acknowledged by the server. */
  const isDirty = useCallback(
    () => inFlightRef.current > 0 || Object.keys(patchRef.current).length > 0,
    [],
  );

  const saveRow = useDebouncedSave<number>(
    useCallback(
      async (_tick: number) => {
        void _tick;
        const sent = { ...patchRef.current };
        const keys = Object.keys(sent);
        if (keys.length === 0) return;

        inFlightRef.current += 1;
        cbRef.current.onWriteActive?.(rowId, true);
        try {
          await ch.updateRow(createClient(), rowId, sent);
          /* Clear only what this write carried, and only where the
             operator has not typed over it since it left. */
          const buffer = patchRef.current as Record<string, unknown>;
          const written = sent as Record<string, unknown>;
          for (const k of keys) {
            if (Object.is(buffer[k], written[k])) delete buffer[k];
          }
          retriedRef.current = false;
        } catch (err) {
          /* The buffer is deliberately untouched — the edit is still
             here, so nothing is lost even if every retry fails. */
          cbRef.current.onError?.(
            err instanceof Error ? err.message : 'Could not save this row — your change is still here',
          );
          if (!retriedRef.current) {
            retriedRef.current = true;
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
            retryTimerRef.current = setTimeout(() => {
              retryTimerRef.current = null;
              if (Object.keys(patchRef.current).length > 0) saveRowRef.current?.schedule(0);
            }, RETRY_MS);
          }
        } finally {
          inFlightRef.current -= 1;
          cbRef.current.onWriteActive?.(rowId, isDirty());
        }
      },
      [rowId, isDirty],
    ),
    delayMs,
  );

  useEffect(() => {
    saveRowRef.current = saveRow;
  }, [saveRow]);

  useEffect(
    () => () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    },
    [],
  );

  const [local, setLocal] = useState(row);
  useEffect(() => {
    /* §CL-5 — accept server data ONLY when this row is completely
       settled. isPending() alone was not enough: it goes false the
       moment the drain resolves, so a read issued before the write
       could still land after it and undo the edit. */
    if (inFlightRef.current > 0) return;
    if (Object.keys(patchRef.current).length > 0) return;
    if (saveRow.isPending()) return;
    setLocal(row);
  }, [row, saveRow]);

  const queue = useCallback(
    (patch: Partial<ChannelListRow>) => {
      patchRef.current = { ...patchRef.current, ...patch };
      cbRef.current.onWriteActive?.(rowId, true);
      setLocal((l) => {
        const n = { ...l, ...patch } as ChannelListRow;
        cbRef.current.onUpdateLocal(n);
        return n;
      });
      saveRow.schedule(0);
    },
    [rowId, saveRow],
  );

  return { local, queue, flush: saveRow.flush };
}

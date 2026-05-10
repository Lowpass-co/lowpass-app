'use client';

/* ============================================
   LOWPASS — useAutoSave (Sprint 10 §3)

   Generic auto-save hook for the multi-field edit slide-overs.
   Pattern:

     1. Slide-over opens → caller passes `initialState` (a
        snapshot of the entity's current shape from the server).
     2. User edits fields → caller calls `set(next)` (or a
        functional updater). The hook stores the new state +
        schedules a debounced save (default 600ms).
     3. The save handler (caller-supplied async fn) runs. The
        hook tracks status: 'idle' → 'saving' → 'saved' / 'error'.
     4. User clicks Cancel (in caller's footer) → caller invokes
        `cancel()` which fires one final PATCH that restores the
        snapshot, then the slide-over closes.

   Returned API:
     {
       state          : the current edited state
       set            : updater (value or fn(prev) => next)
       status         : 'idle' | 'saving' | 'saved' | 'error'
       lastSavedAt    : Date | null — used by <SaveStatus> to
                        format "Saved 12s ago"
       errorMessage   : string | null — present when status='error'
       cancel         : async () => void — restores snapshot,
                        flushes one PATCH, then resolves so the
                        caller can close the slide-over
       flushSave      : async () => void — force any pending
                        debounced save to run NOW. Call before
                        explicit "Save & close" buttons.
     }

   Notes:
     - The hook is generic over T (the shape of the editable
       state). T must be an object — the caller controls
       diffing / no-op detection. If `set` is called with the
       same reference, it still triggers a save (callers should
       use functional updaters or compare before calling).
     - The save handler is called with the LATEST state at
       fire time, not the state at scheduling time. This avoids
       stale-state writes when the user keeps typing.
     - Concurrent saves are serialised: if a save is in flight
       and another fires, the second waits for the first to
       resolve before starting.
   ============================================ */

import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UseAutoSaveOptions<T> {
  /** Snapshot of the entity at slide-over open time. The hook
   *  owns the initial state internally; updates to
   *  initialState after first render are ignored — caller
   *  should remount the consumer (e.g. via a `key` change) to
   *  swap entities. */
  initialState: T;
  /** Async fn that PATCHes the entity. Receives the latest
   *  edited state. Throw on failure — the hook flips status
   *  to 'error' and stores the message. */
  onSave: (state: T) => Promise<void>;
  /** Debounce window after the last `set` call before the save
   *  fires. Default 600ms per spec. */
  debounceMs?: number;
}

export interface UseAutoSaveResult<T> {
  state: T;
  set: (next: T | ((prev: T) => T)) => void;
  status: SaveStatus;
  lastSavedAt: Date | null;
  errorMessage: string | null;
  cancel: () => Promise<void>;
  flushSave: () => Promise<void>;
}

export function useAutoSave<T>({
  initialState,
  onSave,
  debounceMs = 600,
}: UseAutoSaveOptions<T>): UseAutoSaveResult<T> {
  const [state, setState] = useState<T>(initialState);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Snapshot lives in a ref so cancel() can fire the restore
  // PATCH without the snapshot being captured into render-time
  // closures.
  const snapshotRef = useRef<T>(initialState);
  // Latest state, also in a ref so the deferred save uses
  // fresh data.
  const stateRef = useRef<T>(initialState);
  const onSaveRef = useRef(onSave);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Serialise saves: each save awaits the previous one's
  // promise so concurrent fires don't interleave.
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const runSave = useCallback(async () => {
    const prev = saveChainRef.current;
    const next = (async () => {
      await prev.catch(() => undefined);
      setStatus('saving');
      setErrorMessage(null);
      try {
        await onSaveRef.current(stateRef.current);
        setStatus('saved');
        setLastSavedAt(new Date());
      } catch (err) {
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'Save failed');
      }
    })();
    saveChainRef.current = next;
    await next;
  }, []);

  const set = useCallback(
    (nextOrUpdater: T | ((prev: T) => T)) => {
      setState((prev) => {
        const next =
          typeof nextOrUpdater === 'function'
            ? (nextOrUpdater as (p: T) => T)(prev)
            : nextOrUpdater;
        stateRef.current = next;
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
          void runSave();
        }, debounceMs);
        return next;
      });
    },
    [debounceMs, runSave],
  );

  const flushSave = useCallback(async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    await runSave();
  }, [runSave]);

  const cancel = useCallback(async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    /* Restore snapshot (the entity's pre-edit state) by saving
       it back. Caller's onSave PATCHes whatever shape it
       expects — passing the snapshot through it is the
       cleanest revert path. */
    stateRef.current = snapshotRef.current;
    setState(snapshotRef.current);
    await runSave();
  }, [runSave]);

  // Cleanup pending timer on unmount.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  return { state, set, status, lastSavedAt, errorMessage, cancel, flushSave };
}

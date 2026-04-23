'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

type Options = {
  /** Delay before firing the save after the last call (ms). */
  delay?: number;
  /** If set, after this many ms the "saved" indicator reverts to "idle". */
  savedHoldMs?: number;
};

/**
 * Debounces an async save function. Returns:
 *  - `schedule(payload)` — call this on every change; the save fires after
 *    `delay` ms of inactivity. Partials for the same T are merged (shallow).
 *  - `flush()` — fire the pending save immediately (e.g. on blur, on unmount).
 *  - `state` — current save state, for rendering a pill indicator.
 *  - `error` — last error message, if state is 'error'.
 *
 * The hook coalesces the LATEST merged payload. If a new call arrives mid-save,
 * the save re-fires with the latest payload after the in-flight one completes.
 */
export function useDebouncedSave<T extends object>(
  saveFn: (payload: T) => Promise<void>,
  options: Options = {},
) {
  const { delay = 800, savedHoldMs = 1500 } = options;
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<T | null>(null);
  const inFlightRef = useRef(false);
  const saveFnRef = useRef(saveFn);
  // Keep saveFnRef current without re-triggering the debounce.
  useEffect(() => {
    saveFnRef.current = saveFn;
  }, [saveFn]);

  const runSaveRef = useRef<() => Promise<void>>(async () => {});

  const runSave = useCallback(async () => {
    if (inFlightRef.current) return;
    const pending = pendingRef.current;
    if (pending === null) return;
    if (Object.keys(pending).length === 0) {
      pendingRef.current = null;
      return;
    }
    inFlightRef.current = true;
    setState('saving');
    setError(null);
    const toSave: T = { ...pending };
    pendingRef.current = null;
    try {
      await saveFnRef.current(toSave);
      inFlightRef.current = false;
      if (pendingRef.current !== null && Object.keys(pendingRef.current).length > 0) {
        void runSaveRef.current();
        return;
      }
      setState('saved');
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setState('idle'), savedHoldMs);
    } catch (err) {
      inFlightRef.current = false;
      setState('error');
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }, [savedHoldMs]);

  useLayoutEffect(() => {
    runSaveRef.current = runSave;
  }, [runSave]);

  const schedule = useCallback(
    (payload: T) => {
      pendingRef.current = {
        ...(pendingRef.current ?? ({} as T)),
        ...payload,
      } as T;
      setState('pending');
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void runSave();
      }, delay);
    },
    [delay, runSave],
  );

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await runSave();
  }, [runSave]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      void runSaveRef.current();
    };
  }, []);

  return { schedule, flush, state, error };
}

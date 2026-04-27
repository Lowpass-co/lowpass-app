'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';

export type DebouncedSave<T> = {
  schedule: (value: T) => void;
  flush: () => Promise<void>;
  cancel: () => void;
  isPending: () => boolean;
};

/**
 * Debounced async save. schedule(value) debounces; when the timer fires, a single
 * drain run processes staged values until none remain, including values that
 * arrive while a save is in flight.
 */
export function useDebouncedSave<T>(saveFn: (value: T) => Promise<void>, delayMs: number = 400): DebouncedSave<T> {
  const saveFnRef = useRef(saveFn);
  const delayRef = useRef(delayMs);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stagedRef = useRef<T | undefined>(undefined);
  const activeDrainRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    saveFnRef.current = saveFn;
  }, [saveFn]);

  useEffect(() => {
    delayRef.current = delayMs;
  }, [delayMs]);

  const runDrain = useCallback((): Promise<void> => {
    if (activeDrainRef.current) {
      return activeDrainRef.current;
    }
    const p = (async () => {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const v = stagedRef.current;
        if (v === undefined) break;
        await saveFnRef.current(v);
        if (stagedRef.current === v) {
          stagedRef.current = undefined;
        }
      }
    })().finally(() => {
      activeDrainRef.current = null;
    });
    activeDrainRef.current = p;
    return p;
  }, []);

  const schedule = useCallback(
    (value: T) => {
      stagedRef.current = value;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (activeDrainRef.current) {
        return;
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void runDrain();
      }, delayRef.current);
    },
    [runDrain],
  );

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!activeDrainRef.current) {
      stagedRef.current = undefined;
    }
  }, []);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await runDrain();
  }, [runDrain]);

  const isPending = useCallback(() => {
    return timerRef.current !== null || activeDrainRef.current !== null || stagedRef.current !== undefined;
  }, []);

  useEffect(
    () => () => {
      cancel();
    },
    [cancel],
  );

  const prevSaveFn = useRef(saveFn);
  useEffect(() => {
    if (prevSaveFn.current !== saveFn) {
      prevSaveFn.current = saveFn;
      cancel();
    }
  }, [saveFn, cancel]);

  return useMemo(
    () => ({ schedule, flush, cancel, isPending }),
    [schedule, flush, cancel, isPending],
  );
}

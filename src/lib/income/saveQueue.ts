/* ============================================
   LOWPASS — one save line per show (Nov 2026, Adam)

   Adam: "I edit, it takes a while to show up, but if I edit before the new
   thing displays, it overwrites it."

   /api/budget/income reads the whole row, merges ONE field and writes the
   whole row back; the settlement route writes actual_* onto that same row.
   Two saves for one show in flight at once → the later write puts back the
   earlier field's old value. So every write for a show goes through ONE
   queue, strictly in order, and edits made while a save is out are folded
   into the next one (`patch`) instead of racing it.

   Pure — no React. The page applies edits to its own state at once and uses
   `pending()` to lay not-yet-sent edits over whatever a save returns.
   ============================================ */

type Task<T> = () => Promise<T>;

export interface SaveQueue {
  /** Run `task` after everything already queued for `key`. */
  run<T>(key: string, task: Task<T>): Promise<T>;
  /** Fold `patch` into the next save of `key`/`kind`; `send` gets every
   *  field folded in since the last send started. Resolves with its result. */
  patch<T>(key: string, kind: string, patch: Record<string, unknown>, send: (all: Record<string, unknown>) => Promise<T>): Promise<T>;
  /** Fields folded in but not sent yet (for laying over a save's answer). */
  pending(key: string, kind: string): Record<string, unknown> | null;
  /** Tasks queued or running, across all keys. */
  size(): number;
}

export function createSaveQueue(onSize?: (n: number) => void): SaveQueue {
  const tails = new Map<string, Promise<unknown>>();
  const buffers = new Map<string, { fields: Record<string, unknown>; result: Promise<unknown> }>();
  let count = 0;
  const bump = (d: number) => {
    count += d;
    onSize?.(count);
  };

  function run<T>(key: string, task: Task<T>): Promise<T> {
    const prev = tails.get(key) ?? Promise.resolve();
    bump(1);
    const next = prev.then(task, task).finally(() => bump(-1));
    // The chain never rejects, so one failed save doesn't stop the next.
    const tail = next.catch(() => undefined);
    tails.set(key, tail);
    void tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key);
    });
    return next;
  }

  function patch<T>(key: string, kind: string, fields: Record<string, unknown>, send: (all: Record<string, unknown>) => Promise<T>): Promise<T> {
    const id = `${key}\u0000${kind}`;
    const open = buffers.get(id);
    if (open) {
      Object.assign(open.fields, fields);
      return open.result as Promise<T>;
    }
    const entry = { fields: { ...fields }, result: Promise.resolve() as Promise<unknown> };
    entry.result = run(key, () => {
      // From here on, new edits start a new buffer (the next save).
      if (buffers.get(id) === entry) buffers.delete(id);
      return send(entry.fields);
    });
    buffers.set(id, entry);
    return entry.result as Promise<T>;
  }

  return {
    run,
    patch,
    pending: (key, kind) => buffers.get(`${key}\u0000${kind}`)?.fields ?? null,
    size: () => count,
  };
}

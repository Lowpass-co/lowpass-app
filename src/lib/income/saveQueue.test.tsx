import { describe, expect, it } from 'vitest';
import { createSaveQueue } from './saveQueue';

const later = () => {
  let resolve!: () => void;
  const p = new Promise<void>((r) => (resolve = r));
  return { p, resolve };
};

describe('one save line per show', () => {
  it('runs one show’s saves strictly in order, never two at once', async () => {
    const q = createSaveQueue();
    const log: string[] = [];
    const a = later();
    const first = q.run('show', async () => {
      log.push('a start');
      await a.p;
      log.push('a end');
    });
    const second = q.run('show', async () => void log.push('b'));
    await Promise.resolve();
    expect(log).toEqual(['a start']);
    a.resolve();
    await Promise.all([first, second]);
    expect(log).toEqual(['a start', 'a end', 'b']);
  });

  it('Adam’s race: an edit typed while a save is out goes in the NEXT save, with nothing lost', async () => {
    // The income route rewrites the whole row from what it read; two saves
    // in flight used to put the first field's old value back.
    const q = createSaveQueue();
    const sent: Record<string, unknown>[] = [];
    const a = later();
    const send = async (all: Record<string, unknown>) => {
      sent.push({ ...all });
      if (sent.length === 1) await a.p;
    };
    const p1 = q.patch('show', 'income', { pre_tax_guarantee: 4500 }, send);
    await Promise.resolve();
    // Typed while the first save is out — folded together, not raced.
    const p2 = q.patch('show', 'income', { withholding_pct: 37 }, send);
    const p3 = q.patch('show', 'income', { face_value: 55 }, send);
    expect(p2).toBe(p3);
    expect(q.pending('show', 'income')).toEqual({ withholding_pct: 37, face_value: 55 });
    a.resolve();
    await Promise.all([p1, p2]);
    expect(sent).toEqual([{ pre_tax_guarantee: 4500 }, { withholding_pct: 37, face_value: 55 }]);
    expect(q.pending('show', 'income')).toBeNull();
  });

  it('a failed save does not stop the next one', async () => {
    const q = createSaveQueue();
    const bad = q.run('show', async () => {
      throw new Error('nope');
    });
    const good = q.run('show', async () => 'ok');
    await expect(bad).rejects.toThrow('nope');
    await expect(good).resolves.toBe('ok');
  });

  it('different shows do not wait for each other; the count goes back to 0', async () => {
    const sizes: number[] = [];
    const q = createSaveQueue((n) => sizes.push(n));
    const a = later();
    const one = q.run('a', () => a.p);
    const two = q.run('b', async () => 'b');
    await expect(two).resolves.toBe('b');
    a.resolve();
    await one;
    expect(q.size()).toBe(0);
    expect(Math.max(...sizes)).toBe(2);
  });
});

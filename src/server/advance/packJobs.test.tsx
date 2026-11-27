import { describe, expect, it } from 'vitest';
import { PACK_JOB_STALE_MS, effectiveStatus, limiter, medianSeconds } from './packJobs';
import { readPct, waitLine } from '@/lib/advance/packWait';

describe('effectiveStatus', () => {
  const t0 = Date.parse('2026-11-26T12:00:00Z');
  it('a read past its time limit is failed, not reading for ever', () => {
    expect(effectiveStatus({ status: 'reading', created_at: new Date(t0).toISOString() }, t0 + 60_000)).toBe('reading');
    expect(effectiveStatus({ status: 'reading', created_at: new Date(t0).toISOString() }, t0 + PACK_JOB_STALE_MS + 1)).toBe('failed');
    expect(effectiveStatus({ status: 'done', created_at: new Date(t0).toISOString() }, t0 + 10 * PACK_JOB_STALE_MS)).toBe('done');
  });
});

describe('medianSeconds', () => {
  it('uses the default until there are three finished reads', () => {
    expect(medianSeconds([30_000, 40_000])).toBe(45);
    expect(medianSeconds([30_000, 40_000, 90_000])).toBe(40);
    expect(medianSeconds([10_000, 20_000, 30_000, 40_000])).toBe(25);
  });
});

describe('limiter', () => {
  it('never runs more than n at once, and runs them all', async () => {
    const slot = limiter(2);
    let active = 0;
    let peak = 0;
    const out = await Promise.all(
      Array.from({ length: 7 }, (_, i) =>
        slot(async () => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, 5));
          active -= 1;
          return i;
        }),
      ),
    );
    expect(peak).toBe(2);
    expect(out).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe('the wait line', () => {
  const start = 1_000_000;
  it('counts down from how long reads usually take, in 5 s steps', () => {
    expect(waitLine(start, start + 3_000, 40)).toBe('About 40 s left');
    expect(waitLine(start, start + 22_000, 40)).toBe('About 20 s left');
    expect(waitLine(start, start + 10_000, 150)).toBe('About 2 min left');
  });
  it('says so when it runs past, never a negative countdown', () => {
    expect(waitLine(start, start + 70_000, 40)).toBe('Taking longer than usual (1 min) — still reading');
  });
  it('the bar follows parts read, moves with time, and never reaches the end early', () => {
    expect(readPct({ done: 0, total: 4, startedAt: start }, start, 40)).toBe(4);
    expect(readPct({ done: 2, total: 4, startedAt: start }, start + 1_000, 40)).toBe(50);
    expect(readPct({ done: 0, total: 4, startedAt: start }, start + 400_000, 40)).toBeLessThan(90);
  });
});

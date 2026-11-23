/* changeTourCurrency — the ONE way a tour's currency changes (Nov 2026). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDb } from '@/test-utils/fakeSupabase';

const refresh = vi.hoisted(() => vi.fn(async () => null));
vi.mock('@/server/budget/reconcileDerivedLines', () => ({ refreshDerivedLines: refresh }));
vi.mock('@/server/budget/liveFx', () => ({ fetchLiveRate: async () => null }));

const { changeTourCurrency } = await import('./currency');

let db: FakeDb;
let calls: Array<Record<string, unknown>>;
beforeEach(() => {
  calls = [];
  refresh.mockClear();
  db = new FakeDb({
    rpc: {
      change_tour_currency: (d, a) => {
        calls.push(a);
        d.t('tours').find((t) => t.id === a.p_tour_id)!.currency = a.p_currency;
        return { data: { changed: true }, error: null };
      },
    },
  });
  db.seed('tours', [{ id: 't1', workspace_id: 'w', currency: 'GBP' }]);
});

describe('changeTourCurrency', () => {
  it('fetches a live old → new rate, restates through the database, then rebuilds the automatic lines', async () => {
    const r = await changeTourCurrency(db.client(), 't1', 'usd', { liveRate: async (f, t) => (f === 'GBP' && t === 'USD' ? 1.27 : null) });
    expect(r).toEqual({ ok: true, changed: true, from: 'GBP', to: 'USD' });
    expect(calls).toEqual([{ p_tour_id: 't1', p_currency: 'USD', p_rate: 1.27 }]);
    expect(refresh).toHaveBeenCalledWith(expect.anything(), 't1', 'w', 'all');
  });
  it('same currency → nothing written, no rate needed', async () => {
    const r = await changeTourCurrency(db.client(), 't1', 'GBP', { liveRate: async () => { throw new Error('should not fetch'); } });
    expect(r).toEqual({ ok: true, changed: false, to: 'GBP' });
    expect(calls).toHaveLength(0);
  });
  it('no live rate → refused, the tour stays as it was (no flip without restating)', async () => {
    const r = await changeTourCurrency(db.client(), 't1', 'EUR');
    expect(r).toMatchObject({ ok: false, status: 502 });
    expect(calls).toHaveLength(0);
    expect(db.t('tours')[0].currency).toBe('GBP');
  });
  it('rejects a non-code', async () => {
    expect(await changeTourCurrency(db.client(), 't1', 'dollars')).toMatchObject({ ok: false, status: 400 });
    expect(await changeTourCurrency(db.client(), 'nope', 'USD', { liveRate: async () => 1 })).toMatchObject({ ok: false, status: 404 });
  });
});

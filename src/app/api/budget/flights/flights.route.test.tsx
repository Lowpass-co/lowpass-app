/* POST /api/budget/flights — several people on one flight: one ticket (row)
   each, same details, cost per ticket, one budget refresh. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDb } from '@/test-utils/fakeSupabase';

let db: FakeDb;
const refresh = vi.fn(async () => undefined);
vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => db.client() }));
vi.mock('@/lib/auth/workspace-check', () => ({ requireWrite: async () => ({ user: { id: 'user-1' }, workspaceId: 'ws-1' }) }));
vi.mock('@/server/budget/reconcileDerivedLines', () => ({ refreshDerivedLines: refresh, tourIdForRoom: vi.fn() }));

const route = await import('./route');
const post = (body: unknown) => route.POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  db = new FakeDb();
  refresh.mockClear();
  db.seed('profiles', [{ id: 'user-1', workspace_id: 'ws-1' }]);
  db.seed('tours', [{ id: 't1', workspace_id: 'ws-1', currency: 'USD' }]);
});

describe('flights', () => {
  it('one person still makes one flight', async () => {
    const r = await post({ tour_id: 't1', person_name: 'Ann', departure_date: '2026-10-14', actual_cost: 300 });
    expect(r.status).toBe(200);
    expect(db.t('flights')).toHaveLength(1);
  });

  it('several people make one ticket each with the same details, and refresh the budget once', async () => {
    const r = await post({
      tour_id: 't1', person_names: ['Ann', 'Ben', ' ann ', 'Ben', ''], origin_code: 'bna', destination_code: 'atl',
      departure_date: '2026-10-14', departure_time: '09:10', airline: 'Delta', flight_number: 'DL100', confirmation: 'ABC123', actual_cost: 250,
    });
    expect(r.status).toBe(200);
    expect(((await r.json()) as { count: number }).count).toBe(2);
    const rows = db.t('flights');
    expect(rows.map((f) => f.person_name)).toEqual(['Ann', 'Ben']);
    for (const f of rows) {
      expect(f).toMatchObject({ origin_airport: 'BNA', destination_airport: 'ATL', flight_number: 'DL100', confirmation: 'ABC123', cost_amount: 250, cost_currency: 'USD' });
    }
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('needs someone on the flight', async () => {
    expect((await post({ tour_id: 't1', person_names: ['  '] })).status).toBe(400);
  });
});

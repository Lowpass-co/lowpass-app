/* Settlement + income routes after "one deal, one place for the night"
   (Nov 2026, Adam). */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDb } from '@/test-utils/fakeSupabase';

let db: FakeDb;
vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => db.client() }));
vi.mock('@/lib/auth/workspace-check', () => ({ requireWrite: async () => ({ userId: 'user-1' }) }));

const settlement = await import('./route');
const income = await import('../income/route');

const post = (mod: { POST: (r: Request) => Promise<Response> }, body: Record<string, unknown>) =>
  mod.POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  db = new FakeDb();
  db.seed('profiles', [{ id: 'user-1', workspace_id: 'ws' }]);
  db.seed('tours', [{ id: 't', workspace_id: 'ws', currency: 'USD' }]);
  db.seed('routing', [{ id: 'r', tour_id: 't', date: '2026-11-01', day_type: 'show' }]);
});

describe('settlement POST', () => {
  it('a save without a status leaves a reconciled show reconciled (it used to reset to pending)', async () => {
    db.seed('settlement', [{ id: 's', routing_id: 'r', workspace_id: 'ws', status: 'reconciled', full_and_final: true }]);
    const res = await post(settlement, { routing_id: 'r', deposit_received: 500 });
    expect(res.status).toBe(200);
    expect(db.t('settlement')[0]).toMatchObject({ status: 'reconciled', deposit_received: 500 });
  });

  it('the old deal terms are not written any more — the deal lives on the income row', async () => {
    await post(settlement, { routing_id: 'r', deal_type: 'door_deal', deal_pct: 80, bonus_pct: 10, ticket_price: 40, comps: 12 });
    const s = db.t('settlement')[0];
    expect(s.comps).toBe(12);
    expect(s.deal_type).toBeUndefined();
    expect(s.deal_pct).toBeUndefined();
    expect(s.bonus_pct).toBeUndefined();
    expect(s.ticket_price).toBeUndefined();
  });

  it('the night carries to the income row', async () => {
    await post(settlement, { routing_id: 'r', reconciled_guarantee: 9000, reconciled_merch: 700 });
    expect(db.t('budget_income')[0]).toMatchObject({ actual_guarantee: 9000, actual_merch: 700, actuals_source: 'settlement' });
  });
});

describe('income POST', () => {
  it('stores the one deal list; old words are mapped; anything else is refused', async () => {
    expect((await post(income, { routing_id: 'r', deal_type: 'door_deal' })).status).toBe(200);
    expect(db.t('budget_income')[0].deal_type).toBe('DOOR');
    expect((await post(income, { routing_id: 'r', deal_type: 'festival' })).status).toBe(200);
    expect(db.t('budget_income')[0].deal_type).toBe('FLAT');
    const bad = await post(income, { routing_id: 'r', deal_type: 'barter' });
    expect(bad.status).toBe(400);
    expect(db.t('budget_income')[0].deal_type).toBe('FLAT');
  });

  it('typing the actual VIP does not cut the settlement off', async () => {
    await post(income, { routing_id: 'r', actual_vip: 450 });
    expect(db.t('budget_income')[0].actual_vip).toBe(450);
    expect(db.t('budget_income')[0].actuals_source ?? null).toBeNull();
    await post(settlement, { routing_id: 'r', reconciled_guarantee: 9000 });
    expect(db.t('budget_income')[0]).toMatchObject({ actual_guarantee: 9000, actual_vip: 450, actuals_source: 'settlement' });
  });
});

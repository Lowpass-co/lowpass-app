/* ============================================
   Migration 274 — the money options' write paths.

   Each option the USA '26 reconciliation needed (commission parts, overhead
   fixed/typed actual, FX margin, refundable deposits, paid rate, Other
   income) is accepted with the right shape and REJECTED (400, nothing
   written) with a wrong one — a typo must never silently change money.
   ============================================ */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDb } from '@/test-utils/fakeSupabase';

let db: FakeDb;

vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => db.client() }));
vi.mock('@/lib/auth/workspace-check', () => ({ requireWrite: async () => ({ userId: 'user-1' }) }));
vi.mock('@/server/budget/versions', () => ({
  resolveLockState: async () => ({ locked: false, version: null }),
  writeProposedToActiveDraft: async () => ({ error: null }),
}));
vi.mock('@/lib/ai/rag/reindex', () => ({ removeRecordChunksSafe: async () => {} }));
vi.mock('@/server/budget/reconcileDerivedLines', () => ({ reconcileDerivedBudgetLines: async () => ({}) }));

const commissions = await import('./commissions/route');
const settings = await import('./settings/route');
const lineItems = await import('./line-items/route');
const sectionsRoute = await import('./sections/route');

const WS = 'ws-1';
const TOUR = 'tour-1';
const req = (method: string, body: unknown) =>
  new Request('http://x/api', { method, body: JSON.stringify(body) });

beforeEach(() => {
  db = new FakeDb({ unique: { budget_settings: [['tour_id']] } });
  db.seed('profiles', [{ id: 'user-1', workspace_id: WS }]);
  db.seed('tours', [{ id: TOUR, workspace_id: WS, currency: 'USD' }]);
  db.seed('budget_commissions', [{ id: 'c1', tour_id: TOUR, workspace_id: WS, label: 'Mgmt', percentage: 0.15, basis: 'gross', order_index: 1 }]);
  db.seed('budget_line_items', [{ id: 'l1', tour_id: TOUR, workspace_id: WS, label: 'Damage deposit', currency: 'GBP', proposed_cost: 3500, actual_cost: 3500 }]);
});

const comm = () => db.t('budget_commissions').find((c) => c.id === 'c1')!;
const line = () => db.t('budget_line_items').find((l) => l.id === 'l1')!;
const setting = () => db.t('budget_settings').find((s) => s.tour_id === TOUR);

describe('commissions — ticked parts', () => {
  it('stores the parts de-duplicated in a stable order, and the pre-tax switch', async () => {
    const res = await commissions.PATCH(req('PATCH', { id: 'c1', basis_components: ['vip', 'SHOW', 'merch', 'show'], basis_pre_tax: false }));
    expect(res.status).toBe(200);
    expect(comm().basis_components).toEqual(['show', 'merch', 'vip']);
    expect(comm().basis_pre_tax).toBe(false);
  });

  it('null or [] goes back to the single base', async () => {
    await commissions.PATCH(req('PATCH', { id: 'c1', basis_components: ['show'] }));
    await commissions.PATCH(req('PATCH', { id: 'c1', basis_components: [] }));
    expect(comm().basis_components).toBeNull();
  });

  it('an unknown part is a 400 and nothing changes', async () => {
    const res = await commissions.PATCH(req('PATCH', { id: 'c1', basis_components: ['show', 'tips'] }));
    expect(res.status).toBe(400);
    expect(comm().basis_components).toBeUndefined();
    expect((await commissions.PATCH(req('PATCH', { id: 'c1', basis_components: 'show' }))).status).toBe(400);
  });

  it('create accepts parts; an unknown single base is refused', async () => {
    const ok = await commissions.POST(req('POST', { tour_id: TOUR, label: 'Agency', percentage: 0.1, basis_components: ['show'] }));
    expect(ok.status).toBe(200);
    expect(db.t('budget_commissions').find((c) => c.label === 'Agency')?.basis_components).toEqual(['show']);
    expect((await commissions.POST(req('POST', { tour_id: TOUR, label: 'X', percentage: 0, basis: 'everything' }))).status).toBe(400);
  });
});

describe('settings — fixed overheads, typed actuals, FX margin', () => {
  it('fixed insurance + its real invoice', async () => {
    const res = await settings.POST(req('POST', { tour_id: TOUR, insurance_mode: 'flat', insurance_flat_amount: 1500, insurance_actual_amount: '808.81' }));
    expect(res.status).toBe(200);
    expect(setting()).toMatchObject({ insurance_mode: 'flat', insurance_flat_amount: 1500, insurance_actual_amount: 808.81 });
  });

  it('a blank actual clears it (back to the calculation)', async () => {
    await settings.POST(req('POST', { tour_id: TOUR, insurance_actual_amount: 808.81 }));
    await settings.POST(req('POST', { tour_id: TOUR, insurance_actual_amount: '' }));
    expect(setting()?.insurance_actual_amount).toBeNull();
  });

  it('refuses a bad mode, a negative amount and a silly margin', async () => {
    expect((await settings.POST(req('POST', { tour_id: TOUR, contingency_mode: 'fixed' }))).status).toBe(400);
    expect((await settings.POST(req('POST', { tour_id: TOUR, accountancy_flat_amount: -5 }))).status).toBe(400);
    expect((await settings.POST(req('POST', { tour_id: TOUR, fx_margin_pct: 2 }))).status).toBe(400);
    expect(setting()).toBeUndefined();
  });

  it('stores a 2% margin and the show-income base', async () => {
    await settings.POST(req('POST', { tour_id: TOUR, fx_margin_pct: 0.02, insurance_basis: 'income_show' }));
    expect(setting()).toMatchObject({ fx_margin_pct: 0.02, insurance_basis: 'income_show' });
  });
});

describe('line items — deposit, paid rate, commissionable', () => {
  it('marks a deposit owed back, then forfeited, then an ordinary cost', async () => {
    expect((await lineItems.PATCH(req('PATCH', { id: 'l1', refundable_status: 'Pending' }))).status).toBe(200);
    expect(line().refundable_status).toBe('pending');
    await lineItems.PATCH(req('PATCH', { id: 'l1', refundable_status: 'forfeited' }));
    expect(line().refundable_status).toBe('forfeited');
    await lineItems.PATCH(req('PATCH', { id: 'l1', refundable_status: null }));
    expect(line().refundable_status).toBeNull();
  });

  it('refuses an unknown deposit status', async () => {
    expect((await lineItems.PATCH(req('PATCH', { id: 'l1', refundable_status: 'maybe' }))).status).toBe(400);
    expect(line().refundable_status).toBeUndefined();
  });

  it('takes the rate the bank paid; null hands it back to the tour rate; ≤0 is refused', async () => {
    await lineItems.PATCH(req('PATCH', { id: 'l1', locked_fx_rate: 1.3508 }));
    expect(line().locked_fx_rate).toBe(1.3508);
    expect((await lineItems.PATCH(req('PATCH', { id: 'l1', locked_fx_rate: 0 }))).status).toBe(400);
    expect((await lineItems.PATCH(req('PATCH', { id: 'l1', locked_fx_rate: 'abc' }))).status).toBe(400);
    expect(line().locked_fx_rate).toBe(1.3508);
    await lineItems.PATCH(req('PATCH', { id: 'l1', locked_fx_rate: null }));
    expect(line().locked_fx_rate).toBeNull();
  });

  it('income_commissionable is a boolean', async () => {
    await lineItems.PATCH(req('PATCH', { id: 'l1', income_commissionable: false }));
    expect(line().income_commissionable).toBe(false);
  });
});

describe('sections — Other income', () => {
  it('creates one Other income section; a second is a friendly 409', async () => {
    db = new FakeDb({ unique: { budget_sections: [['tour_id', 'kind']] } });
    db.seed('profiles', [{ id: 'user-1', workspace_id: WS }]);
    db.seed('tours', [{ id: TOUR, workspace_id: WS, currency: 'USD' }]);
    const first = await sectionsRoute.POST(req('POST', { tour_id: TOUR, name: 'Other income', kind: 'income' }));
    expect(first.status).toBe(200);
    expect(db.t('budget_sections')[0]).toMatchObject({ kind: 'income', name: 'Other income' });
    const second = await sectionsRoute.POST(req('POST', { tour_id: TOUR, name: 'Other income', kind: 'income' }));
    expect(second.status).toBe(409);
    expect(((await second.json()) as { error: string }).error).toMatch(/Other income/);
  });
});

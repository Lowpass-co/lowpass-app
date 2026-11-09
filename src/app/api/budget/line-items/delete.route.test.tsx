/* ============================================
   DELETE /api/budget/line-items — one or many lines.

   Only your workspace's manual lines go. Automatic lines (payroll, hotels,
   flights, gear) are kept and named, because reconcile would only write them
   back. A locked budget refuses the whole request.
   ============================================ */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDb } from '@/test-utils/fakeSupabase';

let db: FakeDb;
let locked = false;
const erased: string[] = [];

vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => db.client() }));
vi.mock('@/lib/auth/workspace-check', () => ({ requireWrite: async () => ({ userId: 'user-1' }) }));
vi.mock('@/server/budget/versions', () => ({
  resolveLockState: async () => ({ locked, version: locked ? { id: 'v1' } : null }),
  writeProposedToActiveDraft: async () => ({ error: null }),
}));
vi.mock('@/lib/ai/rag/reindex', () => ({ removeRecordChunksSafe: (_ws: string, _k: string, id: string) => void erased.push(id) }));
vi.mock('@/server/budget/reconcileDerivedLines', () => ({ reconcileDerivedBudgetLines: async () => ({}) }));

const { DELETE } = await import('./route');

const WS = 'ws-1';
const del = (qs: string, body?: unknown) =>
  DELETE(new Request(`http://x/api/budget/line-items${qs}`, { method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body) }));
const ids = () => db.t('budget_line_items').map((l) => l.id).sort();

beforeEach(() => {
  locked = false;
  erased.length = 0;
  db = new FakeDb();
  db.seed('profiles', [{ id: 'user-1', workspace_id: WS }]);
  db.seed('budget_line_items', [
    { id: 'm1', tour_id: 't1', workspace_id: WS, label: 'TOTAL EXPENSES' },
    { id: 'm2', tour_id: 't1', workspace_id: WS, label: 'NET INCOME' },
    { id: 'pay', tour_id: 't1', workspace_id: WS, label: 'Ben', source_entity_type: 'payroll' },
    { id: 'fl', tour_id: 't1', workspace_id: WS, label: 'LHR–JFK', flight_id: 'f1' },
    { id: 'foreign', tour_id: 'tx', workspace_id: 'ws-2', label: 'Theirs' },
  ]);
});

describe('DELETE /api/budget/line-items', () => {
  it('deletes many manual lines in one call', async () => {
    const res = await del('?ids=m1,m2');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: ['m1', 'm2'], kept: [], missing: [] });
    expect(ids()).toEqual(['fl', 'foreign', 'pay']);
    expect(erased).toEqual(['m1', 'm2']);
  });

  it('keeps automatic lines and says where they come from', async () => {
    const res = await del('?ids=m1,pay,fl');
    expect(await res.json()).toEqual({ deleted: ['m1'], kept: [{ id: 'pay', source: 'Payroll' }, { id: 'fl', source: 'Travel' }], missing: [] });
    expect(ids()).toEqual(['fl', 'foreign', 'm2', 'pay']);
  });

  it('only automatic lines → 409 DERIVED_LINE, nothing deleted', async () => {
    const res = await del('?id=pay');
    expect(res.status).toBe(409);
    const j = await res.json();
    expect(j.code).toBe('DERIVED_LINE');
    expect(j.error).toMatch(/Payroll/);
    expect(ids()).toHaveLength(5);
  });

  it('another workspace’s line is never touched (reported missing)', async () => {
    const res = await del('', { ids: ['foreign', 'm1'] });
    expect(await res.json()).toMatchObject({ deleted: ['m1'], missing: ['foreign'] });
    expect(ids()).toContain('foreign');
  });

  it('a locked budget refuses the whole request', async () => {
    locked = true;
    const res = await del('?ids=m1,m2');
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('VERSION_LOCKED');
    expect(ids()).toHaveLength(5);
  });

  it('the old single-id forms still work, and a retry is harmless', async () => {
    expect((await del('?id=m1')).status).toBe(200);
    expect((await del('', { id: 'm2' })).status).toBe(200);
    expect(await (await del('?id=m1')).json()).toEqual({ deleted: [], kept: [], missing: ['m1'] });
  });

  it('no id → 400; more than 200 → 400 and nothing deleted', async () => {
    expect((await del('')).status).toBe(400);
    const many = Array.from({ length: 201 }, (_, i) => `x${i}`).concat('m1').join(',');
    expect((await del(`?ids=${many}`)).status).toBe(400);
    expect(ids()).toContain('m1');
  });
});

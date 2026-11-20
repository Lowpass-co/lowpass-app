/* Nov 2026 (Adam: "said they were hotels and they flowed into uncategorised").
   A receipt that makes a NEW line must put it in a real section — section_id,
   which is what the grid groups by — not just a section name. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FakeDb } from '@/test-utils/fakeSupabase';

let db: FakeDb;
vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => db.client() }));
vi.mock('@/lib/auth/workspace-check', () => ({
  requireWrite: async () => ({ user: { id: 'user-1' }, workspaceId: 'ws', membership: { role: 'admin' } }),
}));

import { POST } from './route';

const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
beforeEach(() => {
  posts.length = 0;
  db = new FakeDb();
  db.seed('profiles', [{ id: 'user-1', workspace_id: 'ws' }]);
  db.seed('import_batches', [{ id: 'b1', tour_id: 't1', workspace_id: 'ws', status: 'review' }]);
  db.seed('budget_sections', [
    { id: 's-acc', tour_id: 't1', workspace_id: 'ws', name: 'Accommodation' },
    { id: 's-tr', tour_id: 't1', workspace_id: 'ws', name: 'Travel' },
  ]);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    posts.push({ url: String(url), body });
    if (String(url).endsWith('/api/budget/sections')) return new Response(JSON.stringify({ id: 's-new', name: body.name }), { status: 200 });
    if (String(url).endsWith('/api/budget/line-items')) return new Response(JSON.stringify({ id: 'L-new' }), { status: 200 });
    return new Response('{}', { status: 200 });
  }));
});

function pending(value: Record<string, unknown>) {
  db.seed('import_pending_lines', [{ id: 'p1', batch_id: 'b1', workspace_id: 'ws', target: 'receipt_line', receipt_id: 'rc1', status: 'pending', value }]);
}
const apply = (edits: Record<string, unknown> = {}) =>
  POST(new Request('http://x/api/budget/receipts/proposals/apply', {
    method: 'POST',
    body: JSON.stringify({ batchId: 'b1', accept: ['p1'], edits: { p1: edits } }),
  }));
const lineBody = () => posts.find((p) => p.url.endsWith('/api/budget/line-items'))?.body;

describe('apply puts a new line in a real section', () => {
  it('uses the proposal’s section id', async () => {
    pending({ amount: 410, vendor: 'Hotel', label: 'Hotel', sectionId: 's-acc', sectionName: 'Accommodation' });
    await apply();
    expect(lineBody()).toMatchObject({ section_id: 's-acc' });
  });

  it('a section name typed in review ("Hotels") finds Accommodation', async () => {
    pending({ amount: 410, vendor: 'Hotel', label: 'Hotel', sectionId: null, sectionName: 'Uncategorised' });
    await apply({ sectionName: 'Hotels' });
    expect(lineBody()).toMatchObject({ section_id: 's-acc' });
  });

  it('a name with no section makes one and uses its id', async () => {
    pending({ amount: 40, vendor: 'Shell', label: 'Fuel', sectionId: null, sectionName: 'Fuel', createSection: true });
    await apply();
    expect(posts[0].url).toMatch(/\/api\/budget\/sections$/);
    expect(lineBody()).toMatchObject({ section_id: 's-new' });
  });

  it('Uncategorised stays uncategorised', async () => {
    pending({ amount: 10, vendor: 'X', label: 'X', sectionId: null, sectionName: 'Uncategorised' });
    await apply();
    expect(lineBody()).toMatchObject({ section_id: null });
  });
});

/* Shared venue library: during the beta only a Lowpass site admin may edit a
   venue — a workspace admin (every beta tester is one) is refused, nothing
   written. Reads stay open to every signed-in user. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDb } from '@/test-utils/fakeSupabase';

let db: FakeDb;
let caller = 'tester';
const service = { current: null as FakeDb | null };

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => db.client(),
  createServiceSupabaseClient: () => service.current!.client(),
}));
vi.mock('@/lib/auth/workspace-check', () => ({
  requireWrite: async () => ({ user: { id: caller }, workspaceId: caller === 'adam' ? 'ws-adam' : 'ws-tester' }),
}));

const route = await import('./route');
const patch = (body: unknown) =>
  route.PATCH(new Request('http://x/api', { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'v1' }) });

beforeEach(() => {
  db = new FakeDb();
  db.seed('profiles', [
    { id: 'tester', workspace_id: 'ws-tester', is_site_admin: false },
    { id: 'adam', workspace_id: 'ws-adam', is_site_admin: true },
  ]);
  db.seed('canonical_venues', [{ id: 'v1', name: 'Co-op Live', address: 'Etihad Campus', city: 'Manchester', country: 'GB', capacity: 23500 }]);
  service.current = db;
});

describe('PATCH /api/venues/canonical/[id]', () => {
  it('a workspace admin who is not a site admin is refused and nothing changes', async () => {
    caller = 'tester';
    const res = await patch({ name: 'Renamed by a tester' });
    expect(res.status).toBe(403);
    expect(db.t('canonical_venues')[0].name).toBe('Co-op Live');
  });

  it('a site admin can correct a venue', async () => {
    caller = 'adam';
    const res = await patch({ name: 'Co-op Live Arena' });
    expect(res.status).toBe(200);
    expect(db.t('canonical_venues')[0].name).toBe('Co-op Live Arena');
  });
});

/* Crew document delete is ADMIN ONLY (Nov 2026, Adam).
   The storage delete rule (085) only lets an admin remove the file. A manager
   used to get a 200 while the file stayed in storage — refuse them instead. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let role = 'manager';
const remove = vi.fn(async () => ({ data: [], error: null }));
const personnelRow = {
  id: 'p1',
  extended_profile: { documents: { head_shot: { path: 'ws1/p1/head.jpg', url: 'https://x/head.jpg', name: 'head.jpg' } } },
};

function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const k of ['select', 'eq', 'update']) c[k] = () => c;
  c.single = async () => ({ data: result, error: null });
  return c;
}

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: (t: string) => chain(t === 'profiles' ? { workspace_id: 'ws1' } : personnelRow),
    storage: { from: () => ({ remove }) },
  }),
}));
vi.mock('@/lib/auth/workspace-check', () => ({
  requireWrite: async () => ({
    user: { id: 'u1' },
    workspaceId: 'ws1',
    membership: { role, workspace_id: 'ws1' },
  }),
}));

import { DELETE } from './route';

const call = () =>
  DELETE(
    new Request('http://x/api/personnel/p1/documents', {
      method: 'DELETE',
      body: JSON.stringify({ kind: 'head_shot' }),
    }),
    { params: Promise.resolve({ id: 'p1' }) },
  );

describe('crew document delete', () => {
  beforeEach(() => remove.mockClear());

  it('refuses a manager with a clear message and touches nothing', async () => {
    role = 'manager';
    const res = await call();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Only admins can delete documents.');
    expect(remove).not.toHaveBeenCalled();
  });

  it('lets an admin delete the file', async () => {
    role = 'admin';
    const res = await call();
    expect(res.status).toBe(200);
    expect(remove).toHaveBeenCalledWith(['ws1/p1/head.jpg']);
  });
});

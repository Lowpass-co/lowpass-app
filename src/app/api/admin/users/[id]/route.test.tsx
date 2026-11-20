/** DELETE /api/admin/users/[id] (Nov 2026, Adam: "Delete user also doesn't work"). */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  owned: [] as Array<{ name: string }>,
  deleteErr: null as null | { message: string },
  deletedUsers: [] as string[],
  deletedProfiles: [] as string[],
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'u2', email: 'tester@x', name: 'T', workspace_id: 'mine' } }) }) }),
      insert: async () => ({ error: null }),
    }),
  }),
}));
vi.mock('@/lib/supabase-admin', () => ({
  requireSiteAdmin: async () => ({ id: 'adam', email: 'a@x' }),
  adminErrorResponse: (e: Error) => ({ status: 403, message: e.message }),
  createServiceSupabaseAdminClient: () => ({
    from: (t: string) => ({
      select: () => ({ eq: async () => ({ data: t === 'workspaces' ? state.owned : [] }) }),
      delete: () => ({
        eq: async (_c: string, id: string) => {
          if (t === 'profiles') state.deletedProfiles.push(id);
          return { error: null };
        },
      }),
    }),
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          if (state.deleteErr) return { error: state.deleteErr };
          state.deletedUsers.push(id);
          return { error: null };
        },
      },
    },
  }),
}));

import { DELETE } from './route';

const del = (id: string) => DELETE(new Request(`http://x/api/admin/users/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) });

beforeEach(() => Object.assign(state, { owned: [], deleteErr: null, deletedUsers: [], deletedProfiles: [] }));

describe('admin delete user', () => {
  it('deletes the account and its profile row', async () => {
    expect((await del('u2')).status).toBe(200);
    expect(state.deletedUsers).toEqual(['u2']);
    expect(state.deletedProfiles).toEqual(['u2']);
  });
  it('refuses a workspace owner and names the workspace (Adam: "always refuse")', async () => {
    state.owned = [{ name: "Tester's workspace" }];
    const r = await del('u2');
    expect(r.status).toBe(409);
    const body = await r.json();
    expect(body.code).toBe('OWNS_WORKSPACE');
    expect(body.error).toMatch(/Tester's workspace/);
    expect(body.error).toMatch(/archive, then delete/);
    expect(state.deletedUsers).toEqual([]);
  });
  it('never yourself', async () => {
    expect((await del('adam')).status).toBe(403);
    expect(state.deletedUsers).toEqual([]);
  });
  it("Supabase's vague database error comes back with what to do", async () => {
    state.deleteErr = { message: 'Database error deleting user' };
    const r = await del('u2');
    expect(r.status).toBe(500);
    expect((await r.json()).error).toMatch(/migration 295/);
    expect(state.deletedProfiles).toEqual([]);
  });
});

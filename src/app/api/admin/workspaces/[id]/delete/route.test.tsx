/** POST /api/admin/workspaces/[id]/delete — permanent workspace delete (Nov 2026, Adam). */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  admin: true,
  rpc: [] as Array<{ fn: string; args: unknown }>,
  deleteResult: { data: { name: 'Old WS', members: 3, tours: 2 } as unknown, error: null as null | { code: string; message: string } },
  batches: [] as Array<Array<{ bucket_id: string; name: string }>>,
  listError: false,
  removeFails: false,
  removed: [] as Array<{ bucket: string; names: string[] }>,
  audit: [] as unknown[],
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    rpc: async (fn: string, args: unknown) => {
      state.rpc.push({ fn, args });
      if (fn === 'admin_delete_workspace') return state.deleteResult;
      if (state.listError) return { data: null, error: { message: 'nope' } };
      return { data: state.batches.shift() ?? [], error: null };
    },
    from: (t: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { workspace_id: 'mine' } }) }) }),
      insert: async (row: unknown) => {
        if (t === 'audit_log') state.audit.push(row);
        return { error: null };
      },
    }),
  }),
}));
vi.mock('@/lib/supabase-admin', () => ({
  requireSiteAdmin: async () => {
    if (!state.admin) throw new Error('Forbidden');
    return { id: 'adam', email: 'a@x' };
  },
  adminErrorResponse: (e: Error) => ({ status: 403, message: e.message }),
  createServiceSupabaseAdminClient: () => ({
    storage: {
      from: (bucket: string) => ({
        remove: async (names: string[]) => {
          if (state.removeFails) return { data: null, error: { message: 'storage down' } };
          state.removed.push({ bucket, names });
          return { data: names.map((n) => ({ name: n })), error: null };
        },
      }),
    },
  }),
}));

import { POST } from './route';

const call = (body: unknown) =>
  POST(new Request('http://x/api/admin/workspaces/ws1/delete', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'ws1' }) });

beforeEach(() => {
  Object.assign(state, { admin: true, rpc: [], batches: [], listError: false, removeFails: false, removed: [], audit: [] });
  state.deleteResult = { data: { name: 'Old WS', members: 3, tours: 2 }, error: null };
});

describe('permanent workspace delete', () => {
  it('site admins only', async () => {
    state.admin = false;
    expect((await call({ confirm_name: 'Old WS' })).status).toBe(403);
    expect(state.rpc).toEqual([]);
  });
  it('needs the name typed', async () => {
    expect((await call({})).status).toBe(400);
    expect(state.rpc).toEqual([]);
  });
  it("the database's refusals come back as the right status (not archived → 409, wrong name → 400)", async () => {
    state.deleteResult = { data: null, error: { code: '55000', message: 'Archive the workspace before deleting it' } };
    const r = await call({ confirm_name: 'Old WS' });
    expect(r.status).toBe(409);
    expect((await r.json()).error).toMatch(/Archive/);
    state.deleteResult = { data: null, error: { code: '22023', message: "doesn't match" } };
    expect((await call({ confirm_name: 'x' })).status).toBe(400);
    expect(state.rpc.some((c) => c.fn === 'admin_workspace_storage_objects')).toBe(false); // never sweeps when the delete didn't happen
  });
  it('deletes, then removes its stored files batch by batch, per bucket', async () => {
    state.batches = [
      [{ bucket_id: 'tour-files', name: 'ws1/a.pdf' }, { bucket_id: 'receipts', name: 'ws1/r.jpg' }],
      [{ bucket_id: 'tour-files', name: 'advance-packs/ws1/p.pdf' }],
    ];
    const r = await call({ confirm_name: 'Old WS' });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, name: 'Old WS', members: 3, tours: 2, files_removed: 3, files_left: 0 });
    expect(state.rpc[0]).toEqual({ fn: 'admin_delete_workspace', args: { p_workspace_id: 'ws1', p_confirm_name: 'Old WS' } });
    expect(state.removed).toEqual([
      { bucket: 'tour-files', names: ['ws1/a.pdf'] },
      { bucket: 'receipts', names: ['ws1/r.jpg'] },
      { bucket: 'tour-files', names: ['advance-packs/ws1/p.pdf'] },
    ]);
    expect(state.audit).toEqual([expect.objectContaining({ workspace_id: 'mine', action: 'deleted', entity_type: 'workspace', entity_id: 'ws1' })]);
  });
  it("stops (never loops) when files won't go, and says how many are left", async () => {
    state.removeFails = true;
    state.batches = [[{ bucket_id: 'tour-files', name: 'ws1/a.pdf' }], [{ bucket_id: 'tour-files', name: 'ws1/a.pdf' }]];
    const body = await (await call({ confirm_name: 'Old WS' })).json();
    expect(body).toMatchObject({ files_removed: 0, files_left: 1 });
  });
  it("says it couldn't check when the files can't be listed", async () => {
    state.listError = true;
    expect(await (await call({ confirm_name: 'Old WS' })).json()).toMatchObject({ ok: true, files_left: null });
  });
});

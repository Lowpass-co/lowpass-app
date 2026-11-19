/* ============================================
   LOWPASS — requireWrite, the authorization gate (P0)

   A readonly member created an artist and it persisted. The cause was not a
   missing button: route code did authentication + tenancy and delegated ROLE to
   RLS, and RLS only encodes role on the 9 tables migration 079 strict-gated.

   These tests pin the DECISION — who may write — against a faked membership and
   grant set. They deliberately do not touch Postgres: the question here is
   whether the predicate is right, and the question of whether the API actually
   refuses a real readonly session is the live acceptance test, which no unit
   test can stand in for.

   Since Nov 2026 a Member's writes are decided by tour access alone (the
   `requireWrite by tour area` block below): VIEW never buys a write.
   ============================================ */

import { describe, it, expect } from 'vitest';
import type { ActiveMembership } from '@/lib/permissions/server';

const member = (role: ActiveMembership['role'], tags: string[] = []): ActiveMembership => ({
  workspace_id: 'ws-1',
  member_id: 'm-1',
  role,
  is_workspace_owner: false,
  tags,
});


/** The predicate requireWrite applies when no resource is named. */
const roleOnlyWrite = (m: ActiveMembership | null) =>
  !!m && (m.role === 'admin' || m.role === 'manager');

describe('the write predicate with NO resource named', () => {
  it('admin and manager may write', () => {
    expect(roleOnlyWrite(member('admin'))).toBe(true);
    expect(roleOnlyWrite(member('manager'))).toBe(true);
  });

  it('READONLY MAY NOT — this is the bug', () => {
    /* Before P0 this returned true in effect, because nothing asked. */
    expect(roleOnlyWrite(member('readonly'))).toBe(false);
  });

  it('no membership may not', () => {
    expect(roleOnlyWrite(null)).toBe(false);
  });

  it('unnamed resources deny by default — the opposite of the nav rail', () => {
    /* The read-side filter fails OPEN: a nav showing too much is a nuisance.
       A write failing open is this entire P0. Same codebase, opposite default,
       on purpose. */
    expect(roleOnlyWrite(member('readonly'))).toBe(false);
  });
});

describe('ONE SYSTEM — the Sprint 9 page grants open nothing (Nov 2026)', () => {
  /* Prevention, not detection: a second permission system that still gates a
     page is invisible until a member's access disagrees with the screen. So
     the old predicate is gone, and nothing may call it again. */
  it('no app code imports the old grant checks', async () => {
    const { execSync } = await import('node:child_process');
    const hits = execSync("grep -rlE '\\b(canAccess|fetchActiveGrants|canAccessBatch)\\b' src --include=*.ts --include=*.tsx || true", { encoding: 'utf8' })
      .split('\n')
      .filter((f) => f && !f.endsWith('.test.tsx'));
    expect(hits).toEqual([]);
  });
  it('requireWrite takes no `resource` — a write names a tour area, or is admin / manager only', async () => {
    const { execSync } = await import('node:child_process');
    const hits = execSync("grep -rn 'requireWrite([^)]*resource:' src --include=*.ts --include=*.tsx || true", { encoding: 'utf8' }).trim();
    expect(hits).toBe('');
  });
});

describe('adminOnly', () => {
  const adminOnly = (m: ActiveMembership) => m.role === 'admin';

  it('excludes manager — used for membership, billing, destructive-global', () => {
    expect(adminOnly(member('admin'))).toBe(true);
    expect(adminOnly(member('manager'))).toBe(false);
    expect(adminOnly(member('readonly'))).toBe(false);
  });
});

describe('P0-A — the canonical venue route', () => {
  it('is gated with no resource, so readonly is refused', async () => {
    /* The route names no resource because RESOURCE_CATALOG has no `venues`
       entry — gating on an invented id would create a permission nobody could
       grant. Asserted as source, because the handler needs a Supabase client
       and a request to run, and neither would make this any truer. */
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/app/api/venues/canonical/[id]/route.ts', 'utf8');
    expect(src).toContain('requireWrite(supabase)');
    // The guard must precede the service-role client, which bypasses RLS.
    expect(src.indexOf('requireWrite(supabase)')).toBeLessThan(src.indexOf('createServiceSupabaseClient()'));
  });

  it('GET is NOT gated — reading the shared directory stays open', async () => {
    /* Narrowing reads was not the finding and would break venue search. This
       asserts the guard sits in PATCH only, by counting call sites. */
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/app/api/venues/canonical/[id]/route.ts', 'utf8');
    expect(src.match(/requireWrite\(/g)?.length).toBe(1);
    const getBody = src.slice(src.indexOf('export async function GET'), src.indexOf('export async function PATCH'));
    expect(getBody).not.toContain('requireWrite');
  });
});

/* ---- Tour access (Nov 2026): requireWrite({ area, tourId }) ---- */
import { requireWrite as requireWriteReal } from './workspace-check';

function fakeClient(role: string, rpcRows: { area: string; level: string }[] | null) {
  const chain = (row: unknown) => {
    const q = { select: () => q, eq: () => q, in: () => q, maybeSingle: async () => ({ data: row, error: null }), single: async () => ({ data: row, error: null }), then: (r: (v: { data: unknown[]; error: null }) => unknown) => r({ data: [], error: null }) };
    return q;
  };
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: (t: string) =>
      t === 'profiles' ? chain({ workspace_id: 'ws' }) : t === 'workspace_members' ? chain({ id: 'm1', role, is_workspace_owner: false }) : chain(null),
    rpc: async () => (rpcRows ? { data: rpcRows, error: null } : { data: null, error: { message: 'no function' } }),
  } as unknown as Parameters<typeof requireWriteReal>[0];
}

describe('requireWrite by tour area', () => {
  const ok = (r: Awaited<ReturnType<typeof requireWriteReal>>) => !('error' in r);
  it('admin and manager pass on role', async () => {
    expect(ok(await requireWriteReal(fakeClient('admin', []), { area: 'receipts', tourId: 't1' }))).toBe(true);
    expect(ok(await requireWriteReal(fakeClient('manager', []), { area: 'receipts', tourId: 't1' }))).toBe(true);
  });
  it('a member with EDIT on the area passes', async () => {
    expect(ok(await requireWriteReal(fakeClient('readonly', [{ area: 'receipts', level: 'edit' }]), { area: 'receipts', tourId: 't1' }))).toBe(true);
  });
  it('VIEW does not buy a write', async () => {
    expect(ok(await requireWriteReal(fakeClient('readonly', [{ area: 'receipts', level: 'view' }]), { area: 'receipts', tourId: 't1' }))).toBe(false);
  });
  it('edit on another area does not count', async () => {
    expect(ok(await requireWriteReal(fakeClient('readonly', [{ area: 'parking', level: 'edit' }]), { area: 'receipts', tourId: 't1' }))).toBe(false);
  });
  it('no tour, or the database cannot answer → refused', async () => {
    expect(ok(await requireWriteReal(fakeClient('readonly', [{ area: 'receipts', level: 'edit' }]), { area: 'receipts', tourId: null }))).toBe(false);
    expect(ok(await requireWriteReal(fakeClient('readonly', null), { area: 'receipts', tourId: 't1' }))).toBe(false);
  });
});

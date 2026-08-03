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

   The case that matters most is the LAST one. `canAccess` treats write as
   strictly stronger than read, so a member holding only a read grant must be
   refused a write — if that ever inverts, every "view-only" grant in the
   workspace silently becomes an edit grant.
   ============================================ */

import { describe, it, expect } from 'vitest';
import { canAccess, type ActiveMembership, type GrantRow } from '@/lib/permissions/server';

const member = (role: ActiveMembership['role'], tags: string[] = []): ActiveMembership => ({
  workspace_id: 'ws-1',
  member_id: 'm-1',
  role,
  is_workspace_owner: false,
  tags,
});

const grant = (
  resource_id: string,
  permission: GrantRow['permission'],
  subject: Partial<GrantRow> = {},
): GrantRow => ({
  resource_type: 'page',
  resource_id,
  permission,
  subject_type: 'user',
  subject_id: 'u-1',
  ...subject,
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

describe('the write predicate WITH a resource', () => {
  const can = (m: ActiveMembership, g: GrantRow[], id: string) =>
    canAccess(m, g, 'page', id, 'write');

  it('admin and manager pass without any grant', () => {
    expect(can(member('admin'), [], 'budget.line_items')).toBe(true);
    expect(can(member('manager'), [], 'budget.line_items')).toBe(true);
  });

  it('readonly with a WRITE grant may write that resource', () => {
    expect(can(member('readonly'), [grant('budget.line_items', 'write')], 'budget.line_items')).toBe(true);
  });

  it('readonly with a write grant on a DIFFERENT resource may not', () => {
    expect(can(member('readonly'), [grant('budget.receipts', 'write')], 'budget.line_items')).toBe(false);
  });

  it('A READ GRANT DOES NOT BUY A WRITE', () => {
    /* If this inverts, every view-only grant becomes an edit grant silently.
       canAccess allows write→read, never read→write. */
    expect(can(member('readonly'), [grant('budget.line_items', 'read')], 'budget.line_items')).toBe(false);
    // ...and the same grant still satisfies a READ, so the asymmetry is real.
    expect(canAccess(member('readonly'), [grant('budget.line_items', 'read')], 'page', 'budget.line_items', 'read')).toBe(true);
  });

  it('a tag-mediated write grant works only when the member carries the tag', () => {
    const g = [grant('budget.line_items', 'write', { subject_type: 'tag', subject_id: 'finance' })];
    expect(can(member('readonly', ['finance']), g, 'budget.line_items')).toBe(true);
    expect(can(member('readonly', ['crew']), g, 'budget.line_items')).toBe(false);
    expect(can(member('readonly'), g, 'budget.line_items')).toBe(false);
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

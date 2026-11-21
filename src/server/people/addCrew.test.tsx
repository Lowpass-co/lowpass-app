/* ============================================
   Add crew (Nov 2026, Adam): many at once, new people, role tags worked out,
   status retired, optional app login for THIS tour (admins only).
   Asserts what each request WRITES, against the in-memory fake.
   ============================================ */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDb } from '@/test-utils/fakeSupabase';
import { PRESET_ACCESS } from '@/lib/permissions/areas';

let db: FakeDb;
let role: 'admin' | 'manager' | 'readonly' = 'admin';
let viewerManager = true;
const WS = 'ws-1';
const TOUR = '11111111-1111-4111-8111-111111111111';
const OLD = '22222222-2222-4222-8222-222222222222';

vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => db.client() }));
vi.mock('@/lib/auth/workspace-check', () => ({
  requireWrite: async (_s: unknown, o?: { adminOnly?: boolean }) => {
    if (role === 'readonly' || (o?.adminOnly && role !== 'admin')) {
      const { NextResponse } = await import('next/server');
      return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    }
    return { user: { id: 'user-1' }, workspaceId: WS };
  },
}));
vi.mock('@/server/budget/withDerivedRefresh', () => ({ withDerivedRefresh: (h: unknown) => h, tourFromParams: async () => null }));
vi.mock('@/lib/permissions/tourAccess', async (orig) => ({
  ...(await orig<typeof import('@/lib/permissions/tourAccess')>()),
  getViewerAccess: async () => (viewerManager ? { manager: true, role, tour: {} } : { manager: false, role: 'readonly', tour: {} }),
}));
vi.mock('@/lib/permissions/server', () => ({
  getActiveMembership: async () => ({ workspace_id: WS, member_id: 'm-me', role, is_workspace_owner: false, tags: [] }),
}));

const addRoute = await import('@/app/api/tours/[id]/personnel/add/route');
const loginRoute = await import('@/app/api/tours/[id]/personnel/[memberId]/login/route');
const listRoute = await import('@/app/api/tours/[id]/personnel/route');
const candidatesRoute = await import('@/app/api/tours/[id]/personnel/candidates/route');

const params = { params: Promise.resolve({ id: TOUR }) };
const add = (people: unknown[]) =>
  addRoute.POST(new Request(`http://app.test/api/tours/${TOUR}/personnel/add`, { method: 'POST', body: JSON.stringify({ people }) }), params);
const login = (memberId: string, method: 'PUT' | 'DELETE', body?: unknown) =>
  (method === 'PUT' ? loginRoute.PUT : loginRoute.DELETE)(
    new Request(`http://app.test/api/tours/${TOUR}/personnel/${memberId}/login`, { method, body: body ? JSON.stringify(body) : undefined }),
    { params: Promise.resolve({ id: TOUR, memberId }) },
  );

function person(id: string, name: string, extra: Record<string, unknown> = {}) {
  db.seed('persons', [{ id, workspace_id: WS, full_name: name }]);
  db.seed('personnel', [{ id, workspace_id: WS, name, role: '', email: null, user_id: null, extended_profile: {}, lp_id: `LP-${id}`, ...extra }]);
}

beforeEach(() => {
  role = 'admin';
  viewerManager = true;
  db = new FakeDb({
    unique: { tour_personnel: [['tour_id', 'person_id', 'role']], personnel: [['workspace_id', 'lp_id']] },
    rpc: {
      // Admin-only in the database; the fake returns members with their login emails.
      list_workspace_members: (d, a) => ({
        data: d
          .t('workspace_members')
          .filter((m) => m.workspace_id === a.p_workspace_id)
          .map((m) => ({ member_id: m.id, user_id: m.user_id, email: m.email ?? null, role: m.role })),
        error: null,
      }),
    },
  });
  db.seed('tours', [
    { id: TOUR, workspace_id: WS, artist_id: 'art', name: 'Winter 26', start_date: '2026-11-26' },
    { id: OLD, workspace_id: WS, artist_id: 'art', name: 'Spring 26', start_date: '2026-04-01' },
  ]);
  db.seed('artists', [{ id: 'art', name: 'Charlotte Sands' }]);
  db.seed('workspace_members', [{ id: 'm-me', workspace_id: WS, user_id: 'user-1', role: 'admin', email: 'adam@lowpass.co' }]);
  person('ben', 'Ben Quinton', { role: 'TM Assistant', email: 'ben@x.co' });
  person('jo', 'Jo Monitors', { role: 'Monitor Engineer' });
});

describe('adding crew', () => {
  it('adds several at once: usual role, role tag worked out, status always confirmed, whole tour by default', async () => {
    const res = await add([{ person_id: 'ben' }, { person_id: 'jo', role: 'Mons', starts_on: '2026-11-28', ends_on: '2026-12-01' }]);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Array<{ ok: boolean; name: string }> };
    expect(body.results.map((r) => [r.name, r.ok])).toEqual([['Ben Quinton', true], ['Jo Monitors', true]]);
    const tp = db.t('tour_personnel');
    expect(tp.find((r) => r.person_id === 'ben')).toMatchObject({ role: 'TM Assistant', role_tag: 'tm2', status: 'confirmed', starts_on: null });
    expect(tp.find((r) => r.person_id === 'jo')).toMatchObject({ role: 'Mons', role_tag: 'mons', starts_on: '2026-11-28', ends_on: '2026-12-01' });
    expect(db.t('personnel_rates')).toHaveLength(2); // payroll cards seeded
  });

  it('a chosen role tag wins over the worked-out one', async () => {
    await add([{ person_id: 'ben', role_tag: 'pm' }]);
    expect(db.t('tour_personnel')[0].role_tag).toBe('pm');
  });

  it('makes a new person in People, and never duplicates someone by email', async () => {
    const res = await add([
      { new: { name: 'Jade Ng', email: 'JADE@x.co', phone: '07700' }, role: 'Merch' },
      { new: { name: 'Benny Q', email: 'ben@x.co' } }, // already Ben
    ]);
    const { results } = (await res.json()) as { results: Array<{ ok: boolean; name: string; person_id: string; error?: string }> };
    expect(results.map((r) => r.error ?? r.ok)).toEqual([true, true]);
    const jade = db.t('personnel').find((r) => r.name === 'Jade Ng')!;
    expect(jade).toMatchObject({ workspace_id: WS, email: 'jade@x.co', phone: '07700', role: 'Merch' });
    expect(results[1]).toMatchObject({ name: 'Ben Quinton', person_id: 'ben' });
    expect(db.t('personnel').filter((r) => r.name === 'Benny Q')).toHaveLength(0);
  });

  it('one failure does not stop the rest, and says why', async () => {
    await add([{ person_id: 'ben' }]);
    const res = await add([{ person_id: 'ben' }, { person_id: 'jo' }]);
    expect(res.status).toBe(200);
    const { results } = (await res.json()) as { results: Array<{ ok: boolean; error?: string }> };
    expect(results[0]).toMatchObject({ ok: false, error: 'Already on this tour in that role' });
    expect(results[1].ok).toBe(true);
  });

  it('nobody added → 400', async () => {
    await add([{ person_id: 'ben' }]);
    expect((await add([{ person_id: 'ben' }])).status).toBe(400);
  });

  it('refuses bad input before writing anything', async () => {
    expect((await add([])).status).toBe(400);
    expect((await add([{ person_id: 'ben', new: { name: 'x' } }])).status).toBe(400);
    expect((await add([{ person_id: 'ben', login: { preset: 'god' } }])).status).toBe(400);
    expect((await add([{ person_id: 'ben', starts_on: '2026-12-05', ends_on: '2026-12-01' }])).status).toBe(400);
    expect(db.t('tour_personnel')).toHaveLength(0);
  });

  it('a Member cannot add; a manager can add but cannot give app access', async () => {
    viewerManager = false;
    role = 'readonly';
    expect((await add([{ person_id: 'ben' }])).status).toBe(403);
    viewerManager = true;
    role = 'manager';
    const res = await add([{ person_id: 'ben', login: { preset: 'crew' } }]);
    expect(res.status).toBe(403);
    expect(db.t('tour_personnel')).toHaveLength(0); // nothing half-written
    expect((await add([{ person_id: 'ben' }])).status).toBe(200);
  });
});

describe('app access on this tour', () => {
  it('no login → an invite: Member, linked to the crew record, this tour only', async () => {
    const res = await add([{ person_id: 'ben', login: { preset: 'crew' } }]);
    const { results } = (await res.json()) as { results: Array<{ login: { kind: string; url: string } }> };
    expect(results[0].login.kind).toBe('invited');
    expect(results[0].login.url).toMatch(/^http:\/\/app\.test\/invite\/accept\?token=/);
    const inv = db.t('workspace_invites')[0];
    expect(inv).toMatchObject({ workspace_id: WS, invited_email: 'ben@x.co', invited_role: 'readonly', personnel_id: 'ben' });
    const rows = inv.initial_access as Array<{ tour_id: string; area: string; level: string }>;
    expect(rows.every((r) => r.tour_id === TOUR)).toBe(true);
    expect(Object.fromEntries(rows.map((r) => [r.area, r.level]))).toEqual(PRESET_ACCESS.crew);
  });

  it('needs an email; one typed is saved on their People record', async () => {
    const res = await add([{ person_id: 'jo', login: { preset: 'crew' } }]);
    const { results } = (await res.json()) as { results: Array<{ ok: boolean; login: { kind: string; error: string } }> };
    expect(results[0].ok).toBe(true); // still on the crew
    expect(results[0].login).toEqual({ kind: 'error', error: 'Add an email to give them a login' });
    const r2 = await login(db.t('tour_personnel')[0].id as string, 'PUT', { preset: 'production', email: 'Jo@X.co' });
    expect(r2.status).toBe(200);
    expect(db.t('personnel').find((p) => p.id === 'jo')!.email).toBe('jo@x.co');
  });

  it('a pending invite for the same email is reused — this tour merged in, never a second link', async () => {
    db.seed('workspace_invites', [
      {
        id: 'inv-1',
        workspace_id: WS,
        invited_email: 'ben@x.co',
        invited_role: 'readonly',
        token: 'tok-1',
        personnel_id: null,
        accepted_at: null,
        expires_at: '2099-01-01T00:00:00Z',
        created_at: '2026-11-01',
        initial_access: [{ tour_id: OLD, area: 'files', level: 'edit' }],
      },
    ]);
    const res = await add([{ person_id: 'ben', login: { preset: 'crew' } }]);
    const { results } = (await res.json()) as { results: Array<{ login: { kind: string; url: string; reused: boolean } }> };
    expect(results[0].login).toMatchObject({ kind: 'invited', reused: true });
    expect(results[0].login.url).toContain('token=tok-1');
    expect(db.t('workspace_invites')).toHaveLength(1);
    const inv = db.t('workspace_invites')[0];
    expect(inv.personnel_id).toBe('ben');
    const rows = inv.initial_access as Array<{ tour_id: string; area: string }>;
    expect(rows.some((r) => r.tour_id === OLD && r.area === 'files')).toBe(true);
    expect(rows.filter((r) => r.tour_id === TOUR)).toHaveLength(Object.keys(PRESET_ACCESS.crew).length);
  });

  it('an existing Member gets this tour added — never lowered; admins / managers need nothing', async () => {
    db.t('personnel').find((p) => p.id === 'ben')!.user_id = 'u-ben';
    db.seed('workspace_members', [{ id: 'm-ben', workspace_id: WS, user_id: 'u-ben', role: 'readonly' }]);
    db.seed('tour_access', [{ id: 'ta-1', workspace_id: WS, member_id: 'm-ben', tour_id: TOUR, area: 'files', level: 'edit' }]);
    const res = await add([{ person_id: 'ben', login: { preset: 'crew' } }]);
    const { results } = (await res.json()) as { results: Array<{ login: { kind: string } }> };
    expect(results[0].login.kind).toBe('granted');
    const mine = db.t('tour_access').filter((r) => r.member_id === 'm-ben' && r.tour_id === TOUR);
    expect(Object.fromEntries(mine.map((r) => [r.area, r.level]))).toEqual({ ...PRESET_ACCESS.crew, files: 'edit' });
    expect(db.t('workspace_invites')).toHaveLength(0);

    db.t('personnel').find((p) => p.id === 'jo')!.user_id = 'u-jo';
    db.seed('workspace_members', [{ id: 'm-jo', workspace_id: WS, user_id: 'u-jo', role: 'manager' }]);
    const r2 = await add([{ person_id: 'jo', login: { preset: 'crew' } }]);
    const b2 = (await r2.json()) as { results: Array<{ login: { kind: string } }> };
    expect(b2.results[0].login.kind).toBe('full');
  });

  it('the list shows each login; removing takes this tour off (an invite with nothing left is withdrawn)', async () => {
    await add([{ person_id: 'ben', login: { preset: 'production' } }, { person_id: 'jo' }]);
    const list = await listRoute.GET(new Request(`http://app.test/api/tours/${TOUR}/personnel`), params);
    const { personnel } = (await list.json()) as { personnel: Array<{ person_id: string; login: { state: string; preset: string | null; inviteUrl?: string }; status?: string }> };
    const ben = personnel.find((p) => p.person_id === 'ben')!;
    expect(ben.login).toMatchObject({ state: 'invited', preset: 'production' });
    expect(ben.login.inviteUrl).toContain('/invite/accept?token=');
    expect(ben).not.toHaveProperty('status'); // status is retired
    expect(personnel.find((p) => p.person_id === 'jo')!.login).toEqual({ state: 'none', preset: null });

    const benRow = db.t('tour_personnel').find((r) => r.person_id === 'ben')!;
    expect((await login(benRow.id as string, 'DELETE')).status).toBe(200);
    expect(db.t('workspace_invites')).toHaveLength(0);
  });

  it('login changes are admin-only', async () => {
    await add([{ person_id: 'ben' }]);
    role = 'manager';
    expect((await login(db.t('tour_personnel')[0].id as string, 'PUT', { preset: 'crew' })).status).toBe(403);
    expect(db.t('workspace_invites')).toHaveLength(0);
  });
});

describe('a login follows the crew record\'s email (Adam added himself under an old email)', () => {
  const pendingInvite = (email: string, access: unknown[] = []) =>
    db.seed('workspace_invites', [
      {
        id: 'inv-x',
        workspace_id: WS,
        invited_email: email,
        invited_role: 'readonly',
        token: 'tok-x',
        personnel_id: 'jo',
        accepted_at: null,
        expires_at: '2099-01-01T00:00:00Z',
        created_at: '2026-11-21',
        initial_access: access,
      },
    ]);

  it("the email is an existing login here → linked, no invite (yourself: 'Sees every tour')", async () => {
    db.t('personnel').find((p) => p.id === 'jo')!.email = 'ADAM@lowpass.co';
    pendingInvite('old@gmail.com');
    const res = await add([{ person_id: 'jo', login: { preset: 'crew' } }]);
    const { results } = (await res.json()) as { results: Array<{ login: { kind: string } }> };
    expect(results[0].login.kind).toBe('full');
    expect(db.t('personnel').find((p) => p.id === 'jo')!.user_id).toBe('user-1');
    expect(db.t('workspace_invites')).toHaveLength(0); // the stale link is withdrawn
  });

  it("a Member's pending invite access moves onto their login when linked", async () => {
    db.seed('workspace_members', [{ id: 'm-jo', workspace_id: WS, user_id: 'u-jo', role: 'readonly', email: 'jo@x.co' }]);
    db.t('personnel').find((p) => p.id === 'jo')!.email = 'jo@x.co';
    pendingInvite('old@gmail.com', [{ tour_id: OLD, area: 'files', level: 'edit' }]);
    const tp = await add([{ person_id: 'jo' }]);
    expect(tp.status).toBe(200);
    const memberId = db.t('tour_personnel').find((r) => r.person_id === 'jo')!.id as string;
    const res = await login(memberId, 'PUT', { preset: 'crew' });
    expect(((await res.json()) as { login: { kind: string } }).login.kind).toBe('granted');
    const rows = db.t('tour_access').filter((r) => r.member_id === 'm-jo');
    expect(rows.some((r) => r.tour_id === OLD && r.area === 'files' && r.level === 'edit')).toBe(true);
    expect(rows.filter((r) => r.tour_id === TOUR)).toHaveLength(Object.keys(PRESET_ACCESS.crew).length);
    expect(db.t('workspace_invites')).toHaveLength(0);
  });

  it('never steals a login that already has a crew record here', async () => {
    db.t('personnel').find((p) => p.id === 'ben')!.user_id = 'user-1'; // Adam's own record
    db.t('personnel').find((p) => p.id === 'jo')!.email = 'adam@lowpass.co';
    const { syncPersonnelLogin } = await import('@/server/people/tourLogin');
    expect(await syncPersonnelLogin(db.client(), WS, 'jo', 'user-1')).toBe('none');
    expect(db.t('personnel').find((p) => p.id === 'jo')!.user_id).toBeNull();
  });

  it('no login yet → a pending invite is re-addressed to the new email (same link)', async () => {
    db.t('personnel').find((p) => p.id === 'jo')!.email = 'new@x.co';
    pendingInvite('old@gmail.com');
    const { syncPersonnelLogin } = await import('@/server/people/tourLogin');
    expect(await syncPersonnelLogin(db.client(), WS, 'jo', 'user-1')).toBe('retargeted');
    expect(db.t('workspace_invites')[0]).toMatchObject({ invited_email: 'new@x.co', token: 'tok-x' });
  });
});

describe('who the Add crew panel offers', () => {
  it("everyone not on the tour, this artist's people first; admins may give access", async () => {
    db.seed('tour_personnel', [{ id: 'tp-old', workspace_id: WS, tour_id: OLD, person_id: 'jo', role: 'Mons' }]);
    await add([{ person_id: 'ben' }]);
    const res = await candidatesRoute.GET(new Request(`http://app.test/api/tours/${TOUR}/personnel/candidates`), params);
    const body = (await res.json()) as { people: Array<{ id: string; withArtist: boolean; lastTour: { name: string } | null }>; artistName: string; canGiveAccess: boolean };
    expect(body.people.map((p) => [p.id, (p as { onTour?: boolean }).onTour])).toEqual([['jo', false], ['ben', true]]);
    expect(body.people[0]).toMatchObject({ withArtist: true, lastTour: { name: 'Spring 26' } });
    expect(body.artistName).toBe('Charlotte Sands');
    expect(body.canGiveAccess).toBe(true);
    role = 'manager';
    const r2 = await candidatesRoute.GET(new Request(`http://app.test/api/tours/${TOUR}/personnel/candidates`), params);
    expect(((await r2.json()) as { canGiveAccess: boolean }).canGiveAccess).toBe(false);
  });
});

/* ============================================
   One person, one place per field (Nov 2026, Adam).

   Payroll's Name / Role / Employment cells and the Crew panel write the SAME
   data: name → the People record, role → this tour's roster row, employment
   → this tour's payroll card. The card's own name / role are copies the
   database keeps (migration 285, tested in PGlite) — so these tests assert
   what each request WRITES, and that it never writes the copies.
   ============================================ */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDb } from '@/test-utils/fakeSupabase';
import { EMPLOYMENT_OPTIONS, employmentFromGroups, employmentLabel, groupsOf, isEmployment } from '@/lib/personnel/employment';

let db: FakeDb;
const refreshed: string[] = [];

vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => db.client() }));
vi.mock('@/lib/auth/workspace-check', () => ({ requireWrite: async () => ({ userId: 'user-1' }) }));
vi.mock('@/server/budget/reconcileDerivedLines', () => ({
  refreshDerivedLines: async (_s: unknown, tourId: string) => void refreshed.push(tourId),
  reconcileDerivedBudgetLines: async () => ({}),
}));
vi.mock('@/server/budget/withDerivedRefresh', () => ({
  withDerivedRefresh: (h: unknown) => h,
  tourFromParams: async () => null,
}));
vi.mock('@/lib/permissions/server', () => ({
  getActiveMembership: async () => ({ workspace_id: WS, member_id: 'm', role: 'admin', is_workspace_owner: true, tags: [] }),
  fetchActiveGrants: async () => [],
  canAccess: () => true,
}));

const rates = await import('@/app/api/budget/personnel-rates/route');
const member = await import('@/app/api/tours/[id]/personnel/[memberId]/route');
const roster = await import('@/app/api/tours/[id]/personnel/route');

const WS = 'ws-1';
const TOUR = 'tour-1';

const patchCard = (body: Record<string, unknown>) =>
  rates.PATCH(new Request('http://x/api/budget/personnel-rates', { method: 'PATCH', body: JSON.stringify(body) }));
const patchMember = (memberId: string, body: Record<string, unknown>) =>
  member.PATCH(new Request(`http://x/api/tours/${TOUR}/personnel/${memberId}`, { method: 'PATCH', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: TOUR, memberId }),
  });
const row = (table: string, id: string) => db.t(table).find((r) => r.id === id)!;

beforeEach(() => {
  refreshed.length = 0;
  db = new FakeDb({ unique: { tour_personnel: [['tour_id', 'person_id', 'role']] } });
  db.seed('profiles', [{ id: 'user-1', workspace_id: WS, role_id: null }]);
  db.seed('personnel', [{ id: 'sam', workspace_id: WS, name: 'Sam Smith', role: 'FOH' }]);
  db.seed('tour_personnel', [
    { id: 'tp-sam', workspace_id: WS, tour_id: TOUR, person_id: 'sam', role: 'FOH', status: 'confirmed' },
    { id: 'tp-sam2', workspace_id: WS, tour_id: TOUR, person_id: 'sam', role: 'Driver', status: 'confirmed' },
  ]);
  db.seed('personnel_rates', [
    { id: 'card-sam', tour_id: TOUR, workspace_id: WS, person_name: 'Sam Smith', role: 'FOH', person_type: 'crew', person_id: 'sam', tour_personnel_id: 'tp-sam' },
    { id: 'card-loose', tour_id: TOUR, workspace_id: WS, person_name: 'Hired local', role: 'Runner', person_type: 'crew', person_id: null, tour_personnel_id: null },
  ]);
});

describe('employment', () => {
  it('three values, labels match Payroll', () => {
    expect(EMPLOYMENT_OPTIONS.map((o) => o.value)).toEqual(['principal', 'band', 'crew']);
    expect(employmentLabel('principal')).toBe('Principal / Mgmt');
    expect(isEmployment('staff')).toBe(false);
  });
  it('a new tour starts from the People groups', () => {
    expect(employmentFromGroups(['artist'])).toBe('principal');
    expect(employmentFromGroups(['mgmt', 'crew'])).toBe('principal');
    expect(employmentFromGroups(['band'])).toBe('band');
    expect(employmentFromGroups(['tour_manager', 'production'])).toBe('crew');
    expect(employmentFromGroups(null)).toBe('crew');
    expect(groupsOf({ groups: ['band', 3] })).toEqual(['band']);
    expect(groupsOf(null)).toEqual([]);
  });
});

describe('Payroll cells write the shared data', () => {
  it('Name renames the People record — not the card', async () => {
    const res = await patchCard({ id: 'card-sam', person_name: '  Samantha Smith ' });
    expect(res.status).toBe(200);
    expect(row('personnel', 'sam').name).toBe('Samantha Smith');
    expect(row('personnel_rates', 'card-sam').person_name).toBe('Sam Smith'); // the trigger's job
    expect(refreshed).toEqual([TOUR]); // salary lines are labelled by name
  });

  it('Role changes THIS tour’s roster row — never the person', async () => {
    expect((await patchCard({ id: 'card-sam', role: 'Monitors' })).status).toBe(200);
    expect(row('tour_personnel', 'tp-sam').role).toBe('Monitors');
    expect(row('personnel', 'sam').role).toBe('FOH');
    expect(row('personnel_rates', 'card-sam').role).toBe('FOH'); // the trigger's job
  });

  it('a role they already hold on this tour is refused, nothing written', async () => {
    const res = await patchCard({ id: 'card-sam', role: 'Driver' });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already on this tour as Driver/);
    expect(row('tour_personnel', 'tp-sam').role).toBe('FOH');
  });

  it('blank name or role is refused', async () => {
    expect((await patchCard({ id: 'card-sam', person_name: ' ' })).status).toBe(400);
    expect((await patchCard({ id: 'card-sam', role: null })).status).toBe(400);
    expect(row('personnel', 'sam').name).toBe('Sam Smith');
  });

  it('Employment is the card’s own field, three values only', async () => {
    expect((await patchCard({ id: 'card-sam', person_type: 'band' })).status).toBe(200);
    expect(row('personnel_rates', 'card-sam').person_type).toBe('band');
    expect((await patchCard({ id: 'card-sam', person_type: 'staff' })).status).toBe(400);
    expect(refreshed).toEqual([]);
  });

  it('a card off the roster keeps its own name and role', async () => {
    expect((await patchCard({ id: 'card-loose', person_name: 'Local runner', role: 'Runner 2' })).status).toBe(200);
    expect(row('personnel_rates', 'card-loose')).toMatchObject({ person_name: 'Local runner', role: 'Runner 2' });
    expect(row('personnel', 'sam').name).toBe('Sam Smith');
  });

  it('another workspace’s card is not found', async () => {
    db.seed('personnel_rates', [{ id: 'card-x', tour_id: 't-x', workspace_id: 'ws-2', person_name: 'X', person_id: 'sam', tour_personnel_id: 'tp-sam' }]);
    expect((await patchCard({ id: 'card-x', person_name: 'Hacked' })).status).toBe(404);
    expect(row('personnel', 'sam').name).toBe('Sam Smith');
  });
});

describe('Crew panel writes the same data', () => {
  it('Employment on the Crew panel lands on the payroll card', async () => {
    expect((await patchMember('tp-sam', { person_type: 'principal' })).status).toBe(200);
    expect(row('personnel_rates', 'card-sam').person_type).toBe('principal');
  });

  it('Role on the Crew panel is the roster row; a clash is a 409, not a 500', async () => {
    expect((await patchMember('tp-sam', { role: 'Monitors' })).status).toBe(200);
    expect(row('tour_personnel', 'tp-sam').role).toBe('Monitors');
    const clash = await patchMember('tp-sam', { role: 'Driver' });
    expect(clash.status).toBe(409);
    expect(row('tour_personnel', 'tp-sam').role).toBe('Monitors');
  });

  it('bad employment is refused before anything is written', async () => {
    expect((await patchMember('tp-sam', { role: 'Monitors', person_type: 'freelance' })).status).toBe(400);
    expect(row('tour_personnel', 'tp-sam').role).toBe('FOH');
  });
});

describe('adding someone to a tour starts from their People record', () => {
  const add = (body: Record<string, unknown>) =>
    roster.POST(new Request(`http://x/api/tours/${TOUR}/personnel`, { method: 'POST', body: JSON.stringify(body) }), {
      params: Promise.resolve({ id: TOUR }),
    });
  beforeEach(() => {
    db.seed('tours', [{ id: TOUR, workspace_id: WS }]);
    db.seed('persons', [{ id: 'ana', workspace_id: WS, full_name: 'Ana' }]);
    db.seed('personnel', [{ id: 'ana', workspace_id: WS, name: 'Ana', role: 'Bass', extended_profile: { groups: ['band'] } }]);
  });

  it('no role typed → their usual role; employment from their groups', async () => {
    const res = await add({ person_id: 'ana' });
    expect(res.status).toBe(200);
    const tp = db.t('tour_personnel').find((r) => r.person_id === 'ana')!;
    expect(tp.role).toBe('Bass');
    expect(tp.employment_type).toBeUndefined(); // the retired field is not written
    expect(db.t('personnel_rates').find((r) => r.tour_personnel_id === tp.id)).toMatchObject({ person_type: 'band', role: 'Bass' });
  });

  it('a typed role wins for this tour only', async () => {
    await add({ person_id: 'ana', role: 'Keys' });
    expect(db.t('tour_personnel').find((r) => r.person_id === 'ana')!.role).toBe('Keys');
    expect(row('personnel', 'ana').role).toBe('Bass');
  });
});

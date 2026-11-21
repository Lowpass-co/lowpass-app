/* GET …/personnel/[memberId]/rates — the Crew panel's Rates block.
   Nov 2026: it asked tour_personnel for `display_name` (no such column), so it
   404'd for everyone and the panel said "Could not load rates". The fake is
   given tour_personnel's real columns so that class of mistake fails here. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDb } from '@/test-utils/fakeSupabase';
import { DEFAULT_RATE_TYPE_IDS } from '@/lib/payroll/rateLines';

let db: FakeDb;
let access: { manager: boolean; role: string; tour: Record<string, string> } | null;
const WS = 'ws-1';
const TOUR = 'tour-1';

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => {
    const c = db.client();
    return Object.assign(c, { auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } });
  },
}));
vi.mock('@/lib/permissions/server', () => ({
  getActiveMembership: async () => ({ workspace_id: WS, member_id: 'm', role: access?.role ?? 'readonly', is_workspace_owner: false, tags: [] }),
}));
vi.mock('@/lib/permissions/tourAccess', async (orig) => ({
  ...(await orig<typeof import('@/lib/permissions/tourAccess')>()),
  getViewerAccess: async () => access,
}));

const { GET } = await import('./route');
const get = (memberId = 'tp-1') =>
  GET(new Request(`http://x/api/tours/${TOUR}/personnel/${memberId}/rates`), { params: Promise.resolve({ id: TOUR, memberId }) });

beforeEach(() => {
  access = { manager: true, role: 'manager', tour: {} };
  db = new FakeDb({
    // tour_personnel as it really is (050 + 078 + 101 + later) — no display_name.
    columns: {
      tour_personnel: ['id', 'workspace_id', 'tour_id', 'person_id', 'role', 'role_tag', 'rate_currency', 'rate_period', 'starts_on', 'ends_on', 'status', 'employment_type', 'created_at', 'updated_at'],
    },
  });
  db.seed('tour_personnel', [{ id: 'tp-1', workspace_id: WS, tour_id: TOUR, person_id: 'p1', role: 'FOH' }]);
  db.seed('rate_types', [{ id: DEFAULT_RATE_TYPE_IDS.show, name: 'Show', bucket: 'fee', basis: 'per_day', day_statuses: ['show'], order_index: 1, workspace_id: null }]);
});

describe('crew rates', () => {
  it('a rate comes back as a NUMBER for someone with a card', async () => {
    db.seed('personnel_rates', [{ id: 'card-1', tour_id: TOUR, workspace_id: WS, person_id: 'p1', internal_rate: 50 }]);
    db.seed('personnel_rate_lines', [{ personnel_rate_id: 'card-1', rate_type_id: DEFAULT_RATE_TYPE_IDS.show, amount: 350, tour_id: TOUR }]);
    const res = await get();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { card_id: string; lines: Array<{ name: string; amount: number }>; rates: { internal_rate: number | null } };
    expect(body.card_id).toBe('card-1');
    expect(body.lines).toEqual([{ name: 'Show', amount: 350 }]);
    expect(body.rates.internal_rate).toBe(50);
  });

  it('no rates yet is NOT an error — empty lines, so the panel says "No rates yet"', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(((await res.json()) as { lines: unknown[] }).lines).toEqual([]);
  });

  it('rates are money: no Payroll access → 403; a Member never sees the internal rate', async () => {
    access = { manager: false, role: 'readonly', tour: { logistics: 'view' } };
    expect((await get()).status).toBe(403);
    access = { manager: false, role: 'readonly', tour: { payroll: 'view' } };
    db.seed('personnel_rates', [{ id: 'card-1', tour_id: TOUR, workspace_id: WS, person_id: 'p1', internal_rate: 50 }]);
    const body = (await (await get()).json()) as { rates: { internal_rate: number | null } };
    expect(body.rates.internal_rate).toBeNull();
  });

  it('someone not on this tour → 404', async () => {
    expect((await get('nope')).status).toBe(404);
  });
});

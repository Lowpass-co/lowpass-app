/* ============================================
   Money audit #1 — painting payroll days must never lose an earlier paint.
   POST /api/budget/payroll against the in-memory DB, with the merge function
   absent (migration 269 not pasted) so the compare-and-swap fallback runs.
   ============================================ */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDb } from '@/test-utils/fakeSupabase';
import { DEFAULT_RATE_TYPE_IDS as RT } from '@/lib/payroll/rateLines';
import { mergeDayStatuses, parseDayStatusChanges } from '@/lib/payroll/mergeDayStatuses';

let db: FakeDb;

vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => db.client() }));
vi.mock('@/lib/auth/workspace-check', () => ({ requireWrite: async () => ({ userId: 'user-1' }) }));
vi.mock('@/lib/payroll/finalize', () => ({
  isPayrollFinalized: async () => false,
  PAYROLL_FINALIZED_ERROR: 'finalized',
}));

const { POST } = await import('./route');

const WS = 'ws-1';
const TOUR = 'tour-1';
const paint = (body: Record<string, unknown>) =>
  POST(new Request('http://x/api/budget/payroll', {
    method: 'POST',
    body: JSON.stringify({ tour_id: TOUR, personnel_id: 'p-tm', week_start: '2026-08-10', ...body }),
  }));
const week = () => db.t('payroll_entries').find((e) => e.personnel_id === 'p-tm')?.day_statuses as Record<string, string>;

beforeEach(() => {
  db = new FakeDb({ unique: { payroll_entries: [['personnel_id', 'week_start']] } });
  db.seed('profiles', [{ id: 'user-1', workspace_id: WS }]);
  db.seed('tours', [{ id: TOUR, workspace_id: WS, currency: 'GBP' }]);
  db.seed('routing', [
    { tour_id: TOUR, date: '2026-08-14', day_type: 'off' },
    { tour_id: TOUR, date: '2026-08-15', day_type: 'show' },
  ]);
  db.seed('personnel_rates', [{ id: 'p-tm', tour_id: TOUR, workspace_id: WS, person_name: 'Tour Manager', role: null, tour_personnel_id: 'tp-1' }]);
  db.seed('personnel_rate_lines', [
    { personnel_rate_id: 'p-tm', tour_id: TOUR, rate_type_id: RT.show, amount: 475 },
    { personnel_rate_id: 'p-tm', tour_id: TOUR, rate_type_id: RT.offTravel, amount: 475 },
  ]);
});

describe('payroll paint merge', () => {
  it('pure merge: sets, overwrites and clears', () => {
    expect(mergeDayStatuses({ a: 'show', b: 'off' }, { b: 'travel', c: 'show', a: null })).toEqual({ b: 'travel', c: 'show' });
    expect(parseDayStatusChanges({ '2026-08-15': 'show', '2026-08-16': null })).toEqual({ '2026-08-15': 'show', '2026-08-16': null });
    expect(parseDayStatusChanges({ 'not-a-date': 'show' })).toBeNull();
    expect(parseDayStatusChanges(['x'])).toBeNull();
  });

  it('two paints in one week both land', async () => {
    expect((await paint({ changes: { '2026-08-14': 'travel' } })).status).toBe(200);
    expect((await paint({ changes: { '2026-08-15': 'pd_only' } })).status).toBe(200);
    expect(week()).toEqual({ '2026-08-14': 'travel', '2026-08-15': 'pd_only' });
  });

  it('a paint that races another write is retried, not lost', async () => {
    await paint({ changes: { '2026-08-14': 'travel' } });
    // Between our read and our write, someone else paints the 16th.
    let fired = false;
    db.beforeWrite.push((op, table) => {
      if (fired || op !== 'update' || table !== 'payroll_entries') return;
      fired = true;
      const row = db.t('payroll_entries')[0];
      row.day_statuses = { ...(row.day_statuses as object), '2026-08-16': 'show' };
      row.updated_at = db.now();
    });
    expect((await paint({ changes: { '2026-08-15': 'off' } })).status).toBe(200);
    expect(week()).toEqual({ '2026-08-14': 'travel', '2026-08-15': 'off', '2026-08-16': 'show' });
  });

  it('a paint keeps the week’s notes (it used to null them)', async () => {
    await paint({ changes: { '2026-08-14': 'travel' }, notes: 'Flew in early' });
    await paint({ changes: { '2026-08-15': 'show' } });
    expect(db.t('payroll_entries')[0].notes).toBe('Flew in early');
  });

  it('an old client sending the whole week is merged, not replaced', async () => {
    await paint({ changes: { '2026-08-14': 'travel' } });
    await paint({ day_statuses: { '2026-08-15': 'show' } });
    expect(week()).toEqual({ '2026-08-14': 'travel', '2026-08-15': 'show' });
  });

  it('rejects a date outside the week', async () => {
    expect((await paint({ changes: { '2026-08-17': 'show' } })).status).toBe(400);
  });

  it('the paint reaches the budget immediately', async () => {
    await paint({ changes: { '2026-08-14': 'no_tour' } });
    const salary = db.t('budget_line_items').find((l) => l.source_entity_type === 'payroll' && l.source_entity_id === 'p-tm');
    expect(salary?.proposed_cost).toBe(475); // only the show day is worked now
  });
});

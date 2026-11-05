import { describe, expect, it } from 'vitest';
import { FakeDb } from '@/test-utils/fakeSupabase';
import { loadOnboardingStatus } from './status';

const WS = 'ws-1';
const NOW = new Date('2026-11-05T12:00:00Z');

function base() {
  const db = new FakeDb();
  db.seed('workspace_members', [{ id: 'm1', workspace_id: WS, user_id: 'u1', role: 'admin', created_at: '2026-11-04T09:00:00Z' }]);
  return db;
}

const run = (db: FakeDb, role: 'admin' | 'manager' | 'readonly' = 'admin') =>
  loadOnboardingStatus(db.client(), { workspaceId: WS, userId: 'u1', role, now: NOW });

describe('loadOnboardingStatus', () => {
  it('an empty workspace has nothing done and a new admin', async () => {
    const s = await run(base());
    expect(s).toEqual({
      canSetUp: true, newMember: true, artistId: null, tourId: null,
      done: { artist: false, tour: false, show: false, advance: false, receipt: false, team: false },
    });
  });

  it('ticks each step from what exists, in this workspace only', async () => {
    const db = base();
    db.seed('artists', [
      { id: 'a-old', workspace_id: WS, created_at: '2026-01-01' },
      { id: 'a-new', workspace_id: WS, created_at: '2026-06-01' },
      { id: 'a-other', workspace_id: 'ws-2', created_at: '2026-12-01' },
    ]);
    db.seed('tours', [
      { id: 't-old', workspace_id: WS, created_at: '2026-02-01' },
      { id: 't-new', workspace_id: WS, created_at: '2026-07-01' },
      { id: 't-other', workspace_id: 'ws-2', created_at: '2026-12-01' },
    ]);
    db.seed('routing', [{ id: 'r1', tour_id: 't-old', day_type: 'festival' }]);
    db.seed('advance_intake_links', [{ id: 'l1', workspace_id: WS, status: 'pending' }]);
    db.seed('expense_receipts', [{ id: 'x1', workspace_id: 'ws-2' }]);
    db.seed('workspace_invites', [{ id: 'i1', workspace_id: WS }]);
    const s = await run(db);
    expect(s.artistId).toBe('a-new');
    expect(s.tourId).toBe('t-new');
    expect(s.done).toEqual({ artist: true, tour: true, show: true, advance: true, receipt: false, team: true });
  });

  it('days off and travel days are not show dates; revoked links are not asks', async () => {
    const db = base();
    db.seed('tours', [{ id: 't1', workspace_id: WS, created_at: '2026-07-01' }]);
    db.seed('routing', [{ id: 'r1', tour_id: 't1', day_type: 'off' }, { id: 'r2', tour_id: 't1', day_type: 'travel' }]);
    db.seed('advance_intake_links', [{ id: 'l1', workspace_id: WS, status: 'revoked' }]);
    const s = await run(db);
    expect(s.done.show).toBe(false);
    expect(s.done.advance).toBe(false);
  });

  it('a second member counts as a team; read-only members cannot set up; old members are not new', async () => {
    const db = new FakeDb();
    db.seed('workspace_members', [
      { id: 'm1', workspace_id: WS, user_id: 'u1', role: 'readonly', created_at: '2026-01-01T00:00:00Z' },
      { id: 'm2', workspace_id: WS, user_id: 'u2', role: 'admin', created_at: '2025-01-01T00:00:00Z' },
    ]);
    const s = await run(db, 'readonly');
    expect(s.done.team).toBe(true);
    expect(s.canSetUp).toBe(false);
    expect(s.newMember).toBe(false);
  });

  it('a failed read is an error, not a silent "not done"', async () => {
    const db = base();
    db.failReads.add('expense_receipts');
    await expect(run(db)).rejects.toThrow(/receipts/);
  });
});

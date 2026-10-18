import { describe, expect, it } from 'vitest';
import { FakeDb } from '@/test-utils/fakeSupabase';
import { DEFAULT_RATE_TYPE_IDS as T } from '@/lib/payroll/rateLines';
import { insertSeedLines, lastTourSeed } from './seedRateCard';

const WS = 'ws-1';
const P = '11111111-2222-3333-4444-555555555555';

function db() {
  const d = new FakeDb();
  d.seed('tours', [
    { id: 'old', start_date: '2025-04-01' },
    { id: 'recent', start_date: '2026-08-30' },
    { id: 'new', start_date: '2026-11-10' },
  ]);
  d.seed('personnel_rates', [
    { id: 'c-old', tour_id: 'old', workspace_id: WS, person_id: P },
    // older card linked only by roster_personnel_id — still found
    { id: 'c-recent', tour_id: 'recent', workspace_id: WS, person_id: null, roster_personnel_id: P },
  ]);
  d.seed('personnel_rate_lines', [
    { personnel_rate_id: 'c-old', workspace_id: WS, rate_type_id: T.show, amount: 100 },
    { personnel_rate_id: 'c-recent', workspace_id: WS, rate_type_id: T.dayRate, amount: 350 },
    { personnel_rate_id: 'c-recent', workspace_id: WS, rate_type_id: T.perDiem, amount: 40 },
  ]);
  return d;
}

describe('lastTourSeed → insertSeedLines', () => {
  it('a new tour card copies the most recent other tour', async () => {
    const d = db();
    const seed = await lastTourSeed(d.client(), { workspaceId: WS, tourId: 'new', personId: P });
    expect(seed.fromTourId).toBe('recent');
    expect(seed.perDiem).toBe(40);
    await insertSeedLines(d.client(), { workspaceId: WS, tourId: 'new', cardId: 'c-new', seed });
    const written = d.t('personnel_rate_lines').filter((l) => l.personnel_rate_id === 'c-new');
    const byType = new Map(written.map((l) => [l.rate_type_id, l.amount]));
    expect(byType.get(T.dayRate)).toBe(350);
    expect(byType.get(T.perDiem)).toBe(40);
    expect(byType.get(T.show)).toBe(0); // base line, not the old tour's £100
    expect(written.every((l) => l.tour_id === 'new' && l.workspace_id === WS)).toBe(true);
  });

  it('first tour ever → blank (five zero lines)', async () => {
    const d = db();
    const seed = await lastTourSeed(d.client(), { workspaceId: WS, tourId: 'new', personId: '99999999-2222-3333-4444-555555555555' });
    expect(seed.fromTourId).toBeNull();
    expect(seed.lines.every((l) => l.amount === 0)).toBe(true);
  });

  it('a non-uuid person id never reaches a query filter', async () => {
    const d = db();
    const seed = await lastTourSeed(d.client(), { workspaceId: WS, tourId: 'new', personId: 'x,workspace_id.neq.0' });
    expect(seed.fromTourId).toBeNull();
    expect(d.log.filter((l) => l.op === 'select').length).toBe(0);
  });
});

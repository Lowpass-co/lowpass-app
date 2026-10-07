/* ============================================
   Money repair — the derived-line reconcile, end to end on an in-memory DB.

   The fixture is GOOD NEIGHBOURS · SUMMER SONIC '26 as Adam budgeted it in
   his sheet (SUMMARY tab, PROPOSED column):
     Salaries £8,075 · Per diem £600 · Hotels £6,000 · Flights £9,000
   Every figure below is asserted to the penny against that sheet.
   ============================================ */

import { describe, expect, it } from 'vitest';
import { FakeDb } from '@/test-utils/fakeSupabase';
import { DEFAULT_RATE_TYPE_IDS as RT } from '@/lib/payroll/rateLines';
import { reconcileDerivedBudgetLines } from './reconcileDerivedLines';

const WS = 'ws-1';
const TOUR = 'tour-ss26';

function newDb() {
  return new FakeDb({
    unique: { budget_line_items: [['tour_id', 'source_entity_type', 'source_entity_id']] },
    cascade: [
      { child: 'budget_line_item_transactions', column: 'line_item_id', parent: 'budget_line_items', onDelete: 'cascade' },
      { child: 'budget_version_lines', column: 'line_item_id', parent: 'budget_line_items', onDelete: 'cascade' },
      { child: 'expense_receipts', column: 'linked_line_item_id', parent: 'budget_line_items', onDelete: 'set null' },
    ],
  });
}

/** Summer Sonic '26: two festival shows, an off day and a travel day. */
function seedSummerSonic(db: FakeDb, opts: { version?: 'draft' | 'approved' | null } = {}) {
  db.seed('tours', [{ id: TOUR, workspace_id: WS, currency: 'GBP' }]);
  db.seed('budget_fx_rates', [
    { tour_id: TOUR, workspace_id: WS, currency: 'JPY', rate_to_tour_currency: 0.0051 },
    { tour_id: TOUR, workspace_id: WS, currency: 'USD', rate_to_tour_currency: 0.79 },
  ]);
  db.seed('routing', [
    { id: 'r14', tour_id: TOUR, date: '2026-08-14', day_type: 'off' },
    { id: 'r15', tour_id: TOUR, date: '2026-08-15', day_type: 'show' },
    { id: 'r16', tour_id: TOUR, date: '2026-08-16', day_type: 'show' },
    { id: 'r17', tour_id: TOUR, date: '2026-08-17', day_type: 'travel' },
  ]);
  if (opts.version) {
    db.seed('budget_versions', [{ id: 'v1', tour_id: TOUR, workspace_id: WS, version_number: 1, status: opts.version }]);
  }

  // Rate cards (show / travel / per diem), as on the SUMMARY tab.
  const people: Array<[string, string, number, number, number]> = [
    ['p-tm-adv', 'Tour Manager | Advance', 237.5, 237.5, 0],
    ['p-tm', 'Tour Manager', 475, 475, 25],
    ['p-pm-adv', 'Production Manager | Advance', 200, 200, 0],
    ['p-pm', 'PM/Mons', 400, 400, 25],
    ['p-gt', 'Guitar Tech', 300, 300, 25],
    ['p-dr', 'Drums', 300, 150, 25],
    ['p-gu', 'Guitar', 250, 150, 25],
    ['p-ke', 'Keys', 250, 150, 25],
  ];
  db.seed('personnel_rates', people.map(([id, name], i) => ({
    id, tour_id: TOUR, workspace_id: WS, person_name: name, role: null, order_index: i, tour_personnel_id: `tp-${id}`,
  })));
  db.seed('personnel_rate_lines', people.flatMap(([id, , show, travel, pd]) => [
    { personnel_rate_id: id, tour_id: TOUR, rate_type_id: RT.show, amount: show },
    { personnel_rate_id: id, tour_id: TOUR, rate_type_id: RT.offTravel, amount: travel },
    { personnel_rate_id: id, tour_id: TOUR, rate_type_id: RT.perDiem, amount: pd },
  ]));
  // The advance cards work two days only: painted off the 16th and 17th.
  db.seed('payroll_entries', ['p-tm-adv', 'p-pm-adv'].map((pid) => ({
    tour_id: TOUR, workspace_id: WS, personnel_id: pid, week_start: '2026-08-10',
    day_statuses: { '2026-08-16': 'no_tour', '2026-08-17': 'no_tour' },
  })));

  // One hotel, four rooms × six nights × £250 = £6,000. Room 1 is SHARED by
  // two people — it must be counted once, not once per occupant.
  db.seed('hotels', [{ id: 'h1', tour_id: TOUR, workspace_id: WS, name: 'Hotel Tokyo', city: 'Tokyo', check_in_at: '2026-08-10' }]);
  db.seed('rooms', [1, 2, 3, 4].map((n) => ({ id: `room${n}`, hotel_id: 'h1', workspace_id: WS, cost_amount: 250, cost_currency: 'GBP', room_type: 'DBL' })));
  db.seed('room_assignments', [
    { room_id: 'room1', workspace_id: WS, starts_on: '2026-08-10', ends_on: '2026-08-16' },
    { room_id: 'room1', workspace_id: WS, starts_on: '2026-08-10', ends_on: '2026-08-16' },
    { room_id: 'room2', workspace_id: WS, starts_on: '2026-08-10', ends_on: '2026-08-16' },
    { room_id: 'room3', workspace_id: WS, starts_on: '2026-08-10', ends_on: '2026-08-16' },
    { room_id: 'room4', workspace_id: WS, starts_on: '2026-08-10', ends_on: '2026-08-16' },
  ]);

  const flights: Array<[string, string, string, number]> = [
    ['ADAM ROWLEY', 'HND', 'BNA', 1500], ['RICHIE TAYLOR', 'HND', 'LHR', 800], ['CHARLIE YAPP', 'HND', 'LHR', 800],
    ['DUNCAN BROOKFIELD', 'HND', 'LHR', 800], ['JAMES COATES', 'HND', 'LHR', 800], ['TERESA ORIGONE', 'HND', 'LHR', 800],
    ['OLIVER FOX', 'HND', 'LHR', 1750], ['SCOTT VERRILL', 'HND', 'LHR', 1750],
  ];
  db.seed('flights', flights.map(([name, o, d, cost], i) => ({
    id: `f${i}`, tour_id: TOUR, workspace_id: WS, person_name: name, origin_airport: o, destination_airport: d, cost_amount: cost, cost_currency: 'GBP',
  })));
}

const lines = (db: FakeDb, type?: string) =>
  db.t('budget_line_items').filter((l) => l.tour_id === TOUR && (!type || l.source_entity_type === type));
const sum = (rows: Array<Record<string, unknown>>, col: string) =>
  Math.round(rows.reduce((a, r) => a + Number(r[col] ?? 0), 0) * 100) / 100;

describe('derived lines — Summer Sonic penny test', () => {
  it('builds every automatic line to the sheet’s PROPOSED figures', async () => {
    const db = newDb();
    seedSummerSonic(db);
    const res = await reconcileDerivedBudgetLines(db.client(), TOUR, WS);
    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);

    expect(sum(lines(db, 'payroll'), 'proposed_cost')).toBe(8075);
    expect(sum(lines(db, 'payroll_per_diem'), 'proposed_cost')).toBe(600);
    expect(sum(lines(db, 'hotel_booking'), 'proposed_cost')).toBe(6000);
    expect(sum(lines(db, 'flight'), 'proposed_cost')).toBe(9000);
    // No receipts yet → actual = the computed figure.
    expect(sum(lines(db), 'actual_cost')).toBe(8075 + 600 + 6000 + 9000);

    const tm = lines(db, 'payroll').find((l) => l.source_entity_id === 'p-tm');
    expect(tm?.proposed_cost).toBe(1900);
    const adv = lines(db, 'payroll').find((l) => l.source_entity_id === 'p-tm-adv');
    expect(adv?.proposed_cost).toBe(475);
  });

  it('a second pass with nothing changed writes nothing', async () => {
    const db = newDb();
    seedSummerSonic(db);
    await reconcileDerivedBudgetLines(db.client(), TOUR, WS);
    const before = db.writes();
    const res = await reconcileDerivedBudgetLines(db.client(), TOUR, WS);
    expect(res.writes).toBe(0);
    expect(db.writes()).toBe(before);
  });

  it('a payroll paint moves only that person’s line', async () => {
    const db = newDb();
    seedSummerSonic(db);
    await reconcileDerivedBudgetLines(db.client(), TOUR, WS);
    db.seed('payroll_entries', [{ tour_id: TOUR, workspace_id: WS, personnel_id: 'p-dr', week_start: '2026-08-10', day_statuses: { '2026-08-14': 'show' } }]);
    const res = await reconcileDerivedBudgetLines(db.client(), TOUR, WS, { families: ['payroll', 'payroll_per_diem'] });
    expect(res.writes).toBe(1); // drums' salary line; per diem unchanged
    expect(lines(db, 'payroll').find((l) => l.source_entity_id === 'p-dr')?.proposed_cost).toBe(1050);
    expect(sum(lines(db, 'payroll'), 'proposed_cost')).toBe(8225);
  });
});

describe('derived lines — receipts are never lost', () => {
  it('a receipt sets the actual and the next pass leaves it alone', async () => {
    const db = newDb();
    seedSummerSonic(db);
    await reconcileDerivedBudgetLines(db.client(), TOUR, WS);
    const hotelLine = lines(db, 'hotel_booking')[0];
    db.seed('budget_line_item_transactions', [{ line_item_id: hotelLine.id, workspace_id: WS, amount: 5812.4, currency: null }]);

    await reconcileDerivedBudgetLines(db.client(), TOUR, WS);
    expect(hotelLine.actual_cost).toBe(5812.4);
    expect(hotelLine.proposed_cost).toBe(6000);
  });

  it('converts a foreign receipt into the line’s currency', async () => {
    const db = newDb();
    seedSummerSonic(db);
    await reconcileDerivedBudgetLines(db.client(), TOUR, WS);
    const flightLine = lines(db, 'flight').find((l) => l.source_entity_id === 'f0')!;
    // ¥250,000 at 0.0051 = £1,275.00 — not £250,000.
    db.seed('budget_line_item_transactions', [{ line_item_id: flightLine.id, workspace_id: WS, amount: 250000, currency: 'JPY' }]);
    await reconcileDerivedBudgetLines(db.client(), TOUR, WS, { families: ['flight'] });
    expect(flightLine.actual_cost).toBe(1275);
  });

  it('an explicit override is never touched', async () => {
    const db = newDb();
    seedSummerSonic(db);
    await reconcileDerivedBudgetLines(db.client(), TOUR, WS);
    const tm = lines(db, 'payroll').find((l) => l.source_entity_id === 'p-tm')!;
    tm.actual_cost = 2100;
    tm.actual_cost_override = true;
    await reconcileDerivedBudgetLines(db.client(), TOUR, WS);
    expect(tm.actual_cost).toBe(2100);
  });

  it('deleting the LAST hotel removes its cost, but keeps a line that has receipts', async () => {
    const db = newDb();
    seedSummerSonic(db);
    db.seed('hotels', [{ id: 'h2', tour_id: TOUR, workspace_id: WS, name: 'Osaka Inn', city: 'Osaka', check_in_at: '2026-08-16' }]);
    await reconcileDerivedBudgetLines(db.client(), TOUR, WS);
    const tokyo = lines(db, 'hotel_booking').find((l) => l.source_entity_id === 'h1')!;
    db.seed('budget_line_item_transactions', [{ id: 'txn-tokyo', line_item_id: tokyo.id, workspace_id: WS, amount: 5900, currency: null }]);

    // Both hotels deleted (rooms cascade in the real DB).
    db.tables.set('hotels', []);
    db.tables.set('rooms', []);
    const res = await reconcileDerivedBudgetLines(db.client(), TOUR, WS, { families: ['hotel_booking'] });
    expect(res.ok).toBe(true);

    // Osaka (no receipts) is gone; Tokyo survives as a manual line with its spend.
    expect(lines(db).filter((l) => String(l.label).includes('Osaka'))).toHaveLength(0);
    const kept = db.t('budget_line_items').find((l) => l.id === tokyo.id)!;
    expect(kept.source_entity_type).toBeNull();
    expect(kept.hotel_id).toBeNull();
    expect(kept.actual_cost).toBe(5900);
    expect(kept.proposed_cost).toBe(0);
    expect(String(kept.label)).toMatch(/\(source deleted\)$/);
    expect(db.t('budget_line_item_transactions').find((t) => t.id === 'txn-tokyo')?.line_item_id).toBe(tokyo.id);
  });
});

describe('derived lines — notes and documents count as attached', () => {
  it('a vanished source whose line has an attached invoice is detached, not deleted', async () => {
    const db = newDb();
    seedSummerSonic(db);
    await reconcileDerivedBudgetLines(db.client(), TOUR, WS);
    const keys = lines(db, 'payroll').find((l) => l.source_entity_id === 'p-ke')!;
    db.seed('budget_line_item_attachments', [{ line_item_id: keys.id, path: 'invoice-keys.pdf' }]);
    db.tables.set('personnel_rates', db.t('personnel_rates').filter((p) => p.id !== 'p-ke'));
    await reconcileDerivedBudgetLines(db.client(), TOUR, WS, { families: ['payroll'] });
    const kept = db.t('budget_line_items').find((l) => l.id === keys.id);
    expect(kept).toBeDefined();
    expect(kept!.source_entity_type).toBeNull();
    expect(kept!.proposed_cost).toBe(0);
  });
});

describe('derived lines — a refused delete detaches instead', () => {
  it('a line an approved snapshot still references is unlinked, not left erroring', async () => {
    const db = newDb();
    seedSummerSonic(db);
    await reconcileDerivedBudgetLines(db.client(), TOUR, WS);
    db.tables.set('flights', db.t('flights').filter((f) => f.id !== 'f7'));
    db.failDeletes.set('budget_line_items', { message: 'budget version v0 is locked', code: '23514' });
    const res = await reconcileDerivedBudgetLines(db.client(), TOUR, WS, { families: ['flight'] });
    expect(res.ok).toBe(true);
    const scott = db.t('budget_line_items').find((l) => String(l.label).startsWith('SCOTT VERRILL'))!;
    expect(scott.source_entity_type).toBeNull();
    expect(scott.flight_id).toBeNull();
    expect(scott.proposed_cost).toBe(0);
    expect(scott.actual_cost).toBe(0);
    expect(sum(lines(db, 'flight'), 'proposed_cost')).toBe(7250);
  });
});

describe('derived lines — duplicates', () => {
  it('merges a duplicate into the line with receipts, moving everything attached', async () => {
    const db = newDb();
    seedSummerSonic(db);
    // The old race: two lines for the same flight, receipts on the second.
    db.opts.unique = {}; // a database without migration 269 yet
    db.seed('budget_line_items', [
      { id: 'dup-a', tour_id: TOUR, workspace_id: WS, source_entity_type: 'flight', source_entity_id: 'f6', label: 'x', category: 'flights', proposed_cost: 1750, actual_cost: 1750, currency: null, section_id: null, created_at: '2026-01-01T00:00:00Z' },
      { id: 'dup-b', tour_id: TOUR, workspace_id: WS, source_entity_type: 'flight', source_entity_id: 'f6', label: 'x', category: 'flights', proposed_cost: 1750, actual_cost: 1702.15, currency: null, section_id: null, created_at: '2026-01-02T00:00:00Z' },
    ]);
    db.seed('budget_line_item_transactions', [{ id: 't-b', line_item_id: 'dup-b', workspace_id: WS, amount: 1702.15, currency: null }]);
    db.seed('expense_receipts', [{ id: 'rec-a', tour_id: TOUR, workspace_id: WS, linked_line_item_id: 'dup-a' }]);

    await reconcileDerivedBudgetLines(db.client(), TOUR, WS, { families: ['flight'] });

    const f6 = lines(db, 'flight').filter((l) => l.source_entity_id === 'f6');
    expect(f6).toHaveLength(1);
    expect(f6[0].id).toBe('dup-b');
    expect(f6[0].actual_cost).toBe(1702.15);
    expect(db.t('expense_receipts')[0].linked_line_item_id).toBe('dup-b');
    expect(db.t('budget_line_item_transactions')[0].line_item_id).toBe('dup-b');
    expect(sum(lines(db, 'flight'), 'proposed_cost')).toBe(9000);
  });
});

describe('derived lines — approved budgets and failures', () => {
  it('an APPROVED budget keeps its baseline; only the actual moves', async () => {
    const db = newDb();
    seedSummerSonic(db, { version: 'draft' });
    await reconcileDerivedBudgetLines(db.client(), TOUR, WS);
    // Draft → the snapshot was mirrored.
    expect(db.t('budget_version_lines').length).toBe(lines(db).length);
    db.t('budget_versions')[0].status = 'approved';

    // Keys get a pay rise after sign-off.
    const keysLine = db.t('personnel_rate_lines').find((r) => r.personnel_rate_id === 'p-ke' && r.rate_type_id === RT.show)!;
    keysLine.amount = 300;
    await reconcileDerivedBudgetLines(db.client(), TOUR, WS);
    const keys = lines(db, 'payroll').find((l) => l.source_entity_id === 'p-ke')!;
    expect(keys.proposed_cost).toBe(800); // frozen baseline
    expect(keys.actual_cost).toBe(900); // live
  });

  it('a failed source read skips that family and touches nothing', async () => {
    const db = newDb();
    seedSummerSonic(db);
    await reconcileDerivedBudgetLines(db.client(), TOUR, WS);
    const before = lines(db, 'hotel_booking').map((l) => ({ ...l }));
    db.failReads.add('rooms');
    const res = await reconcileDerivedBudgetLines(db.client(), TOUR, WS);
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/rooms/);
    expect(res.families).not.toContain('hotel_booking');
    expect(res.families).toContain('payroll');
    expect(lines(db, 'hotel_booking')).toEqual(before);
  });

  it('an unreadable lock state aborts the whole pass rather than guessing "unlocked"', async () => {
    const db = newDb();
    seedSummerSonic(db, { version: 'approved' });
    db.failReads.add('budget_versions');
    const res = await reconcileDerivedBudgetLines(db.client(), TOUR, WS);
    expect(res.ok).toBe(false);
    expect(lines(db)).toHaveLength(0);
    expect(db.writes()).toBe(0);
  });
});

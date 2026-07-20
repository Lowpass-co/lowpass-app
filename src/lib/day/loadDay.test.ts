/* ============================================
   LOWPASS — The Day loader + slice smoke (D1-1 · DAY-01/02, ROLE-01)

   Proves the server-side slice contract WITHOUT a database: a fake Supabase
   feeds fixed rows into loadDay(), and we assert which block KEYS are present
   on the returned object per role. The headline (Adam's verification): a crew
   object has NO `notes` and NO `pnl` key — the data is absent, not hidden.

   Run:  npx tsx src/lib/day/loadDay.test.ts
   Exits 0 ("the day: N checks passed") or throws.
   ============================================ */

import assert from 'node:assert/strict';
import { loadDay } from '@/lib/day/loadDay';
import { sliceFor, roleAllowsMoney, canSeeBlock } from '@/lib/roles/slices';

let checks = 0;

// ---- fake Supabase: chainable + thenable; per-table {single,list} ----------
type Store = Record<string, { single?: unknown; list?: unknown[] }>;
function makeSupabase(store: Store) {
  function qb(table: string) {
    const listResult = { data: store[table]?.list ?? [], error: null };
    const singleResult = { data: store[table]?.single ?? null, error: null };
    const b: Record<string, unknown> = {};
    Object.assign(b, {
      select: () => b,
      eq: () => b,
      in: () => b,
      order: () => Promise.resolve(listResult),
      limit: () => b,
      maybeSingle: () => Promise.resolve(singleResult),
      single: () => Promise.resolve(singleResult),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(listResult).then(res, rej),
    });
    return b;
  }
  return { from: (t: string) => qb(t) } as never;
}

// ---- fixtures --------------------------------------------------------------
const SCHEDULE_SECTION = {
  template_id: 'sec-sched',
  label: 'Schedule',
  fields: [
    { id: 'f-loadin', label: 'Load-in', type: 'time' },
    { id: 'f-doors', label: 'Doors', type: 'time' },
    { id: 'f-notes', label: 'Notes', type: 'textarea' },
  ],
};
const CONTACT_SECTION = {
  template_id: 'sec-contacts',
  label: 'Key Contacts',
  fields: [{ id: 'f-promoter', label: 'Promoter', type: 'contact' }],
};

const FULL: Store = {
  routing: {
    single: {
      id: 'r1',
      date: '2026-09-10',
      day_type: 'show',
      city: 'Atlanta',
      country: 'US',
      venue_name: 'Tabernacle',
      address: '152 Luckie St NW',
      venue_phone: '+1 404 555 0100',
      venue_website: 'https://tabernacle.example',
      venue_capacity: 2600,
      canonical_venue_id: null,
      venue_frozen_at: '2026-09-11T00:00:00Z',
      notes: 'INTERNAL: promoter still owes deposit — do not share.',
      canonical: null,
    },
    list: [], // walk sees no shows → pnl value null (key still present)
  },
  tours: { single: { name: 'Fall Tour', currency: 'GBP', artist: { name: 'Test Artist' } } },
  labor_calls: {
    list: [
      { department: 'Audio', call_time: '09:00', call_time_approx: true, contact_name: 'Sam', notes: '', sort_order: 1 },
    ],
  },
  advance_instances: {
    single: {
      sections: [SCHEDULE_SECTION, CONTACT_SECTION],
      data: {
        'sec-sched': { 'f-loadin': '10:00', 'f-doors': '19:00' },
        'sec-contacts': { 'f-promoter': { first_name: 'Pat', last_name: 'Promoter', role: 'Promoter', phone: '555' } },
      },
    },
  },
  hotels: {
    list: [{ name: 'Hotel Indigo', address: '683 Peachtree', city: 'Atlanta', phone: null, confirmation_number: 'ABC123', check_in_at: '2026-09-10T15:00:00Z', check_out_at: '2026-09-11T11:00:00Z', notes: null }],
  },
  flights: {
    list: [{ airline: 'Delta', flight_number: 'DL123', pnr: 'XYZ', origin_airport: 'JFK', destination_airport: 'ATL', depart_at: '2026-09-10T08:00:00Z', arrive_at: '2026-09-10T11:00:00Z', person_name: 'Band', notes: null }],
  },
  tour_personnel: {
    list: [{ role: 'Tour Manager', role_tag: 'tm', persons: { full_name: 'Alex Manager', preferred_name: null, email: 'a@x.com', phone: '555-1' } }],
  },
};

const EMPTY: Store = {
  routing: { single: { id: 'r2', date: '2026-09-20', day_type: 'off', city: null, notes: null, canonical: null }, list: [] },
  tours: { single: { name: 'Fall Tour', currency: 'GBP', artist: null } },
};

const base = { tourId: 't1', routingId: 'r1', workspaceId: 'w1', today: '2026-12-01' as string };

async function main() {
  // (1) tm — the full operator sees every block key.
  const tm = await loadDay(makeSupabase(FULL), { ...base, role: 'tm' });
  assert.ok(tm, 'tm: day loads');
  for (const k of ['venue', 'schedule', 'hotel', 'flights', 'contacts', 'notes', 'pnl'] as const) {
    const key = k === 'hotel' ? 'hotels' : k;
    assert.ok(key in (tm as object), `tm: '${key}' block present`);
  }
  assert.equal(tm!.venue?.name, 'Tabernacle', 'tm: venue resolved');
  assert.ok((tm!.schedule?.length ?? 0) >= 3, 'tm: schedule merges calls + advance times');
  assert.ok(tm!.schedule?.some((s) => s.approx), 'tm: approx call flagged');
  assert.match(tm!.notes ?? '', /INTERNAL/, 'tm: internal note present');
  assert.ok('pnl' in (tm as object), 'tm: money chip in slice');
  checks += 6;

  // (2) crew — THE HEADLINE: money AND notes are ABSENT keys, not hidden.
  const crew = await loadDay(makeSupabase(FULL), { ...base, role: 'crew' });
  assert.ok(crew, 'crew: day loads');
  assert.ok(!('notes' in (crew as object)), 'crew: notes key ABSENT');
  assert.ok(!('pnl' in (crew as object)), 'crew: pnl key ABSENT');
  const crewJson = JSON.stringify(crew);
  assert.ok(!crewJson.includes('INTERNAL'), 'crew: internal note text nowhere in serialized object');
  for (const key of ['venue', 'schedule', 'hotels', 'flights', 'contacts'] as const) {
    assert.ok(key in (crew as object), `crew: '${key}' present`);
  }
  checks += 5;

  // (3) driver — schedule+venue+hotel+flights only: no contacts, notes, money.
  const driver = await loadDay(makeSupabase(FULL), { ...base, role: 'driver' });
  assert.ok(!('notes' in (driver as object)) && !('pnl' in (driver as object)) && !('contacts' in (driver as object)), 'driver: notes/pnl/contacts absent');
  assert.ok('venue' in (driver as object) && 'schedule' in (driver as object) && 'hotels' in (driver as object) && 'flights' in (driver as object), 'driver: logistics blocks present');
  checks += 2;

  // (4) accountant — money + notes, but not the hotel/flights logistics.
  const acct = await loadDay(makeSupabase(FULL), { ...base, role: 'accountant' });
  assert.ok('notes' in (acct as object) && 'pnl' in (acct as object), 'accountant: notes + money present');
  assert.ok(!('hotels' in (acct as object)) && !('flights' in (acct as object)), 'accountant: logistics absent');
  checks += 2;

  // (5) empty day — every in-slice block is null, no throw.
  const empty = await loadDay(makeSupabase(EMPTY), { ...base, routingId: 'r2', role: 'tm' });
  assert.ok(empty, 'empty: day loads (no throw)');
  assert.equal(empty!.venue?.name ?? null, null, 'empty: venue null');
  assert.equal(empty!.schedule, null, 'empty: schedule null');
  assert.equal(empty!.hotels, null, 'empty: hotels null');
  assert.equal(empty!.notes, null, 'empty: notes null');
  checks += 4;

  // (6) slices.ts pure contract.
  assert.equal(roleAllowsMoney('crew'), false, 'slice: crew no money');
  assert.equal(roleAllowsMoney('tm'), true, 'slice: tm money');
  assert.equal(canSeeBlock('crew', 'notes'), false, 'slice: crew no notes');
  assert.equal(canSeeBlock('production', 'notes'), true, 'slice: production notes');
  assert.equal(canSeeBlock('production', 'pnl'), false, 'slice: production no money');
  assert.deepEqual([...sliceFor('nonsense').blocks], [...sliceFor('crew').blocks], 'slice: unknown role fails closed to crew');
  checks += 6;

  console.log(`the day: ${checks} checks passed — crew slice omits money + notes (absent, not hidden)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/* ============================================
   LOWPASS — Day Sheet composer smoke (D1-2 · DAY-03)

   Asserts the audience-template presets (section toggles + type scale) and the
   body builder: Standard prints Notes; Crew/Driver/Band/Compact drop the internal
   note; Driver uses big type + drops the contacts card; money NEVER prints.

   Run:  npx tsx src/lib/export/daysheet-pdf.test.ts
   Exits 0 ("day sheet: N checks passed") or throws.
   ============================================ */

import assert from 'node:assert/strict';
import { buildDaySheetBodyHtml } from '@/lib/export/daysheet-pdf';
import { defaultConfig, applyDaySheetTemplate } from '@/lib/export/template-config';
import type { DayObject } from '@/lib/day/loadDay';

let checks = 0;

const DAY: DayObject = {
  tourId: 't1',
  routingId: 'r1',
  date: '2026-09-10',
  city: 'Atlanta',
  dayType: 'show',
  tourName: 'Fall Tour',
  artistName: 'Test Artist',
  role: 'tm',
  slice: { blocks: ['venue', 'schedule', 'hotel', 'flights', 'contacts', 'notes', 'pnl'], products: [] },
  venue: { source: 'frozen', name: 'Tabernacle', address: '152 Luckie St', phone: '404-555', website: null, capacity: 2600, city: 'Atlanta', country: 'US' },
  schedule: [
    { time: '09:00', approx: true, label: 'Audio', detail: 'Sam', source: 'labor_call' },
    { time: '19:00', approx: false, label: 'Doors', detail: null, source: 'advance' },
  ],
  hotels: [{ name: 'Hotel Indigo', address: '683 Peachtree', city: 'Atlanta', phone: null, confirmationNumber: 'ABC', checkInAt: '2026-09-10T15:00:00Z', checkOutAt: '2026-09-11T11:00:00Z', notes: null }],
  flights: [{ who: 'Band', airline: 'Delta', flightNumber: 'DL1', pnr: 'XYZ', from: 'JFK', to: 'ATL', departAt: '2026-09-10T08:00:00Z', arriveAt: '2026-09-10T11:00:00Z', notes: null }],
  contacts: [{ name: 'Pat Promoter', role: 'Promoter', phone: '555', email: null, source: 'advance' }],
  notes: 'INTERNAL: promoter owes deposit.',
  pnl: { currency: 'GBP', guarantee: 25000, showNet: 20000 },
};

// (1) Presets.
const base = defaultConfig('daysheet');
const crew = applyDaySheetTemplate(base, 'crew');
const driver = applyDaySheetTemplate(base, 'driver');
const compact = applyDaySheetTemplate(base, 'compact');

assert.equal(base.sections.find((s) => s.id === 'notes')?.show, true, 'standard: notes on');
assert.equal(crew.sections.find((s) => s.id === 'notes')?.show, false, 'crew: notes off');
assert.equal(crew.sections.find((s) => s.id === 'schedule')?.show, true, 'crew: schedule on');
assert.equal(driver.daysheet?.bigType, true, 'driver: big type');
assert.equal(driver.sections.find((s) => s.id === 'contacts')?.show, false, 'driver: contacts off');
assert.equal(compact.sections.find((s) => s.id === 'hotel')?.show, false, 'compact: hotel off');
checks += 6;

// (2) Standard body — every section header, incl. Notes.
const stdHtml = buildDaySheetBodyHtml(DAY, base);
for (const h of ['Schedule', 'Venue', 'Hotel', 'Flights', 'Day-of contacts', 'Notes']) {
  assert.ok(stdHtml.includes(`<h3>${h}</h3>`), `standard body: ${h} section present`);
}
assert.ok(stdHtml.includes('Tabernacle') && stdHtml.includes('Doors'), 'standard body: venue + schedule data');
checks += 7;

// (3) Crew body — NO Notes section, NO internal text.
const crewHtml = buildDaySheetBodyHtml(DAY, crew);
assert.ok(!crewHtml.includes('<h3>Notes</h3>'), 'crew body: no Notes section');
assert.ok(!crewHtml.includes('INTERNAL'), 'crew body: internal note text absent');
assert.ok(crewHtml.includes('<h3>Schedule</h3>'), 'crew body: schedule still present');
checks += 3;

// (4) Driver body — big type, no contacts.
const driverHtml = buildDaySheetBodyHtml(DAY, driver);
assert.ok(driverHtml.includes('font-size:15px'), 'driver body: big base type');
assert.ok(!driverHtml.includes('<h3>Day-of contacts</h3>'), 'driver body: contacts dropped');
checks += 2;

// (5) Money NEVER prints on a day sheet (no currency symbol, no P&L).
for (const cfg of [base, crew, driver, compact]) {
  const html = buildDaySheetBodyHtml(DAY, cfg);
  assert.ok(!/[£$€]|25,?000|P&amp;L|P&L/.test(html), 'money never printed on the day sheet body');
}
checks += 4;

console.log(`day sheet: ${checks} checks passed — templates gate sections; money never prints`);

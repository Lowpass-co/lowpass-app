/* ============================================
   LOWPASS — Workbook export smoke (X1-A · XLS-01)

   Builds the accounting workbook for a fixture, parses the .xlsx back with SheetJS,
   and asserts (a) the Settlements sheet Outstanding for the Atlanta worked example =
   £6,500 (straight from computeWalk — the harness-proven path), and (b) the Budget
   section subtotal is a REAL =SUM() range formula, not a baked value.

   Run:  npx tsx src/lib/export/workbook.test.ts
   Exits 0 ("workbook export: N checks passed") or throws.
   ============================================ */

import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { buildTourWorkbookBuffer, type TourWorkbookInput } from '@/lib/export/workbook';
import { computeWalk } from '@/lib/settlement/walk';
import { contentDisposition } from '@/lib/export/render';

let checks = 0;

// (0) HTTP header seam — the route's filename holds an em-dash (U+2014); the
// Content-Disposition value MUST be Latin-1-safe (every code point ≤ 255) or the
// route 500s ("Cannot convert argument to a ByteString ... value of 8212").
{
  const cd = contentDisposition('Charlotte Sands — Dandelion ’26 — Accounting Workbook.xlsx');
  assert.ok([...cd].every((c) => c.charCodeAt(0) <= 255), 'Content-Disposition is Latin-1 safe (em-dash encoded)');
  assert.match(cd, /filename\*=UTF-8''/, 'RFC 5987 filename* present for the Unicode name');
  checks += 2;
}

// Atlanta: 25,000 gtee − 3,000 ded → 22,000 adj − 2,000 exp → 20,000 net
//          + 4,000 overage + 1,200 merch → 25,200 artist − 5,000 deposit
//          → 20,200 balance − 13,700 paid → 6,500 outstanding.
const atlanta = computeWalk({
  guarantee: 25000,
  deductions: [{ amount: 2000 }, { amount: 1000 }],
  expenses: [{ amount: 2000 }],
  overage: 4000,
  merch: 1200,
  depositReceived: 5000,
  payments: [{ amount: 13700 }],
});
assert.equal(atlanta.outstanding, 6500, 'computeWalk: Atlanta outstanding = 6500');
checks++;

const input = {
  meta: { artistName: 'Test Artist', tourName: 'Fall Tour', tourDates: '2026-09-01 – 2026-10-01', currency: 'GBP', generatedOn: '2026-07-20T00:00:00.000Z' },
  budget: {
    tour: { currency: 'GBP' },
    artist: { name: 'Test Artist' },
    sections: [{ id: 's1', name: 'Salaries' }],
    lines: [
      { label: 'Ben', proposed_cost: 1000, actual_cost: 1100, currency: 'GBP', section_id: 's1', category: 'expense', status: 'confirmed', source_entity_type: 'payroll' },
      { label: 'Duncan', proposed_cost: 800, actual_cost: 750, currency: 'GBP', section_id: 's1', category: 'expense', status: 'confirmed', source_entity_type: null },
    ],
    income: [],
    fxRates: {},
  },
  shows: [
    { settlementId: 'x', routingId: 'r1', date: '2026-09-10', city: 'Atlanta', venue_name: 'Tabernacle', day_type: 'show', currency: 'GBP', guarantee: 25000, overage: 4000, merch: 1200, depositReceived: 5000, fullAndFinal: false, deductionsAreLegacy: false, deductions: [], expenses: [], payments: [], walk: atlanta },
  ],
  payroll: null,
  payrollFinalizedAt: null,
} as unknown as TourWorkbookInput;

async function main() {
  const buf = await buildTourWorkbookBuffer(input);
  const wb = XLSX.read(buf, { type: 'buffer' });

  // (a) Settlements sheet: Outstanding (col K) on the Atlanta row (row 2) = 6500.
  const set = wb.Sheets['Settlements'];
  assert.ok(set, 'Settlements sheet exists');
  assert.equal(set['C2']?.v, 'Atlanta', 'Settlements row 2 is Atlanta');
  assert.equal(set['K2']?.v, 6500, 'Settlements Outstanding cell = 6500');
  checks += 2;

  // (b) Budget sheet: section subtotal for Estimate (col D) is a real =SUM range.
  //     Section 'Salaries' has 2 data rows (2,3) → subtotal row 4.
  const bud = wb.Sheets['Budget'];
  assert.ok(bud, 'Budget sheet exists');
  assert.match(String(bud['A4']?.v ?? ''), /subtotal/i, 'Budget row 4 is the section subtotal');
  assert.equal(bud['D4']?.f, 'SUM(D2:D3)', 'Budget Estimate subtotal is =SUM(D2:D3)');
  assert.equal(bud['E4']?.f, 'SUM(E2:E3)', 'Budget Actual subtotal is =SUM(E2:E3)');
  // Variance is a live per-row formula (Actual − Estimate).
  assert.equal(bud['F2']?.f, 'E2-D2', 'Budget Variance is a live =Actual-Estimate formula');
  checks += 4;

  // (c) Provenance column reflects the M1-A Auto/Manual logic.
  assert.match(String(bud['H2']?.v ?? ''), /^Auto/, 'derived line → Auto provenance');
  assert.equal(bud['H3']?.v, 'Manual', 'hand-entered line → Manual provenance');
  checks += 2;

  console.log(`workbook export: ${checks} checks passed — outstanding £6,500 + real =SUM() ranges`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

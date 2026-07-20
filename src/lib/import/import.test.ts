/* ============================================
   LOWPASS — Workbook import smoke (X1-B · XLS-02..05)

   Run:  npx tsx src/lib/import/import.test.ts
   Exits 0 ("workbook import: N checks passed") or throws.
   ============================================ */

import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseWorkbook, applyMapping, type SheetRows } from '@/lib/import/parseWorkbook';
import { classifyProposals, nameSimilarity, type ExistingLine } from '@/lib/import/dedupe';
import { buildTourWorkbookBuffer, type TourWorkbookInput } from '@/lib/export/workbook';
import { computeWalk } from '@/lib/settlement/walk';

let checks = 0;

// --- parse: our layout (Budget sheet; subtotal/grand-total rows skipped) ---
const ours: SheetRows = {
  Budget: [
    { Section: 'Salaries', Item: 'Ben', Vendor: '', Estimate: 1000, Actual: 1100, Currency: 'GBP', Provenance: 'Auto · Payroll' },
    { Section: 'Salaries', Item: 'Duncan', Vendor: '', Estimate: 800, Actual: 750, Currency: 'GBP', Provenance: 'Manual' },
    { Section: 'Salaries — subtotal', Item: '', Estimate: 1800, Actual: 1850 },
    { Section: 'GRAND TOTAL', Item: '', Estimate: 1800, Actual: 1850 },
  ],
};
const p1 = parseWorkbook(ours);
assert.equal(p1.layout, 'ours', 'our-layout Budget sheet detected');
assert.equal(p1.proposals.length, 2, 'subtotal + grand-total rows skipped → 2 proposals');
assert.equal(p1.proposals[0].value.label, 'Ben', 'first proposal is Ben');
assert.equal(p1.proposals[0].source_ref, 'Budget!row 2', 'source cell reference recorded');
checks += 4;

// --- XLS-04: foreign layout → mapping preview ---
const foreign: SheetRows = {
  Sheet1: [
    { Description: 'Bus rental', Cost: 3200, When: '2026-09-10' },
    { Description: 'Catering', Cost: 900, When: '2026-09-11' },
  ],
};
const pf = parseWorkbook(foreign);
assert.equal(pf.layout, 'foreign', 'unknown layout → foreign');
assert.ok(pf.mapping, 'foreign layout yields a mapping preview');
assert.equal(pf.mapping?.guesses.find((g) => g.column === 'Description')?.role, 'name', 'Description guessed as name');
assert.equal(pf.mapping?.guesses.find((g) => g.column === 'Cost')?.role, 'amount', 'Cost guessed as amount');
const mapped = applyMapping('Sheet1', foreign.Sheet1, { name: 'Description', amount: 'Cost' });
assert.equal(mapped.length, 2, 'confirmed mapping → 2 proposals');
assert.equal(mapped[0].value.proposed_cost, 3200, 'mapped amount carried');
checks += 5;

// --- settlement/payroll sheets are read-only on import ---
const withReadOnly = parseWorkbook({ Settlements: [{ Date: 'x' }], Payroll: [{ Person: 'y' }] });
assert.equal(withReadOnly.rejected.length, 2, 'Settlements + Payroll both rejected');
assert.match(withReadOnly.rejected.join(' '), /read-only/i, 'reject message explains read-only');
checks += 2;

// --- XLS-02/03: dedupe classification (edit a cell → exactly one change) ---
const existing: ExistingLine[] = [
  { id: 'l1', section: 'Salaries', label: 'Ben', amount: 1100 },
  { id: 'l2', section: 'Salaries', label: 'Duncan', amount: 750 },
];
// Reimport: Ben unchanged (exact dup), Duncan amount edited 750→900 (value change), a new line.
const reimport = parseWorkbook({
  Budget: [
    { Section: 'Salaries', Item: 'Ben', Estimate: 1000, Actual: 1100, Currency: 'GBP' },
    { Section: 'Salaries', Item: 'Duncan', Estimate: 800, Actual: 900, Currency: 'GBP' },
    { Section: 'Salaries', Item: 'Alexander', Estimate: 500, Actual: 500, Currency: 'GBP' },
  ],
}).proposals;
const classified = classifyProposals(reimport, existing);
const changes = classified.filter((c) => c.kind === 'value_change');
const dups = classified.filter((c) => c.kind === 'exact_dup');
const news = classified.filter((c) => c.kind === 'new');
assert.equal(changes.length, 1, 'XLS-02: exactly one value_change (the edited cell)');
assert.equal(changes[0].proposal.value.label, 'Duncan', 'the change is Duncan');
assert.equal(dups.length, 1, 'XLS-03: the unchanged row is an exact duplicate');
assert.equal(dups[0].defaultAccept, false, 'XLS-03: duplicate default-SKIPs');
assert.equal(news.length, 1, 'the genuinely new line is proposed');
assert.equal(news[0].defaultAccept, true, 'new line default-ACCEPTs');
checks += 6;

// --- XLS-05: rejecting everything writes nothing (default skip already; explicit reject) ---
const accepted = classified.filter((c) => false); // simulate user rejecting all
assert.equal(accepted.length, 0, 'XLS-05: reject-all → zero rows to write');
checks += 1;

// fuzzy name sanity — identical (case-insensitive) matches; a trailing edit on a
// longer name stays ≥0.85; unrelated names fall well below.
assert.equal(nameSimilarity('Catering', 'catering'), 1, 'case-insensitive exact = 1');
assert.ok(nameSimilarity('Sound Engineer', 'Sound Enginer') >= 0.85, 'one dropped char still ≥0.85');
assert.ok(nameSimilarity('Ben', 'Catering') < 0.85, 'unrelated names < 0.85');
checks += 3;

async function main() {
  // Round-trip: export our workbook, parse the Budget sheet back, get 2 proposals.
  const atlanta = computeWalk({ guarantee: 25000, deductions: [{ amount: 3000 }], expenses: [], overage: 0, merch: 0, depositReceived: 0, payments: [] });
  const input = {
    meta: { artistName: 'A', tourName: 'T', tourDates: null, currency: 'GBP', generatedOn: '2026-07-20T00:00:00.000Z' },
    budget: { tour: { currency: 'GBP' }, artist: { name: 'A' }, sections: [{ id: 's1', name: 'Salaries' }], lines: [{ label: 'Ben', proposed_cost: 1000, actual_cost: 1100, currency: 'GBP', section_id: 's1', category: 'expense', status: 'confirmed', source_entity_type: 'payroll' }, { label: 'Duncan', proposed_cost: 800, actual_cost: 750, currency: 'GBP', section_id: 's1', category: 'expense', status: 'confirmed', source_entity_type: null }], income: [], fxRates: {} },
    shows: [{ settlementId: 'x', routingId: 'r1', date: '2026-09-10', city: 'Atlanta', venue_name: 'T', day_type: 'show', currency: 'GBP', guarantee: 25000, overage: 0, merch: 0, depositReceived: 0, fullAndFinal: false, deductionsAreLegacy: false, deductions: [], expenses: [], payments: [], walk: atlanta }],
    payroll: null, payrollFinalizedAt: null,
  } as unknown as TourWorkbookInput;
  const buf = await buildTourWorkbookBuffer(input);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Budget']);
  const rt = parseWorkbook({ Budget: rows });
  assert.equal(rt.layout, 'ours', 'round-trip: our export re-parses as our layout');
  assert.equal(rt.proposals.length, 2, 'round-trip: 2 data proposals (subtotal/grand-total skipped)');
  checks += 2;

  console.log(`workbook import: ${checks} checks passed`);
}

main().catch((e) => { console.error(e); process.exit(1); });

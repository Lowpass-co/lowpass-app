/* ============================================
   LOWPASS — budgetAdapter bidirectional test (Phase 3, Stage B step 1)

   No test runner is configured in this repo, so this is a self-contained
   assertion script run directly by Node's TS type-stripping:

       node --experimental-strip-types src/lib/grid/budgetAdapter.test.ts

   It exits 0 (prints "budgetAdapter: N checks passed") on success and throws
   on the first failed assertion. Covers BOTH directions: DB rows → grid
   Section[]/Row, and grid edit → DB patch.
   ============================================ */

import assert from 'node:assert/strict';
import type { BudgetLineItem, BudgetSection } from '@/types';
import {
  budgetToGridSections,
  gridEditToPatch,
  gridFieldToColumn,
  isDerivedLine,
  isFormulaSectionKind,
  lineToRow,
} from './budgetAdapter.ts';

function line(p: Partial<BudgetLineItem>): BudgetLineItem {
  return {
    id: 'l',
    tour_id: 't',
    workspace_id: 'w',
    category: 'misc',
    label: '',
    quantity: 1,
    proposed_cost: 0,
    actual_cost: 0,
    currency: null,
    receipt_id: null,
    routing_id: null,
    notes: null,
    order_index: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...p,
  };
}
function section(p: Partial<BudgetSection>): BudgetSection {
  return { id: 's', tour_id: 't', workspace_id: 'w', name: '', sort_order: 0, ...p };
}

let n = 0;
const check = (msg: string, fn: () => void) => {
  fn();
  n++;
  void msg;
};

/* ---- predicates ---- */
check('formula kinds detected', () => {
  assert.equal(isFormulaSectionKind('commission'), true);
  assert.equal(isFormulaSectionKind('cogs'), true);
  assert.equal(isFormulaSectionKind('custom'), false);
  assert.equal(isFormulaSectionKind(null), false);
});
check('derived line by source_entity_type + by FK', () => {
  assert.equal(isDerivedLine(line({ source_entity_type: 'payroll' })), true);
  assert.equal(isDerivedLine(line({ source_entity_type: 'payroll_per_diem' })), true);
  assert.equal(isDerivedLine(line({ source_entity_type: 'hotel_booking' })), true);
  assert.equal(isDerivedLine(line({ hotel_id: 'h1' })), true);
  assert.equal(isDerivedLine(line({ room_id: 'r1' })), true);
  assert.equal(isDerivedLine(line({})), false);
});

/* ---- FORWARD: DB → grid Section[] ---- */
check('forward mapping: kinds, source, exclusion, ungrouped', () => {
  const sections: BudgetSection[] = [
    section({ id: 'sec-travel', name: 'Travel', sort_order: 0, kind: 'custom' }),
    section({ id: 'sec-salary', name: 'Salary', sort_order: 1, kind: 'custom' }),
    section({ id: 'sec-comm', name: 'Commissions', sort_order: 2, kind: 'commission' }),
  ];
  const lines: BudgetLineItem[] = [
    line({ id: 'l1', label: 'Flights', proposed_cost: 700, actual_cost: 900, currency: null, status: 'paid', section_id: 'sec-travel', sort_order: 0 }),
    line({ id: 'l2', label: 'Hotel EUR', proposed_cost: 520, actual_cost: 0, currency: 'EUR', section_id: 'sec-travel', sort_order: 1 }),
    line({ id: 'l3', label: 'Tour Manager', proposed_cost: 3000, actual_cost: 3000, source_entity_type: 'payroll', section_id: 'sec-salary', sort_order: 0 }),
    // a formula-section line (should be excluded with its section):
    line({ id: 'l4', label: 'Agency 10%', section_id: 'sec-comm', sort_order: 0 }),
    // an ungrouped line:
    line({ id: 'l5', label: 'Misc', proposed_cost: 50, section_id: null }),
  ];
  const out = budgetToGridSections(lines, sections, { tourCurrency: 'USD' });

  // Commissions (formula) excluded; Travel + Salary + Ungrouped present.
  assert.deepEqual(out.map((s) => s.name), ['Travel', 'Salary', 'Ungrouped']);

  const travel = out[0];
  assert.equal(travel.kind, 'normal');
  assert.equal(travel.source, undefined);
  assert.equal(travel.rows.length, 2);
  assert.equal(travel.rows[0].item, 'Flights');
  assert.equal(travel.rows[0].est, 700);
  assert.equal(travel.rows[0].act, 900);
  assert.equal(travel.rows[0].status, 'paid');
  assert.equal(travel.rows[0].cur, 'USD'); // null currency → tour currency
  assert.equal(travel.rows[1].cur, 'EUR'); // foreign currency preserved
  assert.equal(travel.rows[0]._uid, 'l1');

  const salary = out[1];
  assert.equal(salary.kind, 'derived'); // all lines derived
  assert.equal(salary.source, 'Payroll');
  assert.equal(salary.rows[0]._derived, true);

  assert.equal(out[2].name, 'Ungrouped');
  assert.equal(out[2].rows[0].item, 'Misc');
});

check('lineToRow defaults status + currency', () => {
  const r = lineToRow(line({ id: 'x', label: 'L' }), 'GBP');
  assert.equal(r.status, 'draft');
  assert.equal(r.cur, 'GBP');
  assert.equal(r._lineId, 'x');
});

/* ---- REVERSE: grid edit → DB patch ---- */
check('reverse mapping: field → column', () => {
  assert.equal(gridFieldToColumn('item'), 'label');
  assert.equal(gridFieldToColumn('est'), 'proposed_cost');
  assert.equal(gridFieldToColumn('act'), 'actual_cost');
  assert.equal(gridFieldToColumn('status'), 'status');
  assert.equal(gridFieldToColumn('cur'), 'currency');
  assert.equal(gridFieldToColumn('notes'), 'notes');
  assert.equal(gridFieldToColumn('vendor'), null); // dropped (decision 3)
  assert.equal(gridFieldToColumn('idx'), null);
});
check('reverse mapping: edit → patch (act sets override)', () => {
  assert.deepEqual(gridEditToPatch('est', 250), { proposed_cost: 250 });
  assert.deepEqual(gridEditToPatch('act', 480), { actual_cost: 480, actual_cost_override: true });
  assert.deepEqual(gridEditToPatch('item', 'New'), { label: 'New' });
  assert.deepEqual(gridEditToPatch('status', 'approved'), { status: 'approved' });
  assert.deepEqual(gridEditToPatch('cur', 'EUR'), { currency: 'EUR' });
  assert.equal(gridEditToPatch('vendor', 'X'), null);
});

/* ---- ROUND TRIP ---- */
check('round trip: row → edit est → patch → apply → re-map', () => {
  const l = line({ id: 'rt', label: 'RT', proposed_cost: 100, section_id: 's1' });
  const row = lineToRow(l, 'USD');
  assert.equal(row.est, 100);
  const patch = gridEditToPatch('est', 250)!;
  const updated = { ...l, ...patch } as BudgetLineItem;
  assert.equal(lineToRow(updated, 'USD').est, 250);
});

console.log(`budgetAdapter: ${n} checks passed`);

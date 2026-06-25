/* node --experimental-strip-types src/server/budget/reconcileDerivedLines.test.ts
   Required B1 test (logic level): the reconcile lock decision (§3a). A live-DB
   end-to-end (lock a version → change a personnel_rates rate → assert the locked
   proposed snapshot is UNCHANGED and budget_line_items.actual_cost moved) is
   Adam's Chrome/SQL verify; this locks the decision that drives it. */
import assert from 'node:assert';
import { derivedUpdatePayload, derivedInsertProposed } from './derivedLockPolicy.ts';

const d = { total: 6300, label: 'Ben — FOH' };

// LOCKED (approved version): actuals ONLY — proposed/structure must NOT be written.
const locked = derivedUpdatePayload(true, d, 'sec-1');
assert.strictEqual(locked.actual_cost, 6300, 'locked writes actual_cost');
assert.ok(!('proposed_cost' in locked), 'locked must NOT write proposed_cost');
assert.ok(!('label' in locked), 'locked must NOT write label (structure frozen)');
assert.ok(!('section_id' in locked), 'locked must NOT write section_id');

// DRAFT: proposed + actual + structure.
const draft = derivedUpdatePayload(false, d, 'sec-1');
assert.strictEqual(draft.proposed_cost, 6300, 'draft writes proposed_cost');
assert.strictEqual(draft.actual_cost, 6300, 'draft writes actual_cost');
assert.strictEqual(draft.label, 'Ben — FOH', 'draft writes label');
assert.strictEqual(draft.section_id, 'sec-1', 'draft writes section_id');

// new-line proposed: 0 when locked (actuals-only), else the total.
assert.strictEqual(derivedInsertProposed(true, 6300), 0, 'locked new line proposed=0');
assert.strictEqual(derivedInsertProposed(false, 6300), 6300, 'draft new line proposed=total');

console.log('reconcile lock decision: 10 checks passed');

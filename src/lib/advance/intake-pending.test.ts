/* Intake store-pending helpers test.
   Run: node --experimental-strip-types src/lib/advance/intake-pending.test.ts */
import assert from 'node:assert';
import { flattenToPending, pendingToAdvanceData } from './intake-pending.ts';
import { mergeIntakeIntoAdvance, type AdvanceData } from './intake.ts';

let pass = 0;
const check = (label: string, cond: boolean) => {
  assert.ok(cond, label);
  pass++;
};

// 1. Flatten drops empty answers (they never become pending rows).
{
  const clean: AdvanceData = { load_in: { power: '400A', notes: '', crew: [] } };
  const rows = flattenToPending(clean);
  check('flatten keeps non-empty', rows.some((r) => r.field_id === 'power' && r.value === '400A'));
  check('flatten drops empty string', !rows.some((r) => r.field_id === 'notes'));
  check('flatten drops empty array', !rows.some((r) => r.field_id === 'crew'));
  check('flatten carries section id', rows[0].section_id === 'load_in');
}

// 2. Round-trip: pending → AdvanceData reconstructs the shape.
{
  const rows = [
    { section_id: 'load_in', field_id: 'power', value: '400A' },
    { section_id: 'load_in', field_id: 'dock', value: 'rear' },
    { section_id: 'hosp', field_id: 'meals', value: 3 },
  ];
  const data = pendingToAdvanceData(rows);
  check('round-trip section grouping', data.load_in?.power === '400A' && data.load_in?.dock === 'rear');
  check('round-trip second section', data.hosp?.meals === 3);
}

// 3. Accept-time merge is never-clobber: an accepted answer overwrites, an
//    ABSENT (rejected/not-accepted) field leaves the TM value intact.
{
  const existing: AdvanceData = { load_in: { power: 'TM-guess', dock: 'front' } };
  // TM accepted only 'power'; 'dock' was rejected → not in the accepted set.
  const accepted = pendingToAdvanceData([{ section_id: 'load_in', field_id: 'power', value: '400A' }]);
  const merged = mergeIntakeIntoAdvance(existing, accepted);
  check('accept overwrites accepted field', merged.load_in.power === '400A');
  check('reject leaves TM value untouched', merged.load_in.dock === 'front');
}

// 4. Empty accepted value can't clobber (defence-in-depth: merge also guards).
{
  const existing: AdvanceData = { s: { f: 'kept' } };
  const merged = mergeIntakeIntoAdvance(existing, pendingToAdvanceData([{ section_id: 's', field_id: 'f', value: '' }]));
  check('empty accepted never clobbers', merged.s.f === 'kept');
}

console.log(`intake-pending.test.ts — ${pass} assertions passed`);

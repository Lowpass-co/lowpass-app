/* Labor-calls additive/never-clobber harness.
   Run: node --experimental-strip-types src/lib/labor-calls/merge.harness.ts */
import { additiveLaborRows } from './merge.ts';
import { emptyLaborRow, type LaborCall, type LaborCallRow } from './types.ts';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL: ${name}`);
  }
}

function call(dept: string, time: string | null): LaborCall {
  return {
    id: 'x', workspace_id: 'w', tour_id: 't', routing_id: 'r',
    department: dept, call_time: time, headcount: null, company: '', contact_name: '',
    contact_phone: '', meal_break_notes: '', union_notes: '', notes: '', sort_order: 0,
    created_at: '', updated_at: '',
  };
}
function row(dept: string, time: string | null, company = 'ACME'): LaborCallRow {
  return { ...emptyLaborRow(), department: dept, call_time: time, company };
}

// 1. Into an empty day, all non-empty incoming rows are created.
check('empty day → all created', additiveLaborRows([], [row('Steel', '08:00'), row('Audio', '09:00')]).length === 2);

// 2. Never-clobber: a row matching an existing (dept + time) is skipped.
{
  const existing = [call('Steel', '08:00')];
  const out = additiveLaborRows(existing, [row('Steel', '08:00'), row('Audio', '09:00')]);
  check('never-clobber existing dept+time', out.length === 1 && out[0].department === 'Audio');
}

// 3. Case/space-insensitive dedupe.
check('case-insensitive dedupe', additiveLaborRows([call('Audio', '10:00')], [row('  audio ', '10:00')]).length === 0);

// 4. Different time = a distinct call (created).
check('same dept different time → created', additiveLaborRows([call('Lights', '07:00')], [row('Lights', '12:00')]).length === 1);

// 5. Empty rows (no dept + no company) are dropped.
check('empty row dropped', additiveLaborRows([], [emptyLaborRow()]).length === 0);

// 6. Idempotent: applying the same batch twice adds nothing the second time.
{
  const first = additiveLaborRows([], [row('Steel', '08:00'), row('Audio', '09:00')]);
  const asCalls = first.map((r) => call(r.department, r.call_time));
  const second = additiveLaborRows(asCalls, [row('Steel', '08:00'), row('Audio', '09:00')]);
  check('idempotent re-apply adds nothing', first.length === 2 && second.length === 0);
}

// 7. Intra-batch dedupe (two identical incoming rows → one created).
check('intra-batch dedupe', additiveLaborRows([], [row('Video', '11:00'), row('video', '11:00')]).length === 1);

console.log(`labor-calls merge: ${pass} checks passed, ${fail} failed`);
if (fail > 0) process.exit(1);

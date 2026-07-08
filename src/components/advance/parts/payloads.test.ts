/* node --experimental-strip-types src/components/advance/parts/payloads.test.ts

   Characterization test for the two Advance save payloads (B1 SAFETY ADD).
   Locks the endpoints/shapes the decomposition must not regress (map §5):
   Build = POST {routing_id, sections}; Fill = PATCH {data?, section_statuses?,
   status?, flags?} with undefined keys dropped. This is the browser-independent
   backstop for Adam's autosave smoke.
*/

import assert from 'node:assert';
import {
  buildStructurePayload,
  buildFillPayload,
  type FillPatch,
} from './payloads.ts';
import type { SectionDef } from './model.ts';

let pass = 0;
const check = (label: string, cond: boolean) => {
  assert.ok(cond, label);
  pass++;
};

/* ---- Build / structure payload ---- */
{
  const sections = [
    { template_id: 's1', label: 'Load-in', fields: [] },
  ] as unknown as SectionDef[];
  const p = buildStructurePayload('routing-123', sections);
  check('structure: routing_id set', p.routing_id === 'routing-123');
  check('structure: sections passed through', p.sections === sections);
  check('structure: exactly two keys', Object.keys(p).sort().join(',') === 'routing_id,sections');
}

/* ---- Fill / patch payload ---- */
{
  // Full patch keeps every key.
  const full: FillPatch = {
    data: { s1: { power: '63A' } },
    section_statuses: { s1: { status: 'in_progress' } },
    status: 'in_progress',
    flags: [],
  };
  const p = buildFillPayload(full);
  check('fill: data kept', p.data?.s1.power === '63A');
  check('fill: section_statuses kept', p.section_statuses?.s1.status === 'in_progress');
  check('fill: status kept', p.status === 'in_progress');
  check('fill: flags kept', Array.isArray(p.flags));
  check('fill: all four keys present', Object.keys(p).sort().join(',') === 'data,flags,section_statuses,status');
}

{
  // Partial patch (data only) drops the undefined keys — the whole point of
  // the accumulator is to PATCH only what changed.
  const p = buildFillPayload({ data: { s1: { x: 1 } } });
  check('fill: only data present', Object.keys(p).join(',') === 'data');
  check('fill: status absent', p.status === undefined);
  check('fill: section_statuses absent', p.section_statuses === undefined);
}

{
  // Immediate-flush subset (status/assignee/flags) builds a status-only body.
  const p = buildFillPayload({ status: 'complete' });
  check('fill: status-only body', Object.keys(p).join(',') === 'status' && p.status === 'complete');
}

{
  // Empty accumulator → {} so the caller skips the request.
  const p = buildFillPayload({});
  check('fill: empty patch yields {}', Object.keys(p).length === 0);
}

console.log(`payloads.test.ts — ${pass} assertions passed`);

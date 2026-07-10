/* Tech-pack extraction PIPELINE test — the deterministic path around the live
   Claude call: a model's extracted JSON → sanitise (schema) → flatten to PENDING
   → review-accept applies one (never-clobber). Proves the endpoint's data path.
   Run: node --experimental-strip-types src/lib/advance/intake-techpack.test.ts */
import assert from 'node:assert';
import { sanitizeSubmission, mergeIntakeIntoAdvance, type AdvanceData, type IntakeFormSchema } from './intake.ts';
import { flattenToPending, pendingToAdvanceData } from './intake-pending.ts';

let pass = 0;
const check = (label: string, cond: boolean) => {
  assert.ok(cond, label);
  pass++;
};

const schema: IntakeFormSchema = {
  sections: [
    { template_id: 'load_in', label: 'Load in', fields: [
      { id: 'power', label: 'Power', type: 'text' },
      { id: 'dock', label: 'Dock', type: 'text' },
    ] },
  ],
};

// What Claude returned from the tech pack (includes a bogus key it invented).
const extracted: AdvanceData = {
  load_in: { power: '3-phase 63A', dock: 'ground level', evil: 'DROP TABLE' },
  ghost_section: { x: 'nope' },
};

// 1. Sanitise drops fields/sections not in the schema (defence).
const clean = sanitizeSubmission(schema, extracted);
check('sanitise keeps power', clean.load_in?.power === '3-phase 63A');
check('sanitise drops bogus field', !('evil' in (clean.load_in ?? {})));
check('sanitise drops bogus section', !('ghost_section' in clean));

// 2. Flatten → the PENDING rows the endpoint upserts (source=tech_pack).
const pending = flattenToPending(clean);
check('two pending rows', pending.length === 2);
check('pending carries section+field+value', pending.some((p) => p.section_id === 'load_in' && p.field_id === 'power' && p.value === '3-phase 63A'));

// 3. Review-accept applies ONE (power), never-clobbering an existing TM value on dock.
const existing: AdvanceData = { load_in: { dock: 'TM already set this' } };
const acceptedOne = pending.filter((p) => p.field_id === 'power');
const merged = mergeIntakeIntoAdvance(existing, pendingToAdvanceData(acceptedOne));
check('accept applies power', merged.load_in.power === '3-phase 63A');
check('unaccepted dock left as TM set it', merged.load_in.dock === 'TM already set this');

console.log(`intake-techpack.test.ts — ${pass} assertions passed`);

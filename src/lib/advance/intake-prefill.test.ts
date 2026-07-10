/* Intake prefill test.
   Run: node --experimental-strip-types src/lib/advance/intake-prefill.test.ts */
import assert from 'node:assert';
import { buildPrefillProposals } from './intake-prefill.ts';
import type { IntakeFormSchema } from './intake.ts';

let pass = 0;
const check = (label: string, cond: boolean) => {
  assert.ok(cond, label);
  pass++;
};

const schema: IntakeFormSchema = {
  sections: [
    {
      template_id: 'load_in',
      label: 'Load in',
      fields: [
        { id: 'power', label: 'Power', type: 'text' },
        { id: 'dock', label: 'Loading dock', type: 'text' },
        { id: 'address', label: 'Venue address', type: 'text' },
        { id: 'cap', label: 'Capacity', type: 'number' },
      ],
    },
  ],
};

// 1. Prior same-venue advance prefills by direct field id, with its label as provenance.
{
  const prior = { data: { load_in: { power: '400A', dock: 'rear' } }, label: 'From your Mar 2026 show · Spring Tour' };
  const res = buildPrefillProposals(schema, null, prior, null);
  const power = res.proposals.find((p) => p.field_id === 'power');
  check('prior prefills power', !!power && power.value === '400A');
  check('provenance = prior label', power?.provenance === 'From your Mar 2026 show · Spring Tour');
  check('prior source tag', power?.source === 'prefill');
}

// 2. Never propose over a field the TM already answered.
{
  const prior = { data: { load_in: { power: '400A' } }, label: 'prior' };
  const current = { load_in: { power: 'TM value' } };
  const res = buildPrefillProposals(schema, current, prior, null);
  check('no proposal over existing answer', !res.proposals.some((p) => p.field_id === 'power'));
}

// 3. Canonical fills by label keyword (address / capacity), provenance = venue record.
{
  const res = buildPrefillProposals(schema, null, null, { address: '10 High St', capacity: 1200 });
  const addr = res.proposals.find((p) => p.field_id === 'address');
  const cap = res.proposals.find((p) => p.field_id === 'cap');
  check('canonical prefills address', !!addr && addr.value === '10 High St' && addr.provenance === 'From the venue record');
  check('canonical prefills capacity', !!cap && cap.value === 1200);
}

// 4. Prior advance WINS over canonical for the same field.
{
  const prior = { data: { load_in: { address: '99 Old Rd' } }, label: 'prior show' };
  const res = buildPrefillProposals(schema, null, prior, { address: '10 High St' });
  const addr = res.proposals.find((p) => p.field_id === 'address');
  check('prior beats canonical', addr?.value === '99 Old Rd' && addr?.provenance === 'prior show');
}

// 5. Fields-prefilled ratio is proposals / fillable.
{
  const prior = { data: { load_in: { power: '400A', dock: 'rear' } }, label: 'x' };
  const res = buildPrefillProposals(schema, null, prior, null);
  check('fillable count = 4', res.fillableCount === 4);
  check('prefilled count = 2', res.prefilledCount === 2);
  check('ratio = 0.5', Math.abs(res.ratio - 0.5) < 1e-9);
}

console.log(`intake-prefill.test.ts — ${pass} assertions passed`);

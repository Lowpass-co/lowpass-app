/* node --experimental-strip-types src/lib/advance/intake.test.ts

   Characterization test for §12.4 — intake NEVER-CLOBBER.

   Locks the invariant the Advance decomposition (P3) must not break: a venue
   intake submission is authoritative for fields it actually answered, but a
   BLANK answer never wipes a value the TM already entered. This logic lives in
   the pure lib + the public submit route — NOT in AdvanceSectionBuilder — so
   the component cut does not touch it; this test is the standing proof.

   (The component's two autosave paths — Build POST vs Fill PATCH — cannot be
   characterization-tested without the extraction: no jsdom/testing-library in
   the repo and the timers are non-exported internals. Their exact trigger
   conditions are documented in docs/handover/CC_ADVANCE_DECOMP_MAP.md instead.)
*/

import assert from 'node:assert';
import {
  isEmptyAnswer,
  mergeIntakeIntoAdvance,
  sanitizeSubmission,
  buildIntakeFormSchema,
  type AdvanceData,
  type IntakeFormSchema,
} from './intake.ts';

let pass = 0;
const check = (label: string, cond: boolean) => {
  assert.ok(cond, label);
  pass++;
};

/* ---- isEmptyAnswer: what counts as "blank" (so it can't clobber) ---- */
check('null is empty', isEmptyAnswer(null) === true);
check('undefined is empty', isEmptyAnswer(undefined) === true);
check('empty string is empty', isEmptyAnswer('') === true);
check('whitespace string is empty', isEmptyAnswer('   ') === true);
check('empty array is empty', isEmptyAnswer([]) === true);
check('zero is NOT empty', isEmptyAnswer(0) === false);
check('false is NOT empty', isEmptyAnswer(false) === false);
check('non-empty string is NOT empty', isEmptyAnswer('x') === false);
check('non-empty array is NOT empty', isEmptyAnswer([1]) === false);

/* ---- mergeIntakeIntoAdvance: the never-clobber core ---- */
{
  const existing: AdvanceData = {
    load_in: { power: '3-phase', notes: 'ring ahead', crew: 'TM entered' },
  };
  const submitted: AdvanceData = {
    load_in: { power: '63A CEE', notes: '', crew: '   ' },
  };
  const merged = mergeIntakeIntoAdvance(existing, submitted);

  check(
    'non-empty venue answer overwrites TM value',
    merged.load_in.power === '63A CEE',
  );
  check(
    'blank venue answer does NOT clobber existing (empty string)',
    merged.load_in.notes === 'ring ahead',
  );
  check(
    'whitespace venue answer does NOT clobber existing',
    merged.load_in.crew === 'TM entered',
  );
  // Purity — inputs untouched.
  check('merge does not mutate existing', existing.load_in.power === '3-phase');
  check('merge returns a new object', merged !== existing);
}

{
  // New field on an existing section is added; new section is added whole.
  const existing: AdvanceData = { load_in: { power: '3-phase' } };
  const submitted: AdvanceData = {
    load_in: { dock: 'rear' },
    catering: { dietary: 'vegan x2' },
  };
  const merged = mergeIntakeIntoAdvance(existing, submitted);
  check('existing field preserved', merged.load_in.power === '3-phase');
  check('new field on existing section added', merged.load_in.dock === 'rear');
  check('new section added', merged.catering.dietary === 'vegan x2');
}

{
  // Null-ish inputs are safe.
  check(
    'null submitted returns copy of existing',
    mergeIntakeIntoAdvance({ a: { b: '1' } }, null).a.b === '1',
  );
  check(
    'null existing + submitted yields submitted',
    mergeIntakeIntoAdvance(null, { a: { b: '1' } }).a.b === '1',
  );
  check(
    'both null yields empty object',
    Object.keys(mergeIntakeIntoAdvance(null, null)).length === 0,
  );
}

/* ---- sanitizeSubmission: tamper-defence (only schema fields survive) ---- */
{
  const schema: IntakeFormSchema = {
    sections: [
      {
        template_id: 'load_in',
        label: 'Load-in',
        fields: [{ id: 'power', label: 'Power', type: 'text' }],
      },
    ],
  };
  const raw: AdvanceData = {
    load_in: { power: '63A', evil: 'DROP TABLE' },
    ghost_section: { x: 'nope' },
  };
  const clean = sanitizeSubmission(schema, raw);
  check('allowed field kept', clean.load_in.power === '63A');
  check('unknown field dropped', clean.load_in.evil === undefined);
  check('unknown section dropped', clean.ghost_section === undefined);
}

/* ---- buildIntakeFormSchema: tm_only + non-fillable exclusion ---- */
{
  const schema = buildIntakeFormSchema([
    {
      template_id: 'internal',
      label: 'Internal',
      tm_only: true,
      fields: [{ id: 'x', label: 'X', type: 'text' }],
    },
    {
      template_id: 'load_in',
      label: 'Load-in',
      fields: [
        { id: 'power', label: 'Power', type: 'text' },
        { id: 'contract', label: 'Contract', type: 'file' },
        { id: 'promoter', label: 'Promoter', type: 'contact' },
      ],
    },
    {
      template_id: 'files_only',
      label: 'Files',
      fields: [{ id: 'f', label: 'F', type: 'file' }],
    },
  ]);
  const ids = schema.sections.map((s) => s.template_id);
  check('tm_only section excluded from venue form', !ids.includes('internal'));
  check('fillable section included', ids.includes('load_in'));
  check(
    'section with only non-fillable fields excluded',
    !ids.includes('files_only'),
  );
  const loadIn = schema.sections.find((s) => s.template_id === 'load_in');
  const fieldIds = (loadIn?.fields ?? []).map((f) => f.id);
  check('text field kept', fieldIds.includes('power'));
  check('file field dropped', !fieldIds.includes('contract'));
  check('contact field dropped', !fieldIds.includes('promoter'));
}

console.log(`intake.test.ts — ${pass} assertions passed`);

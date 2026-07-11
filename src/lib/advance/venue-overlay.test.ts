/* Advance venue overlay test — proves advance-own wins per-field, else the
   base (resolveVenue) value stands. Pure; resolveVenue integration is proven
   by resolveVenue.harness.ts.
   Run: node --experimental-strip-types src/lib/advance/venue-overlay.test.ts */
import assert from 'node:assert';
import { findAdvanceOwnVenue, applyAdvanceOwnVenue } from './venue-overlay.ts';

let pass = 0;
const check = (label: string, cond: boolean) => {
  assert.ok(cond, label);
  pass++;
};

// A stand-in for resolveVenue(canonical) output.
const base = {
  source: 'canonical' as const,
  name: 'Canonical Hall',
  address: '1 Canon St',
  phone: '+44 20 0000',
  website: 'https://canon.example',
  capacity: 900,
  city: 'London',
  country: 'UK',
};

const VENUE_SECTION = [
  { template_id: 'venue_info', fields: [{ id: 'venue_name' }, { id: 'venue_address' }] },
];

// 1. No own values → base stands unchanged (the resolveVenue fallback).
{
  const v = applyAdvanceOwnVenue(base, findAdvanceOwnVenue(VENUE_SECTION, {}));
  check('no own → base name', v.name === 'Canonical Hall');
  check('no own → base capacity', v.capacity === 900);
}

// 2. Advance-own edited values WIN per-field; unset fields keep the base.
{
  const own = findAdvanceOwnVenue(VENUE_SECTION, {
    venue_info: { venue_name: 'TM Edited Room', venue_capacity: 1250 },
  });
  const v = applyAdvanceOwnVenue(base, own);
  check('own name wins', v.name === 'TM Edited Room');
  check('own capacity wins', v.capacity === 1250);
  check('unset address keeps base', v.address === '1 Canon St');
  check('phone always from base (no in-advance field)', v.phone === '+44 20 0000');
}

// 3. Blank / whitespace own values do NOT clobber the base.
{
  const own = findAdvanceOwnVenue(VENUE_SECTION, {
    venue_info: { venue_name: '   ', venue_address: '' },
  });
  const v = applyAdvanceOwnVenue(base, own);
  check('blank own name ignored → base', v.name === 'Canonical Hall');
  check('empty own address ignored → base', v.address === '1 Canon St');
}

// 4. findAdvanceOwnVenue keys off the section owning a `venue_name` field.
{
  const none = findAdvanceOwnVenue(
    [{ template_id: 'load_in', fields: [{ id: 'power' }] }],
    { load_in: { power: '63A' } },
  );
  check('no venue section → null', none === null);
  check('null own → base unchanged', applyAdvanceOwnVenue(base, none).name === 'Canonical Hall');
}

console.log(`venue-overlay.test.ts — ${pass} assertions passed`);

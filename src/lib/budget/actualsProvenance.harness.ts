/* ============================================
   LOWPASS — actuals provenance harness (Stage 5 scripted proof)

   Run: node --experimental-strip-types src/lib/budget/actualsProvenance.harness.ts

   Verifies the settlement→income cascade decision without a database:
   NULL / 'settlement' rows are written; 'manual' rows are skipped with a
   conflict list; force-overwrite writes and re-stamps 'settlement'; a manual
   row whose values already match settlement produces no conflict.
   ============================================ */

import { resolveActualsCascade } from './actualsProvenance.ts';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

const settlement = { actual_guarantee: 1000, actual_overage: 200, actual_merch: 50 };

// 1) NULL provenance → write, stamp settlement, no conflicts.
{
  const d = resolveActualsCascade({
    existingSource: null,
    existingActuals: {},
    settlementActuals: settlement,
    hasActuals: true,
    overwriteManual: false,
  });
  check('NULL row is written', d.skip === false);
  check('NULL row stamps settlement', d.writeSource === 'settlement');
  check('NULL row has no conflicts', d.conflicts.length === 0);
}

// 2) 'settlement' provenance → write again, no conflicts.
{
  const d = resolveActualsCascade({
    existingSource: 'settlement',
    existingActuals: { actual_guarantee: 900 },
    settlementActuals: settlement,
    hasActuals: true,
    overwriteManual: false,
  });
  check('settlement row is written', d.skip === false);
  check('settlement row stamps settlement', d.writeSource === 'settlement');
  check('settlement row has no conflicts', d.conflicts.length === 0);
}

// 3) 'manual' provenance, differing values → skip + conflict list.
{
  const d = resolveActualsCascade({
    existingSource: 'manual',
    existingActuals: { actual_guarantee: 950, actual_overage: 200, actual_merch: 10 },
    settlementActuals: settlement,
    hasActuals: true,
    overwriteManual: false,
  });
  check('manual row is skipped', d.skip === true);
  check('manual row does not stamp', d.writeSource === null);
  // guarantee 950≠1000 and merch 10≠50 conflict; overage 200==200 does not.
  check('manual row reports 2 conflicts', d.conflicts.length === 2);
  check(
    'conflict carries manual + settlement values',
    d.conflicts.some((c) => c.field === 'actual_guarantee' && c.manual === 950 && c.settlement === 1000),
  );
  check(
    'matching field is not a conflict',
    !d.conflicts.some((c) => c.field === 'actual_overage'),
  );
}

// 4) 'manual' provenance, overwrite forced → write + re-stamp settlement.
{
  const d = resolveActualsCascade({
    existingSource: 'manual',
    existingActuals: { actual_guarantee: 950 },
    settlementActuals: settlement,
    hasActuals: true,
    overwriteManual: true,
  });
  check('forced overwrite is written', d.skip === false);
  check('forced overwrite re-stamps settlement', d.writeSource === 'settlement');
}

// 5) 'manual' provenance, values already match → no conflict, not skipped.
{
  const d = resolveActualsCascade({
    existingSource: 'manual',
    existingActuals: { actual_guarantee: 1000, actual_overage: 200, actual_merch: 50 },
    settlementActuals: settlement,
    hasActuals: true,
    overwriteManual: false,
  });
  check('manual row matching settlement has no conflict', d.conflicts.length === 0);
  check('manual row matching settlement is not skipped', d.skip === false);
  check('manual row matching settlement re-stamps settlement', d.writeSource === 'settlement');
}

// 6) No actuals carried → never stamp (nothing to write).
{
  const d = resolveActualsCascade({
    existingSource: null,
    existingActuals: {},
    settlementActuals: {},
    hasActuals: false,
    overwriteManual: false,
  });
  check('empty settlement does not stamp', d.writeSource === null);
  check('empty settlement is not skipped', d.skip === false);
}

console.log(`\nactuals provenance: ${passed} checks passed, ${failed} failed`);
if (failed > 0) process.exit(1);

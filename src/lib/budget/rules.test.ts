/* node --experimental-strip-types src/lib/budget/rules.test.ts */
import assert from 'node:assert';
import {
  runBudgetRules,
  hasCarnet,
  hasHaulage,
  hasPa,
  type BudgetRuleLineItem,
  type BudgetRulesInput,
} from './rules.ts';

let pass = 0;
const check = (label: string, cond: boolean) => {
  assert.ok(cond, label);
  pass++;
};

const li = (label: string, category = 'misc'): BudgetRuleLineItem => ({ label, category });
const ids = (input: BudgetRulesInput) => runBudgetRules(input).map((f) => f.id);

// ── detectors ───────────────────────────────────────────────────────
check('hasCarnet matches case-insensitively', hasCarnet([li('ATA Carnet')]));
check('hasCarnet no match', !hasCarnet([li('Hotels')]));
check('hasHaulage matches haulage', hasHaulage([li('Haulage')]));
check('hasHaulage matches freight', hasHaulage([li('Freight forwarding')]));
check('hasHaulage matches truck', hasHaulage([li('Truck rental')]));
check('hasHaulage no match', !hasHaulage([li('Flights')]));
check('hasPa matches PA word', hasPa([li('PA hire')]));
check('hasPa matches sound', hasPa([li('Sound system')]));
check('hasPa matches audio', hasPa([li('Audio package')]));
check('hasPa does not match "spain"', !hasPa([li('Spain travel')])); // \bPA\b guards against substrings

// ── eu-shows-no-carnet ──────────────────────────────────────────────
check(
  'eu-shows-no-carnet fires: EU shows, no carnet',
  ids({ showCount: 2, hasEuShows: true, lineItems: [li('Hotels')] }).includes('eu-shows-no-carnet'),
);
check(
  'eu-shows-no-carnet silent: carnet present',
  !ids({ showCount: 2, hasEuShows: true, lineItems: [li('ATA Carnet')] }).includes('eu-shows-no-carnet'),
);
check(
  'eu-shows-no-carnet silent: no EU shows',
  !ids({ showCount: 2, hasEuShows: false, lineItems: [li('Hotels')] }).includes('eu-shows-no-carnet'),
);

// ── no-haulage ──────────────────────────────────────────────────────
check(
  'no-haulage fires: >3 shows, no haulage',
  ids({ showCount: 5, hasEuShows: false, lineItems: [li('Hotels')] }).includes('no-haulage'),
);
check(
  'no-haulage silent: at threshold (3 shows)',
  !ids({ showCount: 3, hasEuShows: false, lineItems: [li('Hotels')] }).includes('no-haulage'),
);
check(
  'no-haulage silent: haulage present',
  !ids({ showCount: 5, hasEuShows: false, lineItems: [li('Freight')] }).includes('no-haulage'),
);

// ── large-room-no-pa ────────────────────────────────────────────────
check(
  'large-room-no-pa fires: 5000-cap venue, no PA',
  ids({ showCount: 1, hasEuShows: false, lineItems: [li('Hotels')], maxVenueCapacity: 5000 }).includes(
    'large-room-no-pa',
  ),
);
check(
  'large-room-no-pa silent: small venue',
  !ids({ showCount: 1, hasEuShows: false, lineItems: [li('Hotels')], maxVenueCapacity: 500 }).includes(
    'large-room-no-pa',
  ),
);
check(
  'large-room-no-pa silent: capacity unknown',
  !ids({ showCount: 1, hasEuShows: false, lineItems: [li('Hotels')] }).includes('large-room-no-pa'),
);
check(
  'large-room-no-pa silent: PA present',
  !ids({
    showCount: 1,
    hasEuShows: false,
    lineItems: [li('PA hire')],
    maxVenueCapacity: 5000,
  }).includes('large-room-no-pa'),
);

// ── composition + clean tour ────────────────────────────────────────
check(
  'clean tour produces no findings',
  runBudgetRules({
    showCount: 5,
    hasEuShows: true,
    lineItems: [li('ATA Carnet'), li('Haulage'), li('PA hire')],
    maxVenueCapacity: 5000,
  }).length === 0,
);
check(
  'multiple rules fire together',
  ids({ showCount: 5, hasEuShows: true, lineItems: [li('Hotels')], maxVenueCapacity: 5000 }).sort().join(',') ===
    ['eu-shows-no-carnet', 'large-room-no-pa', 'no-haulage'].sort().join(','),
);

console.log(`rules: ${pass} checks passed`);

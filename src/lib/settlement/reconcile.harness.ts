/* ============================================
   LOWPASS — Settlement reconcile harness (M1-B, HARD GATE)

   Proves the itemized Walk (walk.ts) reproduces the LEGACY single-number net
   (settlement/route.ts: `dayOfNet = g + o + m − d`) EXACTLY, before the engine
   reads the new settlement_deductions / settlement_expenses tables.

   Run:  node --experimental-strip-types src/lib/settlement/reconcile.harness.ts
   Exits 0 ("settlement reconcile: N checks passed") or throws on first failure.
   ============================================ */

import assert from 'node:assert/strict';
import { computeBoxOffice, computeWalk, legacyNet, type DealInput, type WalkInput } from './walk.ts';

const money = (n: number) => n.toFixed(2).padStart(12);
let checks = 0;

console.log('\nSettlement reconcile — itemized Walk vs legacy single-number net (g + o + m − d)\n');
console.log(
  ['fixture'.padEnd(40), 'legacy net'.padStart(12), 'artist total'.padStart(14), 'ok'].join('  '),
);
console.log('-'.repeat(72));

/** A migrated row: one 'other' deduction == the legacy single value, no expenses,
 *  no deposit. Artist total MUST equal the legacy net. */
function migratedRow(label: string, g: number, o: number, m: number, d: number) {
  const input: WalkInput = {
    guarantee: g,
    deductions: [{ amount: d }], // the single 'Migrated deductions' row
    expenses: [],
    overage: o,
    merch: m,
    depositReceived: 0,
    payments: [],
  };
  const walk = computeWalk(input);
  const legacy = legacyNet(g, o, m, d);
  assert.equal(walk.deductionsTotal, d, `${label}: itemized sum == legacy deductions`);
  assert.equal(walk.artistTotal, legacy, `${label}: artist total == legacy net`);
  checks += 2;
  console.log(
    [label.padEnd(40), money(legacy), money(walk.artistTotal), walk.artistTotal === legacy ? '✓' : '✗'].join('  '),
  );
}

// (a) Migrated single-value rows reproduce the legacy net exactly.
migratedRow('Migrated: 25,000 gtee − 3,000 ded', 25000, 0, 0, 3000);
migratedRow('Migrated: + 4,000 overage', 25000, 4000, 0, 3000);
migratedRow('Migrated: + 1,200 merch', 25000, 4000, 1200, 3000);
migratedRow('Migrated: zero deductions', 18000, 0, 0, 0);
migratedRow('Migrated: fractional', 12345.67, 890.12, 45.5, 678.9);

console.log('-'.repeat(72));
console.log('\nMulti-line case — withholding + venue cost sum to the same net as one equivalent value\n');
console.log(
  ['fixture'.padEnd(40), 'single-value net'.padStart(16), 'itemized net'.padStart(14), 'ok'].join('  '),
);
console.log('-'.repeat(74));

// (b) A multi-line settlement (withholding + venue cost) flows to the SAME net the
//     engine reported before with the equivalent single deductions value.
function multiLine(label: string, g: number, o: number, m: number, ded: number[]) {
  const singleD = ded.reduce((n, x) => n + x, 0);
  const singleNet = legacyNet(g, o, m, singleD);
  const walk = computeWalk({
    guarantee: g,
    deductions: ded.map((amount) => ({ amount })),
    expenses: [],
    overage: o,
    merch: m,
    depositReceived: 0,
    payments: [],
  });
  assert.equal(walk.deductionsTotal, singleD, `${label}: Σ itemized == single value`);
  assert.equal(walk.artistTotal, singleNet, `${label}: itemized net == single-value net`);
  checks += 2;
  console.log(
    [label.padEnd(40), money(singleNet), money(walk.artistTotal), walk.artistTotal === singleNet ? '✓' : '✗'].join('  '),
  );
}

multiLine('Withholding 2,000 + venue 1,000', 25000, 4000, 1200, [2000, 1000]);
multiLine('WH 3,750 + venue 500 + comm 250', 40000, 0, 0, [3750, 500, 250]);
multiLine('Four itemized deductions', 30000, 2500, 800, [1000, 750, 500, 250]);

console.log('-'.repeat(74));
console.log('\nWalk stages — deposit + expenses + payments reduce as specified\n');

// (c) Full walk: expenses reduce show net; deposit reduces balance due; payments
//     reduce outstanding. (New money the legacy engine never had — additive.)
const full = computeWalk({
  guarantee: 25000,
  deductions: [{ amount: 2000 }, { amount: 1000 }], // 3,000
  expenses: [{ amount: 1500 }, { amount: 500 }], // 2,000
  overage: 4000,
  merch: 1200,
  depositReceived: 5000,
  payments: [{ amount: 10000 }],
});
assert.equal(full.adjustedGross, 22000, 'adjusted gross = 25000 − 3000');
assert.equal(full.showNet, 20000, 'show net = 22000 − 2000');
assert.equal(full.artistTotal, 25200, 'artist total = 20000 + 4000 + 1200');
assert.equal(full.balanceDue, 20200, 'balance due = 25200 − 5000 deposit');
assert.equal(full.outstanding, 10200, 'outstanding = 20200 − 10000 paid');
checks += 5;
console.log(
  `full walk: gtee 25000 → adj 22000 → net 20000 → artist 25200 → balance 20200 → outstanding 10200  ✓`,
);
console.log('-'.repeat(74));

console.log('\nBox office (migration 262) — computeBoxOffice pins; guarantee-only stays bit-identical\n');

// (d) computeBoxOffice pins — the deal-grain calculator (walk.ts, additive).
const deal = (over: Partial<DealInput>): DealInput => ({
  dealType: null, dealPct: null, bonusThreshold: null, bonusPct: null,
  ticketPrice: null, ticketCapacity: null, comps: null, ticketsSold: null, grossBO: null,
  ...over,
});

// (d1) Guarantee-only deal → NO waterfall (null) and computeWalk output UNCHANGED
//      from the exact fixture in (c) — the bit-identical hard gate.
assert.equal(
  computeBoxOffice(deal({ dealType: 'guarantee', dealPct: 85, grossBO: 50000, ticketsSold: 1000, ticketPrice: 50 }), [{ amount: 999 }], 2000, 25000),
  null,
  'guarantee deal: computeBoxOffice is null even with full BO data',
);
assert.equal(computeBoxOffice(deal({ dealType: null, grossBO: 50000 }), [], 0, 0), null, 'null deal type → null');
assert.equal(computeBoxOffice(deal({ dealType: 'door_deal', grossBO: 50000 }), [], 0, 0), null, 'dealPct null → null');
assert.equal(computeBoxOffice(deal({ dealType: 'door_deal', dealPct: 80 }), [], 0, 0), null, 'no gross basis → null');
const fullAgain = computeWalk({
  guarantee: 25000,
  deductions: [{ amount: 2000 }, { amount: 1000 }],
  expenses: [{ amount: 1500 }, { amount: 500 }],
  overage: 4000,
  merch: 1200,
  depositReceived: 5000,
  payments: [{ amount: 10000 }],
});
assert.deepEqual(fullAgain, full, 'guarantee-only computeWalk output unchanged (bit-identical)');
checks += 5;
console.log('guarantee-only: computeBoxOffice → null · computeWalk unchanged  ✓');

// (d2) Door deal 80% on a 10,000 split pool, guarantee 0 → the FULL share
//      surfaces as overage: 13,000 gross − 1,000 fees − 2,000 exp = 10,000 pool;
//      80% = 8,000.
const door = computeBoxOffice(deal({ dealType: 'door_deal', dealPct: 80, grossBO: 13000 }), [{ amount: 1000 }], 2000, 0);
assert.ok(door, 'door deal computes');
assert.equal(door!.netBO, 12000, 'net BO = 13000 − 1000 fees');
assert.equal(door!.splitPool, 10000, 'split pool = 12000 − 2000 expenses');
assert.equal(door!.artistShare, 8000, 'artist share = 80% of 10000');
assert.equal(door!.resolvedOverage, 8000, 'door deal gtd 0 → full share as overage');
checks += 5;
console.log('door_deal 80% · pool 10000 · gtd 0        → overage  8000.00  ✓');

// (d3) Guarantee + 85% of a 20,000 pool vs gtd 15,000 → greater-of as overage:
//      17,000 share − 15,000 gtd = 2,000.
const gplus = computeBoxOffice(deal({ dealType: 'guarantee_plus', dealPct: 85, grossBO: 21000 }), [], 1000, 15000);
assert.ok(gplus, 'guarantee_plus computes');
assert.equal(gplus!.splitPool, 20000, 'split pool = 21000 − 1000 expenses');
assert.equal(gplus!.artistShare, 17000, 'artist share = 85% of 20000');
assert.equal(gplus!.resolvedOverage, 2000, 'overage = 17000 − 15000 gtd');
checks += 4;
console.log('guarantee_plus 85% · pool 20000 · gtd 15000 → overage  2000.00  ✓');

// (d4) Bonus tier fires ONLY above the threshold (v1 rule: (sold − threshold)
//      × price × bonusPct/100). At/below threshold → 0.
const bonusDeal = (sold: number) =>
  computeBoxOffice(
    deal({ dealType: 'guarantee_plus', dealPct: 85, bonusThreshold: 500, bonusPct: 10, ticketPrice: 50, ticketsSold: sold }),
    [], 0, 100000, // huge guarantee so overage stays 0 and we read the bonus alone
  );
assert.equal(bonusDeal(400)!.bonus, 0, 'below threshold → no bonus');
assert.equal(bonusDeal(500)!.bonus, 0, 'AT threshold → no bonus (strictly above)');
assert.equal(bonusDeal(600)!.bonus, 500, 'above: (600−500) × 50 × 10% = 500');
// And the bonus participates in the greater-of: share 25,500 + bonus 500 vs gtd 25,000 → 1,000 overage.
const bonusOver = computeBoxOffice(
  deal({ dealType: 'guarantee_plus', dealPct: 85, bonusThreshold: 500, bonusPct: 10, ticketPrice: 50, ticketsSold: 600 }),
  [], 0, 25000,
);
assert.equal(bonusOver!.artistShare, 25500, 'share = 85% of 600×50');
assert.equal(bonusOver!.resolvedOverage, 1000, 'overage = 25500 + 500 bonus − 25000 gtd');
checks += 5;
console.log('bonus tier: 400→0 · 500→0 · 600→500 · share+bonus−gtd → 1000.00  ✓');
console.log('-'.repeat(74));

console.log(`\nsettlement reconcile: ${checks} checks passed — itemized Walk reproduces legacy net EXACTLY.\n`);

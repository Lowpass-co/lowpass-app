/* ============================================
   LOWPASS — Payroll reconciliation harness (THE MONEY GATE)

   Proves the new extensible rate-line engine (computeTotals over
   ratesToLines) reproduces the LEGACY fee math EXACTLY, for the four
   legacy rate types, across every src/lib/payroll/fees.test.ts case plus
   the pinned reconciliation targets.

   Run:  node --experimental-strip-types src/lib/payroll/reconcile.harness.ts

   The reference below is an INDEPENDENT re-implementation of the ORIGINAL
   pre-redesign formula (inlined, not imported) — so "reference === engine"
   is a genuine non-regression check, not the engine compared to itself.
   Exits 0 with a table, or throws on the first mismatch.
   ============================================ */

import assert from 'node:assert/strict';
import {
  computeTotals,
  ratesToLines,
  computeTotalFee,
  computeTotalPerDiem,
  countDayStatuses,
  type RateLike,
  type DayCounts,
} from './fees.ts';

const num = (v: unknown): number => Number(v) || 0;

/* ── Independent reference = the ORIGINAL formula, inlined ───────────── */
const referenceFee = (r: RateLike, c: DayCounts, adv: number | string | null): number =>
  c.show * num(r.show_rate) +
  c.offTravel * num(r.off_rate) +
  c.rehearsal * num(r.rehearsal_rate) +
  num(adv);
const referencePerDiem = (r: RateLike, c: DayCounts): number => c.active * num(r.per_diem);

const round2 = (n: number) => Math.round(n * 100) / 100;

interface Case {
  label: string;
  rate: RateLike;
  counts: DayCounts;
  advance: number;
  /** 'fee' | 'pd' — which total this case pins. */
  kind: 'fee' | 'pd';
  pinned: number; // the exact expected value (unrounded, to the cent)
}

const CASES: Case[] = [
  // The fees.test.ts cases (unrounded to the cent):
  { label: 'Richie (show==off 635.95, 2+4d, adv 794.93)', rate: { show_rate: 635.95, off_rate: 635.95, per_diem: 0 }, counts: { show: 2, offTravel: 4, rehearsal: 0, active: 6 }, advance: 794.93, kind: 'fee', pinned: 4610.63 },
  { label: 'Duncan/split (401.65 show, 200.83 off, 2+4d)', rate: { show_rate: 401.65, off_rate: 200.83, per_diem: 0 }, counts: { show: 2, offTravel: 4, rehearsal: 0, active: 6 }, advance: 0, kind: 'fee', pinned: 1606.62 },
  { label: 'Jake/flat (450 both, 2+3d)', rate: { show_rate: 450, off_rate: 450, per_diem: 0 }, counts: { show: 2, offTravel: 3, rehearsal: 0, active: 5 }, advance: 0, kind: 'fee', pinned: 2250 },
  { label: 'Rehearsal (250/day × 2 rehearsal days)', rate: { rehearsal_rate: 250, show_rate: 0, off_rate: 0, per_diem: 0 }, counts: { show: 0, offTravel: 0, rehearsal: 2, active: 2 }, advance: 0, kind: 'fee', pinned: 500 },
  { label: 'Per-diem (30/day × 3 active days)', rate: { per_diem: 30 }, counts: { show: 1, offTravel: 1, rehearsal: 1, active: 3 }, advance: 0, kind: 'pd', pinned: 90 },
  // No show-rate fallback for travel: 300 show / 0 off over 21+10 = 6300.
  { label: 'No-fallback (300 show, 0 off, 21+10d)', rate: { show_rate: 300, off_rate: 0, per_diem: 0 }, counts: { show: 21, offTravel: 10, rehearsal: 0, active: 31 }, advance: 0, kind: 'fee', pinned: 6300 },
];

console.log('\nPayroll reconciliation — legacy reference vs new rate-line engine\n');
console.log(
  ['case'.padEnd(46), 'reference'.padStart(11), 'engine'.padStart(11), 'pinned'.padStart(9), 'ok'].join('  '),
);
console.log('-'.repeat(92));

let checks = 0;
for (const c of CASES) {
  const lines = ratesToLines(c.rate, c.advance);
  const totals = computeTotals(lines, c.counts);
  const engine = c.kind === 'fee' ? totals.totalFee : totals.totalPerDiem;
  const reference = c.kind === 'fee' ? referenceFee(c.rate, c.counts, c.advance) : referencePerDiem(c.rate, c.counts);

  // 1. engine reproduces the independent reference EXACTLY (identical floats).
  assert.equal(engine, reference, `${c.label}: engine ${engine} !== reference ${reference}`);
  // 2. and both hit the pinned target (to the cent).
  assert.equal(round2(engine), c.pinned, `${c.label}: ${round2(engine)} !== pinned ${c.pinned}`);
  // 3. the legacy delegating fns match too (the 8 readers' entry points).
  const legacy = c.kind === 'fee' ? computeTotalFee(c.rate, c.counts, c.advance) : computeTotalPerDiem(c.rate, c.counts);
  assert.equal(legacy, engine, `${c.label}: legacy fn ${legacy} !== engine ${engine}`);

  checks += 3;
  console.log(
    [
      c.label.padEnd(46),
      reference.toFixed(2).padStart(11),
      engine.toFixed(2).padStart(11),
      String(c.pinned).padStart(9),
      '✓',
    ].join('  '),
  );
}

/* ── The fees.test.ts rounded assertions, via the engine ────────────── */
const round = (n: number) => Math.round(n);
assert.equal(round(computeTotalFee({ show_rate: 635.95, off_rate: 635.95, per_diem: 0 }, { show: 2, offTravel: 4, rehearsal: 0, active: 6 }, 794.93)), 4611);
assert.equal(round(computeTotalFee({ show_rate: 401.65, off_rate: 200.83, per_diem: 0 }, { show: 2, offTravel: 4, rehearsal: 0, active: 6 }, 0)), 1607);
assert.equal(round(computeTotalPerDiem({ per_diem: 33.47 }, { show: 2, offTravel: 3, rehearsal: 0, active: 5 })), 167);
checks += 3;

// no_tour ignored; rehearsal counts for fee + PD.
const counts = countDayStatuses({ '2026-01-01': 'show', '2026-01-02': 'off_travel', '2026-01-03': 'rehearsal', '2026-01-04': 'no_tour' });
assert.deepEqual(counts, { show: 1, offTravel: 1, rehearsal: 1, active: 3 });
assert.equal(computeTotalFee({ show_rate: 100, off_rate: 50, rehearsal_rate: 25, per_diem: 10 }, counts, 0), 175);
assert.equal(computeTotalPerDiem({ per_diem: 10 }, counts), 30);
checks += 3;

console.log('-'.repeat(92));
console.log(`\npayroll reconciliation: ${checks} checks passed — engine reproduces legacy EXACTLY.\n`);

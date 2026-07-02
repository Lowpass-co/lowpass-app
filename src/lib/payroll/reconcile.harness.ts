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
// UI phase — the reader-switch gate: totals sourced via the rate_types +
// personnel_rate_lines model (DEFAULT_RATE_TYPES catalog) must equal the
// legacy-column path for the five defaults.
import {
  DEFAULT_RATE_TYPES,
  buildRateLines,
  defaultLinesFromLegacy,
  type RateLineRow,
} from './rateLines.ts';

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

/* ── THE READER-SWITCH GATE ──────────────────────────────────────────
   Every money reader is being switched to source amounts from
   personnel_rate_lines (via the DEFAULT_RATE_TYPES catalog) instead of the
   legacy personnel_rates.* columns. Prove the switch moves NO money: for the
   five defaults, totals built from rate-lines === totals built from the legacy
   columns, for BOTH buckets, on every case above.

   `defaultLinesFromLegacy` mirrors migration 228's backfill (legacy column →
   default rate-type amount); building via buildRateLines(rows, DEFAULT_RATE_TYPES)
   is exactly the path the readers take from the DB. ─────────────────────── */
console.log('\nReader-switch gate — rate-lines-sourced totals vs legacy-column totals\n');
console.log(['case'.padEnd(46), 'legacy fee'.padStart(11), 'lines fee'.padStart(11), 'legacy PD'.padStart(10), 'lines PD'.padStart(10), 'ok'].join('  '));
console.log('-'.repeat(100));
for (const c of CASES) {
  // Legacy-column path (what the readers used to do).
  const legacyTotals = computeTotals(ratesToLines(c.rate, c.advance), c.counts);
  // Rate-lines path #1: the direct legacy→default-lines bridge.
  const linesTotalsA = computeTotals(defaultLinesFromLegacy(c.rate, c.advance), c.counts);
  // Rate-lines path #2: assemble from personnel_rate_lines rows exactly as a
  // reader would (rate_type_id → amount), through the catalog. This exercises
  // buildRateLines (the reader helper), not just the bridge.
  const rows: RateLineRow[] = [
    { rate_type_id: DEFAULT_RATE_TYPES[0].id, amount: c.rate.show_rate ?? 0 },
    { rate_type_id: DEFAULT_RATE_TYPES[1].id, amount: c.rate.off_rate ?? 0 },
    { rate_type_id: DEFAULT_RATE_TYPES[2].id, amount: c.rate.rehearsal_rate ?? 0 },
    { rate_type_id: DEFAULT_RATE_TYPES[3].id, amount: c.rate.per_diem ?? 0 },
    { rate_type_id: DEFAULT_RATE_TYPES[4].id, amount: c.advance },
  ];
  const linesTotalsB = computeTotals(buildRateLines(rows, DEFAULT_RATE_TYPES), c.counts);

  assert.equal(linesTotalsA.totalFee, legacyTotals.totalFee, `${c.label}: rate-lines fee ${linesTotalsA.totalFee} !== legacy ${legacyTotals.totalFee}`);
  assert.equal(linesTotalsA.totalPerDiem, legacyTotals.totalPerDiem, `${c.label}: rate-lines PD ${linesTotalsA.totalPerDiem} !== legacy ${legacyTotals.totalPerDiem}`);
  assert.equal(linesTotalsB.totalFee, legacyTotals.totalFee, `${c.label}: reader-assembled fee ${linesTotalsB.totalFee} !== legacy ${legacyTotals.totalFee}`);
  assert.equal(linesTotalsB.totalPerDiem, legacyTotals.totalPerDiem, `${c.label}: reader-assembled PD ${linesTotalsB.totalPerDiem} !== legacy ${legacyTotals.totalPerDiem}`);
  checks += 4;
  console.log([
    c.label.padEnd(46),
    legacyTotals.totalFee.toFixed(2).padStart(11),
    linesTotalsB.totalFee.toFixed(2).padStart(11),
    legacyTotals.totalPerDiem.toFixed(2).padStart(10),
    linesTotalsB.totalPerDiem.toFixed(2).padStart(10),
    '✓',
  ].join('  '));
}
console.log('-'.repeat(100));

/* ── DAY_RATE GATE (migration 229) ───────────────────────────────────
   A `day_rate` person is billed FLAT by generate: active × off_rate, IGNORING
   show_rate. Migration 229 re-seeds them onto the a6 Day-rate line (= off_rate,
   basis per_active_day) and REMOVES their a1/a2/a3 split lines. Prove the
   rate-lines total (a6 flat + a4 per-diem + a5 advance) === generate's legacy
   flat total, even when show_rate ≠ off_rate (the case the 5-defaults gate
   missed). ─────────────────────────────────────────────────────────── */

// Legacy reference = generate's day_rate branch, inlined independently.
const dayRateLegacyFee = (offRate: number, active: number, adv: number): number =>
  active * offRate + adv;
const dayRateLegacyPerDiem = (perDiem: number, active: number): number => active * perDiem;

// Assemble a day_rate person's rate lines EXACTLY as migration 229 leaves them:
// a6 = off_rate (per_active_day), a4 = per_diem, a5 = advance. No a1/a2/a3.
function dayRateLines(offRate: number, perDiem: number, adv: number): RateLineRow[] {
  return [
    { rate_type_id: DEFAULT_RATE_TYPES[5].id, amount: offRate },  // a6 Day rate
    { rate_type_id: DEFAULT_RATE_TYPES[3].id, amount: perDiem },  // a4 Per diem
    { rate_type_id: DEFAULT_RATE_TYPES[4].id, amount: adv },      // a5 Advance
  ];
}

interface DayCase { label: string; showRate: number; offRate: number; perDiem: number; adv: number; counts: DayCounts; }
const DAY_CASES: DayCase[] = [
  // show_rate ≠ off_rate — the money-mover the split model would have introduced.
  { label: 'Day-rate (show 500 IGNORED, off 300, 3+2d, adv 100)', showRate: 500, offRate: 300, perDiem: 0, adv: 100, counts: { show: 3, offTravel: 2, rehearsal: 0, active: 5 } },
  { label: 'Day-rate + PD (off 275, pd 40, 4 show + 1 reh)', showRate: 999, offRate: 275, perDiem: 40, adv: 0, counts: { show: 4, offTravel: 0, rehearsal: 1, active: 5 } },
];
console.log('\nDay-rate gate (migration 229) — a6 flat line vs generate legacy flat total\n');
console.log(['case'.padEnd(48), 'legacy fee'.padStart(11), 'a6 fee'.padStart(11), 'legacy PD'.padStart(10), 'a6 PD'.padStart(10), 'ok'].join('  '));
console.log('-'.repeat(102));
for (const d of DAY_CASES) {
  const legacyFee = dayRateLegacyFee(d.offRate, d.counts.active, d.adv);
  const legacyPd = dayRateLegacyPerDiem(d.perDiem, d.counts.active);
  const totals = computeTotals(buildRateLines(dayRateLines(d.offRate, d.perDiem, d.adv), DEFAULT_RATE_TYPES), d.counts);
  assert.equal(totals.totalFee, legacyFee, `${d.label}: rate-lines fee ${totals.totalFee} !== legacy day_rate ${legacyFee}`);
  assert.equal(totals.totalPerDiem, legacyPd, `${d.label}: rate-lines PD ${totals.totalPerDiem} !== legacy day_rate ${legacyPd}`);
  checks += 2;
  console.log([
    d.label.padEnd(48),
    legacyFee.toFixed(2).padStart(11),
    totals.totalFee.toFixed(2).padStart(11),
    legacyPd.toFixed(2).padStart(10),
    totals.totalPerDiem.toFixed(2).padStart(10),
    '✓',
  ].join('  '));
}
console.log('-'.repeat(102));

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

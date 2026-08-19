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
  type RateLine,
} from './fees.ts';
// UI phase — the reader-switch gate: totals sourced via the rate_types +
// personnel_rate_lines model (DEFAULT_RATE_TYPES catalog) must equal the
// legacy-column path for the five defaults.
import {
  DEFAULT_RATE_TYPES,
  DEFAULT_RATE_TYPE_IDS,
  buildRateLines,
  defaultLinesFromLegacy,
  linesFromLegacyCard,
  type RateLineRow,
  type RateTypeMeta,
} from './rateLines.ts';

const RT = DEFAULT_RATE_TYPE_IDS;
// G2-1, Ruling A — the day-type override drives pay via the SAME single path
// (effective status → day_statuses → countDayStatuses). One SSOT for the mapping.
import { brushTypeToStatus, type BrushType } from './effectiveDayType.ts';

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
    { rate_type_id: RT.show, amount: c.rate.show_rate ?? 0 },
    { rate_type_id: RT.offTravel, amount: c.rate.off_rate ?? 0 },
    { rate_type_id: RT.rehearsal, amount: c.rate.rehearsal_rate ?? 0 },
    { rate_type_id: RT.perDiem, amount: c.rate.per_diem ?? 0 },
    { rate_type_id: RT.advance, amount: c.advance },
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
    { rate_type_id: RT.dayRate, amount: offRate },  // a6 Flat day (né Day rate)
    { rate_type_id: RT.perDiem, amount: perDiem },  // a4 Per diem
    { rate_type_id: RT.advance, amount: adv },      // a5 Advance
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

/* ── OVERRIDE GATE (G2-1, Ruling A) ──────────────────────────────────
   The day-type brush drives PAY. A person-day's effective status =
   type_override ?? tour_day_type (brushTypeToStatus), painted into day_statuses
   — the SAME single pay path, no separate table. Prove that overriding a day
   MOVES the day's fee from the tour-day rate to the override rate (show-vs-
   travel), that Promo/Radio bills the show rate (Dillon's radio-on-a-travel-day),
   and that a day_rate person's flat is type-agnostic. Pre/post totals pinned.
   ─────────────────────────────────────────────────────────────────── */
console.log('\nOverride gate (G2-1 brush) — effective type ≠ tour day type drives pay\n');

// Paint each tour day with a brush → the persisted day_statuses map.
const paintDays = (tourTypes: string[], brushes: BrushType[]): Record<string, string> => {
  const m: Record<string, string> = {};
  tourTypes.forEach((tt, i) => {
    m[`2026-03-${String(i + 1).padStart(2, '0')}`] = brushTypeToStatus(brushes[i], tt);
  });
  return m;
};

// Split-rate person: show 500 / off 300 (a1/a2 default lines).
const splitRows: RateLineRow[] = [
  { rate_type_id: RT.show, amount: 500 },      // a1 show
  { rate_type_id: RT.offTravel, amount: 300 }, // a2 travel (né off/travel)
  { rate_type_id: RT.rehearsal, amount: 0 },
  { rate_type_id: RT.perDiem, amount: 0 },
  { rate_type_id: RT.advance, amount: 0 },
];
const splitLines = buildRateLines(splitRows, DEFAULT_RATE_TYPES);
// day_rate person: a6 flat off 300 per ACTIVE day (type-agnostic).
const drLines = buildRateLines(dayRateLines(300, 0, 0), DEFAULT_RATE_TYPES);
const feeOf = (statuses: Record<string, string>, lines: typeof splitLines) =>
  computeTotals(lines, countDayStatuses(statuses)).totalFee;

const travelTour = ['travel', 'travel', 'travel', 'travel', 'travel'];
const allDefault: BrushType[] = ['tour_default', 'tour_default', 'tour_default', 'tour_default', 'tour_default'];
const base = paintDays(travelTour, allDefault);                                    // 5× off_travel
const ovShow = paintDays(travelTour, ['show', ...allDefault.slice(1)]);            // day1 travel→SHOW
const ovRadio = paintDays(travelTour, ['promo_radio', ...allDefault.slice(1)]);    // day1 Promo/Radio→show

// Split: base 5×300 = 1500; override day1 to show → 500 + 4×300 = 1700 (+200 = show−off).
assert.equal(feeOf(base, splitLines), 1500, `split base ${feeOf(base, splitLines)} !== 1500`);
assert.equal(feeOf(ovShow, splitLines), 1700, `split override→show ${feeOf(ovShow, splitLines)} !== 1700`);
// 261 — Promo/Radio persists its OWN status now; the Dillon ruling survives as
// the DEFAULT via line resolution: with no Press/Radio amount, the Show line
// gains 'promo_radio' (resolvePersonLines) and the radio day bills the show rate.
assert.equal(brushTypeToStatus('promo_radio', 'travel'), 'promo_radio', 'promo_radio persists its own status (261)');
assert.equal(feeOf(ovRadio, splitLines), 1700, `split override→radio (press unset → show rate) ${feeOf(ovRadio, splitLines)} !== 1700`);
// day_rate: flat per ACTIVE day; the override must NOT move it (5 × 300 = 1500 both).
assert.equal(feeOf(base, drLines), 1500, `day-rate base ${feeOf(base, drLines)} !== 1500`);
assert.equal(feeOf(ovShow, drLines), 1500, `day-rate override ${feeOf(ovShow, drLines)} !== 1500 (flat must be type-agnostic)`);
checks += 6;

/* ── CANONICAL-MODEL GATE (migration 261 — Adam's flat-seven) ────────
   The NEW money semantics, pinned:
     1. Press/Radio SET → the promo day bills the press rate, not show.
     2. OFF pays the TRAVEL rate (+ Flat day counts it as worked); the new
        'pd_only' day is the only no-fee day on tour; 'no_tour' earns nothing.
     3. Stacking (sum): Flat day + Show both set → both bill.
     4. Show-only person (Show set, no Travel, no Flat day) → only shows are
        paid; every other assigned day is PD only. No special case — the £0
        travel line bills nothing.                                          */
console.log('\nCanonical-model gate (261) — press · off=travel · pd_only · stacking · show-only\n');

// 1. Press set: same split person + press 150. Radio day bills 150 (not 500).
const pressRows: RateLineRow[] = [...splitRows, { rate_type_id: RT.pressRadio, amount: 150 }];
const pressLines = buildRateLines(pressRows, DEFAULT_RATE_TYPES);
assert.equal(feeOf(ovRadio, pressLines), 150 + 4 * 300, `press-set radio day ${feeOf(ovRadio, pressLines)} !== 1350`);
// …and the show days are untouched by the press line.
assert.equal(feeOf(ovShow, pressLines), 1700, `press-set show override ${feeOf(ovShow, pressLines)} !== 1700`);

// 2a. OFF pays the travel rate: split person, day1 painted Off on a travel
//     tour → identical to the all-travel base (300 × 5).
const ovOff = paintDays(travelTour, ['off', ...allDefault.slice(1)]);
assert.equal(feeOf(ovOff, splitLines), 1500, `off day ${feeOf(ovOff, splitLines)} !== 1500 (OFF must bill the travel rate)`);
// 2b. Flat-day person: off is worked, pd_only is not; PD covers all assigned.
const flatRows: RateLineRow[] = [
  { rate_type_id: RT.dayRate, amount: 200 },
  { rate_type_id: RT.perDiem, amount: 20 },
];
const flatLines = buildRateLines(flatRows, DEFAULT_RATE_TYPES);
const dayMix = countDayStatuses({
  '2026-04-01': 'show', '2026-04-02': 'travel', '2026-04-03': 'rehearsal',
  '2026-04-04': 'off', '2026-04-05': 'pd_only', '2026-04-06': 'no_tour',
});
const flatTotals = computeTotals(flatLines, dayMix);
assert.equal(flatTotals.totalFee, 4 * 200, `flat-day fee ${flatTotals.totalFee} !== 800 (off IS worked; pd_only/no_tour are not)`);
assert.equal(flatTotals.totalPerDiem, 5 * 20, `PD ${flatTotals.totalPerDiem} !== 100 (pd_only earns PD; no_tour never)`);

// 3. Stacking: flat day 100 + show 250 over 2 show + 1 travel → 300 + 500 = 800.
const stackRows: RateLineRow[] = [
  { rate_type_id: RT.dayRate, amount: 100 },
  { rate_type_id: RT.show, amount: 250 },
];
const stackLines = buildRateLines(stackRows, DEFAULT_RATE_TYPES);
const stackTotals = computeTotals(stackLines, countDayStatuses({ '2026-05-01': 'show', '2026-05-02': 'show', '2026-05-03': 'travel' }));
assert.equal(stackTotals.totalFee, 800, `stacking ${stackTotals.totalFee} !== 800 (flat day and show must BOTH bill)`);

// 4. Show-only person: show 200, travel 0, no flat day, PD 20 — over the same
//    mixed week only the show day pays; PD covers every assigned day.
const showOnlyRows: RateLineRow[] = [
  { rate_type_id: RT.show, amount: 200 },
  { rate_type_id: RT.offTravel, amount: 0 },
  { rate_type_id: RT.perDiem, amount: 20 },
];
const showOnlyLines = buildRateLines(showOnlyRows, DEFAULT_RATE_TYPES);
const showOnlyTotals = computeTotals(showOnlyLines, dayMix);
assert.equal(showOnlyTotals.totalFee, 200, `show-only fee ${showOnlyTotals.totalFee} !== 200 (only the show day pays)`);
assert.equal(showOnlyTotals.totalPerDiem, 100, `show-only PD ${showOnlyTotals.totalPerDiem} !== 100 (every assigned day earns PD)`);
checks += 8;

for (const [label, val, want] of [
  ['Press SET — radio day bills press 150', feeOf(ovRadio, pressLines), 1350],
  ['OFF paints — bills the travel rate (base holds)', feeOf(ovOff, splitLines), 1500],
  ['Flat day — off worked (4×200), pd_only not', flatTotals.totalFee, 800],
  ['PD — pd_only earns (5×20), no_tour never', flatTotals.totalPerDiem, 100],
  ['Stacking — flat day + show both bill', stackTotals.totalFee, 800],
  ['Show-only — shows pay, rest PD only', showOnlyTotals.totalFee, 200],
] as [string, number, number][]) {
  console.log([label.padEnd(48), val.toFixed(2).padStart(11), String(want).padStart(9), val === want ? '✓' : '✗'].join('  '));
}

console.log(['scenario'.padEnd(46), 'fee'.padStart(11), 'pinned'.padStart(9), 'ok'].join('  '));
console.log('-'.repeat(76));
for (const [label, val, want] of [
  ['Split base — 5 travel days @ off 300', feeOf(base, splitLines), 1500],
  ['Split override — day1 travel→SHOW @ 500', feeOf(ovShow, splitLines), 1700],
  ['Split override — day1 Promo/Radio → show', feeOf(ovRadio, splitLines), 1700],
  ['Day-rate base — 5 active @ 300 flat', feeOf(base, drLines), 1500],
  ['Day-rate override — day1→show, flat holds', feeOf(ovShow, drLines), 1500],
] as [string, number, number][]) {
  console.log([label.padEnd(46), val.toFixed(2).padStart(11), String(want).padStart(9), val === want ? '✓' : '✗'].join('  '));
}
console.log('-'.repeat(76));

/* ── NEW RATE-TYPE GATE (G2-1) ───────────────────────────────────────
   Flat tour / Weekly / Per-diem-only. ADDITIVE — the existing day_rate /
   split math is UNMOVED (the 52 baseline stays green above). Weekly bills the
   new per_week basis (weekly amount × distinct active weeks); Flat tour bills
   flat_once (fixed, day-count-independent); Per-diem-only bills only the
   per_diem bucket (no fee line). ────────────────────────────────────── */
console.log('\nNew rate-type gate (G2-1) — Flat tour / Weekly / Per-diem-only\n');

// Five active days across THREE distinct Mon-start weeks.
const multiWeek = countDayStatuses({
  '2026-03-02': 'show', '2026-03-04': 'show', // week of Mar 2
  '2026-03-09': 'show', '2026-03-11': 'show', // week of Mar 9
  '2026-03-16': 'show',                        // week of Mar 16
});
assert.equal(multiWeek.weeks, 3, `weeks ${multiWeek.weeks} !== 3`);
assert.equal(multiWeek.active, 5, `active ${multiWeek.active} !== 5`);

const weeklyLines: RateLine[] = [{ bucket: 'fee', basis: 'per_week', amount: 1000 }];
const flatTourLines: RateLine[] = [{ bucket: 'fee', basis: 'flat_once', amount: 5000 }];
const perDiemOnlyLines: RateLine[] = [{ bucket: 'per_diem', basis: 'per_active_day', amount: 40 }];

const weekly = computeTotals(weeklyLines, multiWeek);
const flatTour = computeTotals(flatTourLines, multiWeek);
const perDiemOnly = computeTotals(perDiemOnlyLines, multiWeek);

assert.equal(weekly.totalFee, 3000, `weekly fee ${weekly.totalFee} !== 3000`);        // 1000 × 3 weeks
assert.equal(flatTour.totalFee, 5000, `flat-tour fee ${flatTour.totalFee} !== 5000`); // day-count-independent
assert.equal(perDiemOnly.totalFee, 0, `per-diem-only fee ${perDiemOnly.totalFee} !== 0`);
assert.equal(perDiemOnly.totalPerDiem, 200, `per-diem-only PD ${perDiemOnly.totalPerDiem} !== 200`); // 40 × 5 active
checks += 6;

console.log(['scenario'.padEnd(44), 'fee'.padStart(11), 'per diem'.padStart(10), 'ok'].join('  '));
console.log('-'.repeat(72));
for (const [label, fee, pd] of [
  ['Weekly — 1000/wk × 3 active weeks', weekly.totalFee, weekly.totalPerDiem],
  ['Flat tour — 5000 fixed (over 5 days)', flatTour.totalFee, flatTour.totalPerDiem],
  ['Per-diem-only — 40/day × 5, no fee', perDiemOnly.totalFee, perDiemOnly.totalPerDiem],
] as [string, number, number][]) {
  console.log([label.padEnd(44), fee.toFixed(2).padStart(11), pd.toFixed(2).padStart(10), '✓'].join('  '));
}
console.log('-'.repeat(72));

/* ── The fees.test.ts rounded assertions, via the engine ────────────── */
const round = (n: number) => Math.round(n);
assert.equal(round(computeTotalFee({ show_rate: 635.95, off_rate: 635.95, per_diem: 0 }, { show: 2, offTravel: 4, rehearsal: 0, active: 6 }, 794.93)), 4611);
assert.equal(round(computeTotalFee({ show_rate: 401.65, off_rate: 200.83, per_diem: 0 }, { show: 2, offTravel: 4, rehearsal: 0, active: 6 }, 0)), 1607);
assert.equal(round(computeTotalPerDiem({ per_diem: 33.47 }, { show: 2, offTravel: 3, rehearsal: 0, active: 5 })), 167);
checks += 3;

// no_tour ignored; rehearsal counts for fee + PD.
const counts = countDayStatuses({ '2026-01-01': 'show', '2026-01-02': 'off_travel', '2026-01-03': 'rehearsal', '2026-01-04': 'no_tour' });
// weeks: 2026-01-01..03 are Thu/Fri/Sat of the same Mon-start week ⇒ 1 week.
// 261 adds promo/off/pdOnly/assigned; legacy data has none, so assigned == active.
assert.deepEqual(counts, { show: 1, offTravel: 1, rehearsal: 1, promo: 0, off: 0, pdOnly: 0, active: 3, assigned: 3, weeks: 1 });
assert.equal(computeTotalFee({ show_rate: 100, off_rate: 50, rehearsal_rate: 25, per_diem: 10 }, counts, 0), 175);
assert.equal(computeTotalPerDiem({ per_diem: 10 }, counts), 30);
checks += 3;

/* ══════════════════════════════════════════════════════════════════════
   CALLER-LEVEL DIVERGENCE PINS (money convergence, 2026-08-19)

   Everything above this line tests the ENGINE, and the engine was never
   wrong. That is precisely why 72 green checks coexisted with six surfaces
   computing payroll six different ways: the harness had coverage of
   `fees.ts` and none of its CALLERS. These pins sit at the caller level —
   the server's line resolution and the per-week splitting that the export
   does — because that is where every bug in this bank actually lived.
   ══════════════════════════════════════════════════════════════════════ */
console.log('\nCaller-level divergence pins — the paths, not the engine\n');

/** `rateLinesFor`'s two branches, reproduced exactly — it dispatches on
 *  "does this person have rate-line rows?" and then calls one of these two.
 *  The dispatch itself lives in `loadRateLines.ts`, which the harness cannot
 *  import (extensionless value import, unresolvable under type-stripping); the
 *  BODIES are both here, which is where the arithmetic is. */
const linesFromRows = (rows: RateLineRow[], types: RateTypeMeta[] = DEFAULT_RATE_TYPES) =>
  buildRateLines(rows, types);
const linesFromCard = (card: RateLike & { advance_fee?: number }, types: RateTypeMeta[] = DEFAULT_RATE_TYPES) =>
  linesFromLegacyCard(card, card.advance_fee ?? 0, types);

/** A tour with the day statuses that used to be counted wrong: a painted OFF
 *  day, a PD-ONLY day and a PROMO_RADIO day, alongside the legacy three. */
const MIXED = countDayStatuses({
  '2026-04-06': 'show',
  '2026-04-07': 'off_travel',
  '2026-04-08': 'rehearsal',
  '2026-04-09': 'off',
  '2026-04-10': 'pd_only',
  '2026-04-11': 'promo_radio',
  '2026-04-12': 'no_tour',
});
assert.deepEqual(
  { show: MIXED.show, offTravel: MIXED.offTravel, rehearsal: MIXED.rehearsal, promo: MIXED.promo, off: MIXED.off, pdOnly: MIXED.pdOnly, active: MIXED.active, assigned: MIXED.assigned },
  { show: 1, offTravel: 1, rehearsal: 1, promo: 1, off: 1, pdOnly: 1, active: 5, assigned: 6 },
);
checks++;

/* ── PIN 1 — A BLANK RATE CARD READS ZERO ON BOTH PATHS (M-1a) ─────────
   The payroll page synthesises a row for every canonical type with amount 0,
   so a card with no `personnel_rate_lines` displays £0. The server fell back
   to the legacy columns. When the card is blank both must be zero — and when
   it is NOT blank they must at least count days the same way (pin 2). */
const blankServer = computeTotals(
  linesFromCard({ show_rate: 0, off_rate: 0, rehearsal_rate: 0, per_diem: 0, advance_fee: 0 }),
  MIXED,
);
// The client's path: every canonical type present, amount 0.
const blankClient = computeTotals(
  buildRateLines(DEFAULT_RATE_TYPES.map((t) => ({ rate_type_id: t.id, amount: 0 })), DEFAULT_RATE_TYPES),
  MIXED,
);
assert.equal(blankServer.totalFee, 0, `blank card server fee ${blankServer.totalFee} !== 0`);
assert.equal(blankServer.totalPerDiem, 0, `blank card server PD ${blankServer.totalPerDiem} !== 0`);
assert.equal(blankServer.totalFee, blankClient.totalFee);
assert.equal(blankServer.totalPerDiem, blankClient.totalPerDiem);
checks += 4;

/* ── PIN 2 — THE LEGACY FALLBACK COUNTS DAYS THE CANONICAL WAY (M-1a) ──
   Two cards, identical money, one carrying rate LINES and one carrying only
   legacy COLUMNS. Their totals must match. Before the fix they did not:
   `ratesToLines` billed per-diem `per_active_day` (losing the pd_only day)
   and gave Travel only `['off_travel']` (losing the painted off day), while
   the catalog bills `per_assigned_day` and `['off_travel','travel','off']`. */
const AMOUNTS = { show: 300, travel: 150, rehearsal: 200, perDiem: 40, advance: 500 };
const lined = computeTotals(
  linesFromRows([
    { rate_type_id: RT.show, amount: AMOUNTS.show },
    { rate_type_id: RT.offTravel, amount: AMOUNTS.travel },
    { rate_type_id: RT.rehearsal, amount: AMOUNTS.rehearsal },
    { rate_type_id: RT.perDiem, amount: AMOUNTS.perDiem },
    { rate_type_id: RT.advance, amount: AMOUNTS.advance },
  ]),
  MIXED,
);
const legacyFallback = computeTotals(
  linesFromCard({
    show_rate: AMOUNTS.show,
    off_rate: AMOUNTS.travel,
    rehearsal_rate: AMOUNTS.rehearsal,
    per_diem: AMOUNTS.perDiem,
    advance_fee: AMOUNTS.advance,
  }),
  MIXED,
);
assert.equal(legacyFallback.totalFee, lined.totalFee, `fallback fee ${legacyFallback.totalFee} !== lined ${lined.totalFee}`);
assert.equal(legacyFallback.totalPerDiem, lined.totalPerDiem, `fallback PD ${legacyFallback.totalPerDiem} !== lined ${lined.totalPerDiem}`);
checks += 2;

/* ── PIN 3 — THE PD_ONLY DAY EARNS PER DIEM AND NO FEE ─────────────────
   6 assigned days × 40 = 240, not 5 active × 40 = 200. The old fallback's
   `per_active_day` per-diem meta produced 200, silently, for exactly the
   cards that could not be seen on the payroll page. */
assert.equal(lined.totalPerDiem, 240, `per diem ${lined.totalPerDiem} !== 240 (6 assigned × 40)`);
assert.equal(legacyFallback.totalPerDiem, 240);
checks += 2;

/* ── PIN 4 — THE PROMO_RADIO DAY BILLS THE SHOW RATE (Dillon ruling) ───
   No Press/Radio amount is set on either card, so promo days fall back to
   Show. Fee = show(300 × [show + promo] = 2) + travel(150 × [travel + off]
   = 2) + rehearsal(200 × 1) + advance(500) = 600 + 300 + 200 + 500. */
assert.equal(lined.totalFee, 1600, `fee ${lined.totalFee} !== 1600`);
assert.equal(legacyFallback.totalFee, 1600);
checks += 2;

/* ── PIN 5 — A PAINTED DAY CANNOT COST SOMEONE THEIR ADVANCE (M-1b) ────
   The export bills per week: per-day lines against that week's counts, plus
   the ONE-TIME lines (a5 Advance, a7 Flat tour) applied once. The sum across
   weeks must equal the whole-tour total. The old code dropped every
   `flat_once` line and re-added `payroll_entries.advance_fee` — so a7 Flat
   tour vanished entirely, and a5 came back as whatever the last day-status
   paint had left in the column, which was 0.

   This is the pin the brief asks for as "an advance fee whose days get
   painted": paint or no paint, the one-time charges are the card's. */
const advLines = linesFromRows([
  { rate_type_id: RT.show, amount: 400 },
  { rate_type_id: RT.offTravel, amount: 200 },
  { rate_type_id: RT.perDiem, amount: 50 },
  { rate_type_id: RT.advance, amount: 1000 },   // a5 flat_once
  { rate_type_id: RT.flatTour, amount: 2500 },  // a7 flat_once — used to vanish
]);
const advBase = advLines.filter((l) => l.basis !== 'flat_once');
const ZERO: DayCounts = { show: 0, offTravel: 0, rehearsal: 0, promo: 0, off: 0, pdOnly: 0, active: 0, assigned: 0, weeks: 0 };
const advOneTime = computeTotals(advLines.filter((l) => l.basis === 'flat_once'), ZERO);
assert.equal(advOneTime.totalFee, 3500, `one-time ${advOneTime.totalFee} !== 3500 (advance 1000 + flat tour 2500)`);

// Two weeks of painting. Week counts must sum to the tour counts.
const wk1 = countDayStatuses({ '2026-05-04': 'show', '2026-05-06': 'off_travel' });
const wk2 = countDayStatuses({ '2026-05-11': 'show', '2026-05-12': 'show', '2026-05-13': 'off' });
const tourCounts = countDayStatuses({
  '2026-05-04': 'show', '2026-05-06': 'off_travel',
  '2026-05-11': 'show', '2026-05-12': 'show', '2026-05-13': 'off',
});
const perWeekFee =
  computeTotals(advBase, wk1).totalFee +
  computeTotals(advBase, wk2).totalFee +
  advOneTime.totalFee;
const wholeTourFee = computeTotals(advLines, tourCounts).totalFee;
assert.equal(perWeekFee, wholeTourFee, `per-week ${perWeekFee} !== whole-tour ${wholeTourFee}`);
// And the absolute number, so a change to both halves at once still fails:
// show 400 × 3 + travel 200 × (1 travel + 1 off) + 3500 one-time.
assert.equal(wholeTourFee, 400 * 3 + 200 * 2 + 3500);
// The OLD export arithmetic, inlined, for contrast — it is short by the whole
// a7 Flat tour and by the advance the paint had zeroed.
const oldExportFee =
  computeTotals(advBase, wk1).totalFee + computeTotals(advBase, wk2).totalFee + 0;
assert.equal(wholeTourFee - oldExportFee, 3500, 'the one-time charges the old export dropped');
checks += 4;

console.log(['pin'.padEnd(58), 'fee'.padStart(11), 'per diem'.padStart(10), 'ok'].join('  '));
console.log('-'.repeat(86));
for (const [label, fee, pd] of [
  ['blank card — server path == client path == 0', blankServer.totalFee, blankServer.totalPerDiem],
  ['legacy-column fallback (off + pd_only + promo)', legacyFallback.totalFee, legacyFallback.totalPerDiem],
  ['same card as rate LINES — must be identical', lined.totalFee, lined.totalPerDiem],
  ['advance + flat tour, split across two weeks', perWeekFee, 0],
] as [string, number, number][]) {
  console.log([label.padEnd(58), fee.toFixed(2).padStart(11), pd.toFixed(2).padStart(10), '✓'].join('  '));
}
console.log('-'.repeat(86));

console.log('-'.repeat(92));
console.log(`\npayroll reconciliation: ${checks} checks passed — engine reproduces legacy EXACTLY,\nand the CALLERS agree with it.\n`);

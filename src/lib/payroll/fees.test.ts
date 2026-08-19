/* ============================================
   LOWPASS — payroll fee math test (PAY-OPS17)

   Proves the OPS-17 fee split against Adam's real sheet
   ("GN | Payroll | Bottlerock & Miami", GRID_SURFACES_DESIGN.md §Payroll):
       Richie $4,611 · Duncan $1,607 · Jake $2,250 · Adam PD $167
   No test runner is configured — run directly via Node type-stripping:

       node --experimental-strip-types src/lib/payroll/fees.test.ts

   Exits 0 ("payroll fees: N checks passed") or throws on the first failure.
   This is a RE-VERIFY of the already-correct fees.ts (D1) — it must not change.
   ============================================ */

import assert from 'node:assert/strict';
import {
  countDayStatuses,
  computeTotalFee,
  computeTotalPerDiem,
  computeTotals,
  computeLineAmount,
  ratesToLines,
  type RateLine,
} from './fees.ts';

let checks = 0;
const round = (n: number) => Math.round(n);

// Richie — show_rate == off_rate (635.95), 2 show + 4 off/travel, advance 794.93.
assert.equal(
  round(computeTotalFee({ show_rate: 635.95, off_rate: 635.95, per_diem: 0 }, { show: 2, offTravel: 4, rehearsal: 0, active: 6 }, 794.93)),
  4611,
);
checks++;

// Duncan — travel rate is HALF the show rate because that's his real off_rate
// (NOT a band rule): 401.65 show, 200.83 off, 2 show + 4 off.
assert.equal(
  round(computeTotalFee({ show_rate: 401.65, off_rate: 200.83, per_diem: 0 }, { show: 2, offTravel: 4, rehearsal: 0, active: 6 }, 0)),
  1607,
);
checks++;

// Jake — flat 450 both, 2 show + 3 off.
assert.equal(
  round(computeTotalFee({ show_rate: 450, off_rate: 450, per_diem: 0 }, { show: 2, offTravel: 3, rehearsal: 0, active: 5 }, 0)),
  2250,
);
checks++;

// Adam — per diem 33.47 over 5 engaged days (show + off/travel).
assert.equal(round(computeTotalPerDiem({ per_diem: 33.47 }, { show: 2, offTravel: 3, rehearsal: 0, active: 5 })), 167);
checks++;

// No show-rate fallback for travel days: show 300, off 0, over 21 show + 10 travel
// → £6,300 (NOT £9,300).
assert.equal(
  computeTotalFee({ show_rate: 300, off_rate: 0, per_diem: 0 }, { show: 21, offTravel: 10, rehearsal: 0, active: 31 }, 0),
  6300,
);
checks++;

// no_tour days pay nothing + earn no per diem; rehearsal counts for fee + PD (D3).
const counts = countDayStatuses({ '2026-01-01': 'show', '2026-01-02': 'off_travel', '2026-01-03': 'rehearsal', '2026-01-04': 'no_tour' });
// 261 — countDayStatuses also returns promo/off/pdOnly/assigned; legacy data
// has none, so assigned == active and nothing moves.
assert.deepEqual(counts, { show: 1, offTravel: 1, rehearsal: 1, promo: 0, off: 0, pdOnly: 0, active: 3, assigned: 3, weeks: 1 });
checks++;
assert.equal(
  computeTotalFee({ show_rate: 100, off_rate: 50, rehearsal_rate: 25, per_diem: 10 }, counts, 0),
  175, // 100 + 50 + 25; no_tour ignored
);
checks++;
assert.equal(computeTotalPerDiem({ per_diem: 10 }, counts), 30); // 3 engaged days incl. rehearsal
checks++;

// ── New extensible engine (b2, migration 228) ────────────────────────

// computeTotals over explicit rate lines: fee bucket sums, per_diem bucket
// stays separate. Richie via lines (show+off at 635.95, advance flat_once).
const richieLines: RateLine[] = [
  { bucket: 'fee', basis: 'per_day_status', dayStatuses: ['show'], amount: 635.95 },
  { bucket: 'fee', basis: 'per_day_status', dayStatuses: ['off_travel'], amount: 635.95 },
  { bucket: 'fee', basis: 'flat_once', amount: 794.93 },
];
assert.equal(round(computeTotals(richieLines, { show: 2, offTravel: 4, rehearsal: 0, active: 6 }).totalFee), 4611);
checks++;

// per_active_day per-diem line feeds totalPerDiem, not totalFee.
const pd = computeTotals(
  [{ bucket: 'per_diem', basis: 'per_active_day', amount: 33.47 }],
  { show: 2, offTravel: 3, rehearsal: 0, active: 5 },
);
assert.equal(round(pd.totalPerDiem), 167);
assert.equal(pd.totalFee, 0);
checks += 2;

// per_day_status line billing multiple statuses (a user could define one).
assert.equal(
  computeLineAmount(
    { bucket: 'fee', basis: 'per_day_status', dayStatuses: ['show', 'rehearsal'], amount: 100 },
    { show: 2, offTravel: 5, rehearsal: 3, active: 10 },
  ),
  500, // (2 show + 3 rehearsal) × 100 ; off_travel excluded
);
checks++;

// flat_once bills exactly once regardless of day count.
assert.equal(computeLineAmount({ bucket: 'fee', basis: 'flat_once', amount: 250 }, { show: 9, offTravel: 9, rehearsal: 9, active: 27 }), 250);
checks++;

// LEGACY EQUIVALENCE: the delegating legacy fns === the engine over the
// five default lines, for the Duncan split case (money invariant).
const dCounts = { show: 2, offTravel: 4, rehearsal: 0, active: 6 };
const dRate = { show_rate: 401.65, off_rate: 200.83, per_diem: 0 };
assert.equal(computeTotalFee(dRate, dCounts, 0), computeTotals(ratesToLines(dRate, 0), dCounts).totalFee);
assert.equal(computeTotalFee(dRate, dCounts, 0), 1606.62);
checks += 2;

// ── Canonical model (migration 261, Adam's flat-seven) ───────────────

// 'travel' and legacy 'off_travel' are the SAME bucket; a line listing both
// spellings bills each travel day exactly ONCE (bucket de-dupe).
const mixed = countDayStatuses({ '2026-02-02': 'travel', '2026-02-03': 'off_travel', '2026-02-04': 'show' });
assert.equal(mixed.offTravel, 2);
assert.equal(
  computeLineAmount(
    { bucket: 'fee', basis: 'per_day_status', dayStatuses: ['off_travel', 'travel'], amount: 100 },
    mixed,
  ),
  200, // 2 travel days × 100 — NOT 400
);
checks += 2;

// 'off' = on tour, day off: bills like TRAVEL (Adam: "OFF should pay travel
// rate") and counts as worked; 'pd_only' earns PD only; 'no_tour' earns
// nothing (Adam: "NO TOUR is the only day not paid a PD").
const withOff = countDayStatuses({
  '2026-02-02': 'show', '2026-02-03': 'travel', '2026-02-04': 'off',
  '2026-02-05': 'pd_only', '2026-02-06': 'no_tour',
});
assert.deepEqual(
  { active: withOff.active, assigned: withOff.assigned, off: withOff.off, pdOnly: withOff.pdOnly },
  { active: 3, assigned: 4, off: 1, pdOnly: 1 },
);
// Flat day (per_active_day) bills worked days INCLUDING off; never pd_only/no_tour.
assert.equal(computeLineAmount({ bucket: 'fee', basis: 'per_active_day', amount: 200 }, withOff), 600);
// The Travel line bills travel + off days (canonical dayStatuses list).
assert.equal(
  computeLineAmount({ bucket: 'fee', basis: 'per_day_status', dayStatuses: ['off_travel', 'travel', 'off'], amount: 300 }, withOff),
  600, // 1 travel + 1 off — the show/pd_only/no_tour days don't bill it
);
// Per diem (per_assigned_day) bills the pd_only day too — but never no_tour.
assert.equal(computeLineAmount({ bucket: 'per_diem', basis: 'per_assigned_day', amount: 20 }, withOff), 80);
checks += 4;

// Show-only person (Adam: "if there is a show rate, no travel rate and no flat
// rate — only shows are paid, other days are PD only"). No special case: the
// £0 travel line bills nothing, PD covers every assigned day.
const showOnly = computeTotals(
  [
    { bucket: 'fee', basis: 'per_day_status', dayStatuses: ['show'], amount: 200 },
    { bucket: 'fee', basis: 'per_day_status', dayStatuses: ['off_travel', 'travel', 'off'], amount: 0 },
    { bucket: 'per_diem', basis: 'per_assigned_day', amount: 20 },
  ],
  withOff, // 1 show + 1 travel + 1 off + 1 pd_only
);
assert.equal(showOnly.totalFee, 200);      // the show day only
assert.equal(showOnly.totalPerDiem, 80);   // all 4 assigned days
checks += 2;

// promo_radio is its own count bucket; a Press/Radio line bills it directly.
const withPromo = countDayStatuses({ '2026-02-02': 'show', '2026-02-03': 'promo_radio' });
assert.equal(withPromo.promo, 1);
assert.equal(
  computeLineAmount({ bucket: 'fee', basis: 'per_day_status', dayStatuses: ['promo_radio'], amount: 150 }, withPromo),
  150,
);
// The Dillon-ruling fallback (press amount unset → promo bills SHOW rate) is a
// LINE-RESOLUTION concern: a Show line whose dayStatuses gained 'promo_radio'
// bills show + promo days at the show rate.
assert.equal(
  computeLineAmount({ bucket: 'fee', basis: 'per_day_status', dayStatuses: ['show', 'promo_radio'], amount: 300 }, withPromo),
  600,
);
checks += 3;

// STACKING (Adam's sum ruling): Flat day + Show both set → both bill.
const stacked = computeTotals(
  [
    { bucket: 'fee', basis: 'per_active_day', amount: 100 }, // flat day
    { bucket: 'fee', basis: 'per_day_status', dayStatuses: ['show'], amount: 250 }, // show
  ],
  { show: 2, offTravel: 1, rehearsal: 0, active: 3, assigned: 3 },
);
assert.equal(stacked.totalFee, 100 * 3 + 250 * 2);
checks++;

/* ── TWO flat_once LINES SUM (money convergence, 2026-08-19) ──────────
   `flat_once` is not one rate, it is two: a5 Advance AND a7 Flat tour. Both
   POST /api/budget/payroll and the payroll export used to write
   `lines.filter((l) => l.basis !== 'flat_once')` and then re-add a single
   `advance_fee` scalar — so a person on a Flat tour rate was billed nothing
   for it, anywhere the persisted column was read. Nothing asserted that the
   two coexist, so the drop was invisible. */
const twoFlatOnce = computeTotals(
  [
    { bucket: 'fee', basis: 'per_day_status', dayStatuses: ['show'], amount: 400 },
    { bucket: 'fee', basis: 'flat_once', amount: 1000 },  // a5 Advance
    { bucket: 'fee', basis: 'flat_once', amount: 2500 },  // a7 Flat tour
  ],
  { show: 3, offTravel: 0, rehearsal: 0, active: 3, assigned: 3 },
);
assert.equal(twoFlatOnce.totalFee, 400 * 3 + 1000 + 2500);
// …and neither of them moves with the day count.
const twoFlatOnceLongTour = computeTotals(
  [
    { bucket: 'fee', basis: 'flat_once', amount: 1000 },
    { bucket: 'fee', basis: 'flat_once', amount: 2500 },
  ],
  { show: 40, offTravel: 20, rehearsal: 5, active: 65, assigned: 70 },
);
assert.equal(twoFlatOnceLongTour.totalFee, 3500);
checks += 2;

console.log(`payroll fees: ${checks} checks passed`);

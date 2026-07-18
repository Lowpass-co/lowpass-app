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
// G2-1 — countDayStatuses now also returns `weeks` (distinct active weeks); the
// three active days here fall in one Mon-start week.
assert.deepEqual(counts, { show: 1, offTravel: 1, rehearsal: 1, active: 3, weeks: 1 });
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

console.log(`payroll fees: ${checks} checks passed`);

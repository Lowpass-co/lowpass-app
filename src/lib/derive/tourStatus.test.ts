/* Tour status derivation test — the safety net for the A3 consolidation.
   Run: node --experimental-strip-types src/lib/derive/tourStatus.test.ts */
import assert from 'node:assert';
import {
  nextShow,
  tourPhase,
  tourStatusLine,
  countInPlanning,
  countOnTourNow,
  countEndedUnsettled,
  type DeriveRoutingDay,
  type DeriveTour,
} from './tourStatus.ts';

let pass = 0;
const check = (label: string, cond: boolean) => {
  assert.ok(cond, label);
  pass++;
};

const TODAY = '2026-07-05';

const days: DeriveRoutingDay[] = [
  { date: '2026-06-01', day_type: 'show' },        // past show — ignored by nextShow
  { date: '2026-07-20', day_type: 'rehearsal' },   // upcoming rehearsal (before first show)
  { date: '2026-07-25', day_type: 'off' },         // ignored
  { date: '2026-08-26', day_type: 'show,festival' }, // first upcoming show
  { date: '2026-08-27', day_type: 'festival' },
];

// DRV-01 — nextShow is Show-Day filtered (rehearsal/off/past never count).
{
  const ns = nextShow(days, TODAY);
  check('nextShow picks the first upcoming show/festival', ns?.date === '2026-08-26');
  check('nextShow daysAway is correct', ns?.daysAway === 52);
  check('nextShow ignores rehearsal + off + past', nextShow([{ date: '2026-07-20', day_type: 'rehearsal' }], TODAY) === null);
}

// DRV-02 — status line vocabulary (§8), verb + time anchor, no mood words.
{
  const upcoming: DeriveTour = { start_date: '2026-08-26', end_date: '2026-09-10' };
  // Next milestone is the rehearsal (before the first show) → "Rehearsals in N days".
  check('upcoming names the next rehearsal', tourStatusLine(upcoming, days, TODAY) === 'Rehearsals in 15 days');
  // With no pre-show event, the anchor is the first show.
  const onlyShows = days.filter((d) => d.day_type.includes('show') || d.day_type.includes('festival'));
  check('upcoming with only shows → First show in N', tourStatusLine(upcoming, onlyShows, TODAY) === 'First show in 52 days');

  const running: DeriveTour = { start_date: '2026-07-01', end_date: '2026-07-24' };
  check('on tour → day X of Y', tourStatusLine(running, days, TODAY) === 'Tour running · day 5 of 24');

  const planning: DeriveTour = { start_date: null, end_date: null };
  check('no dates → planning', tourStatusLine(planning, [], TODAY) === 'Planning · dates not locked');

  const endedUnsettled: DeriveTour = { start_date: '2026-05-01', end_date: '2026-06-13', settled: false };
  check('ended + unsettled', tourStatusLine(endedUnsettled, days, TODAY) === 'Ended 13 Jun · not settled');
  const endedSettled: DeriveTour = { start_date: '2026-05-01', end_date: '2026-06-13', settled: true };
  check('ended + settled drops the suffix', tourStatusLine(endedSettled, days, TODAY) === 'Ended 13 Jun');

  const off: DeriveTour = { start_date: '2026-08-26', end_date: '2026-09-10' };
  check('upcoming with no routing → Off the road', tourStatusLine(off, [], TODAY) === 'Off the road');
}

// DRV-03 — counts. In-planning is FUTURE only (never ended); on-tour + ended-unsettled split cleanly.
{
  const tours: DeriveTour[] = [
    { start_date: '2026-08-26', end_date: '2026-09-10' },              // upcoming → in planning
    { start_date: null, end_date: null },                             // planning (no dates) → in planning
    { start_date: '2026-07-01', end_date: '2026-07-24' },             // on tour now
    { start_date: '2026-05-01', end_date: '2026-06-13', settled: false }, // ended, unsettled
    { start_date: '2026-04-01', end_date: '2026-04-30', settled: true },  // ended, settled
  ];
  check('in-planning counts only future tours (not the 2 ended)', countInPlanning(tours, TODAY) === 2);
  check('on-tour-now = 1', countOnTourNow(tours, TODAY) === 1);
  check('ended-unsettled = 1 (settled one excluded)', countEndedUnsettled(tours, TODAY) === 1);
  // The "9 IN PLANNING counting ended tours" regression: an ended tour must never
  // land in the planning bucket.
  check('ended tour is phase=ended, not planning', tourPhase(tours[3], TODAY) === 'ended');
}

console.log(`tourStatus.test.ts — ${pass} assertions passed`);

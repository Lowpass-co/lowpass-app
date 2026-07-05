/* ============================================
   LOWPASS — resolveVenue scripted proof (Venue SSOT)

   Run: node --experimental-strip-types src/lib/venues/resolveVenue.harness.ts

   Proves the live-vs-frozen discriminator without a database:
   - an UPCOMING row with a canonical link renders canonical (edits flow through)
   - a PAST row renders the routing.venue_* snapshot (history never rewrites)
   - a frozen (venue_frozen_at set) upcoming row still renders the snapshot
   - a free-text upcoming row (no canonical link) renders routing columns
   - phone/website always come from the routing row (no canonical column, v1)
   ============================================ */

import { resolveVenue, isVenueFrozen, type RoutingVenueSource } from './resolveVenue.ts';

const TODAY = '2026-07-05';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

// Canonical row = the edited, current truth. Routing snapshot = the old value.
const canonical = {
  id: 'cv1',
  name: 'The Fillmore (edited)',
  address: '1805 Geary Blvd, San Francisco',
  city: 'San Francisco',
  country: 'US',
  capacity: 1315,
};
const snapshot = {
  venue_name: 'The Fillmore (old)',
  address: '99 Old Address',
  venue_phone: '+1 415 000 0000',
  venue_website: 'https://thefillmore.example',
  venue_capacity: 1200,
  city: 'San Francisco',
  country: 'US',
  canonical_venue_id: 'cv1',
};

// 1) Upcoming + canonical → LIVE (reflects the edit).
{
  const row: RoutingVenueSource = { id: 'r1', date: '2026-08-01', ...snapshot, canonical };
  const v = resolveVenue(row, { today: TODAY });
  check('upcoming row is live (source canonical)', v.source === 'canonical');
  check('upcoming row shows edited name', v.name === 'The Fillmore (edited)');
  check('upcoming row shows edited address', v.address === '1805 Geary Blvd, San Francisco');
  check('upcoming row shows edited capacity', v.capacity === 1315);
  check('phone still from routing (no canonical column)', v.phone === '+1 415 000 0000');
  check('website still from routing', v.website === 'https://thefillmore.example');
}

// 2) Past row → FROZEN snapshot (history does not rewrite).
{
  const row: RoutingVenueSource = { id: 'r2', date: '2026-06-01', ...snapshot, canonical };
  const v = resolveVenue(row, { today: TODAY });
  check('past row is frozen', v.source === 'frozen');
  check('past row shows OLD snapshot name', v.name === 'The Fillmore (old)');
  check('past row shows OLD snapshot address', v.address === '99 Old Address');
  check('past row shows OLD snapshot capacity', v.capacity === 1200);
}

// 3) Upcoming but explicitly frozen (venue_frozen_at set) → snapshot stands.
{
  const row: RoutingVenueSource = {
    id: 'r3', date: '2026-08-01', ...snapshot, canonical, venue_frozen_at: '2026-07-01T00:00:00Z',
  };
  const v = resolveVenue(row, { today: TODAY });
  check('frozen-stamped upcoming row stays frozen', v.source === 'frozen');
  check('frozen-stamped row shows snapshot name', v.name === 'The Fillmore (old)');
}

// 4) Free-text upcoming row (no canonical link) → routing columns.
{
  const row: RoutingVenueSource = {
    id: 'r4', date: '2026-08-01',
    venue_name: 'One-off Warehouse', address: '5 Dock St', venue_phone: null,
    venue_website: null, venue_capacity: 400, city: 'Bristol', country: 'GB',
    canonical_venue_id: null, canonical: null,
  };
  const v = resolveVenue(row, { today: TODAY });
  check('free-text row renders routing columns', v.name === 'One-off Warehouse');
  check('free-text row source is frozen (routing authoritative)', v.source === 'frozen');
}

// 5) isVenueFrozen edge cases.
{
  check('today is not frozen', isVenueFrozen({ date: TODAY }, TODAY) === false);
  check('yesterday is frozen', isVenueFrozen({ date: '2026-07-04' }, TODAY) === true);
  check('locked day is frozen', isVenueFrozen({ date: '2026-08-01', locked: true }, TODAY) === true);
  check('no date is not frozen', isVenueFrozen({ date: null }, TODAY) === false);
}

console.log(`\nresolveVenue: ${passed} checks passed, ${failed} failed`);
if (failed > 0) process.exit(1);

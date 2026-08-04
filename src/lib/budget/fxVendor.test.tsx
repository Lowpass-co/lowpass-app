/* ============================================
   LOWPASS — FX vendor parsing, against captured real responses

   THE CLASS OF BUG, named because it will recur: two vendor legs where leg two
   parsed the PAID response shape against the FREE endpoint. Both legs signal
   failure by returning null rather than throwing, so the route answered 502 for
   every pair, for every caller, with no error anywhere — no exception, no log
   line, no 500. It surfaced only when a new feature finally called it and a
   client-facing quote printed £270 for a $270 item.

   An integration whose failure mode is a SILENT NULL degrades invisibly. The
   only defence is a positive assertion: something must claim a NUMBER comes out
   for a known pair. A status-only check ("route returns 200") would have passed
   throughout — the 200 was never the problem.

   These fixtures are the literal responses captured on 2026-08-04 while
   diagnosing R2-6. Live-vendor calls are not CI-safe (network, rate limits,
   key-gating — which is exactly how leg one died), so the deterministic half is
   asserted here and the live half is the deploy check.
   ============================================ */

import { describe, it, expect } from 'vitest';
import { pickRate } from './fxVendor';

/* Vendor 1, api.exchangerate.host, captured 2026-08-04. HTTP **200**, and no
   rates at all — this is what makes status-only assertions worthless here. */
const VENDOR1_KEY_GATED = {
  success: false,
  error: { code: 101, type: 'missing_access_key', info: 'You have not supplied an API Access Key.' },
};

/* Vendor 2, the FREE open.er-api.com/v6/latest/USD, captured 2026-08-04.
   Rates live under `rates`. The shipped parser read `conversion_rates` and got
   undefined every time. Trimmed to the pairs under test. */
const VENDOR2_FREE = {
  result: 'success',
  provider: 'https://www.exchangerate-api.com',
  base_code: 'USD',
  rates: { USD: 1, GBP: 0.74407, EUR: 0.868722 },
};

/* The PAID exchangerate-api v6 shape the old code was written against. Kept
   supported so buying a key does not silently break this a second time. */
const VENDOR_PAID = {
  result: 'success',
  base_code: 'USD',
  conversion_rates: { USD: 1, GBP: 0.74407 },
};

describe('pickRate — the parse that drifted', () => {
  it('THE REGRESSION: reads the FREE vendor shape', () => {
    /* The shipped parser returned null here, which is the whole outage. */
    expect(pickRate(VENDOR2_FREE, 'GBP')).toBe(0.74407);
    expect(pickRate(VENDOR2_FREE, 'EUR')).toBe(0.868722);
  });

  it('A NUMBER COMES OUT — not merely "no error"', () => {
    /* The positive assertion this integration lacked. Typed, finite, positive. */
    const rate = pickRate(VENDOR2_FREE, 'GBP');
    expect(typeof rate).toBe('number');
    expect(Number.isFinite(rate)).toBe(true);
    expect(rate).toBeGreaterThan(0);
  });

  it('still reads the paid shape, so a key upgrade is not a fresh outage', () => {
    expect(pickRate(VENDOR_PAID, 'GBP')).toBe(0.74407);
  });

  it('a key-gated 200 yields null, so the caller falls through to the next vendor', () => {
    /* Correct behaviour — leg one was never the bug. It must not throw and must
       not invent a rate. */
    expect(pickRate(VENDOR1_KEY_GATED, 'GBP')).toBeNull();
  });

  it('an unknown pair is null, not undefined-coerced-to-something', () => {
    expect(pickRate(VENDOR2_FREE, 'JPY')).toBeNull();
  });

  it('non-numeric and non-finite vendor values never become a rate', () => {
    /* A laxer check would coerce null/'' to 0 and print a free quote. */
    expect(pickRate({ rates: { GBP: null } }, 'GBP')).toBeNull();
    expect(pickRate({ rates: { GBP: '0.74' } }, 'GBP')).toBeNull();
    expect(pickRate({ rates: { GBP: Infinity } }, 'GBP')).toBeNull();
    expect(pickRate({ rates: { GBP: NaN } }, 'GBP')).toBeNull();
  });

  it('garbage in is null, not a throw — the route must try the next vendor', () => {
    for (const junk of [null, undefined, '', 0, [], 'not json']) {
      expect(pickRate(junk, 'GBP')).toBeNull();
    }
  });

  it('the four pairs confirmed live on the deploy round-trip through the parser', () => {
    /* USD→GBP 0.74407, EUR→GBP 0.856745, GBP→USD 1.343961, USD→EUR 0.868722.
       Not a network call — this asserts the parser hands back exactly what the
       deployed route reported, so a future shape change breaks HERE first. */
    expect(pickRate({ rates: { GBP: 0.74407 } }, 'GBP')).toBe(0.74407);
    expect(pickRate({ rates: { GBP: 0.856745 } }, 'GBP')).toBe(0.856745);
    expect(pickRate({ rates: { USD: 1.343961 } }, 'USD')).toBe(1.343961);
    expect(pickRate({ rates: { EUR: 0.868722 } }, 'EUR')).toBe(0.868722);
    /* And the round-trip the deploy proved: USD→GBP then GBP→USD ≈ 1. */
    expect(0.74407 * 1.343961).toBeCloseTo(1, 3);
  });
});

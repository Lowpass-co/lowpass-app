/* ============================================
   LOWPASS — P0 regression: the unauthenticated allow-list

   Cowork found four public token routes gated in production. The venue-intake
   link — the no-signup differentiator — had never worked for a venue. It survived
   because the decision lived inline in edge middleware where no test could reach
   it. It is now a pure function, and this is that test.

   WHAT THIS PROVES: the middleware DECISION for a given path. It is not an HTTP
   round-trip — Cowork re-runs the real six-line probe against the deploy. But the
   decision is exactly what was broken, so this is the unit that would have caught
   it, and the unit that stops it recurring.

   THE NEGATIVE CASES MATTER MOST. `/a/` is a two-character prefix; matched loosely
   it opens /artists, /assets, /admin, /advance, /account and /api at once — a far
   worse hole than the one being closed. Those are asserted shut below, and they
   are the reason every entry ends in '/'.

   Named .test.tsx (not .test.ts) because vitest is scoped to .test.tsx — .test.ts
   is reserved for the standalone `node --experimental-strip-types` money harnesses,
   which must not be swept into this runner.
   ============================================ */

import { describe, it, expect } from 'vitest';
import { isPublicPath, isAuthPath, PUBLIC_PATH_PREFIXES } from './publicRoutes';

/** The exact six paths from Cowork's production probe. */
const PROBE_PUBLIC = [
  '/m/day/BOGUSTOKEN123',
  '/advance-intake/BOGUSTOKEN123',
  '/a/BOGUSTOKEN123',
  '/share/advance/BOGUSTOKEN123',
  '/r/BOGUSTOKEN123',
  '/intake/BOGUSTOKEN123',
  '/s/BOGUSTOKEN123', // B4 — the one show link
];

/** Authed surfaces. Every one of these MUST still bounce to /login. */
const MUST_STAY_GATED = [
  '/m/today',
  '/m/files',
  '/m/receipt',
  '/artists',
  '/artists/abc-123',
  '/assets',
  '/admin',
  '/account',
  '/advance',
  '/advance/tour-1/routing-1',
  '/operations/tour-1/routing',
  '/budget',
  '/settings/members',
  '/api/tours/t1/routing',
  '/',
];

describe('P0 — public token routes reach the app without a session', () => {
  it.each(PROBE_PUBLIC)('%s is public', (path) => {
    expect(isPublicPath(path, true)).toBe(true);
  });

  it('the invite landing stays public', () => {
    expect(isPublicPath('/invite/accept?token=x', true)).toBe(true);
  });
});

describe('P0 — authed surfaces stay gated', () => {
  it.each(MUST_STAY_GATED)('%s is NOT public', (path) => {
    expect(isPublicPath(path, true)).toBe(false);
  });

  // The specific collision the short prefix invites. Stated separately so a
  // failure here reads as "/a/ swallowed a sibling" rather than a generic miss.
  it('/a/ does not swallow /artists, /assets, /admin, /advance, /account or /api', () => {
    for (const p of ['/artists', '/assets', '/admin', '/advance', '/account', '/api/x']) {
      expect(isPublicPath(p, true)).toBe(false);
    }
    expect(isPublicPath('/a/tok', true)).toBe(true);
  });

  // /m/day/ opens; the rest of the mobile app does not.
  it('/m/day/ opens without opening the rest of /m/*', () => {
    expect(isPublicPath('/m/day/tok', true)).toBe(true);
    expect(isPublicPath('/m/today', true)).toBe(false);
    expect(isPublicPath('/m/dayz', true)).toBe(false);
    expect(isPublicPath('/m', true)).toBe(false);
  });

  // /advance-intake/ is public; /advance/ is not. They share five characters.
  it('/advance-intake/ is public but /advance/ is not', () => {
    expect(isPublicPath('/advance-intake/tok', true)).toBe(true);
    expect(isPublicPath('/advance/tour/show', true)).toBe(false);
  });

  // B4 — /s/ is two characters, same collision class as /a/. The trailing
  // slash keeps /settings, /signup and (redundantly with its own entry)
  // /share out of its reach.
  it('/s/ does not swallow /settings, /signup or /share', () => {
    expect(isPublicPath('/s/tok', true)).toBe(true);
    expect(isPublicPath('/settings', true)).toBe(false);
    expect(isPublicPath('/settings/members', true)).toBe(false);
    expect(isPublicPath('/signup', true)).toBe(false); // reachable via isAuthPath, not this list
    expect(isAuthPath('/signup')).toBe(true);
    expect(isPublicPath('/share/x', true)).toBe(false); // only /share/advance/ opens, via its own entry
    expect(isPublicPath('/share/advance/tok', true)).toBe(true);
  });
});

describe('P0 — the prefix-safety invariant itself', () => {
  it('every allow-list entry ends in a separator or is a full segment path', () => {
    for (const p of PUBLIC_PATH_PREFIXES) {
      // '/invite/accept' is a complete path (query string follows), the rest are
      // prefixes that must end in '/' so they cannot match a sibling segment.
      const ok = p.endsWith('/') || p === '/invite/accept';
      expect(ok, `allow-list entry "${p}" must end in "/" or be a full path`).toBe(true);
    }
  });
});

describe('auth pages are reachable signed-out', () => {
  it.each(['/login', '/signup', '/auth/callback'])('%s is an auth path', (p) => {
    expect(isAuthPath(p)).toBe(true);
  });
  it('/artists is not an auth path', () => {
    expect(isAuthPath('/artists')).toBe(false);
  });
});

describe('dev-only stage-plot catalog', () => {
  it('is public in dev and gated in production', () => {
    expect(isPublicPath('/stage-plot-icons', false)).toBe(true);
    expect(isPublicPath('/stage-plot-icons', true)).toBe(false);
  });
});

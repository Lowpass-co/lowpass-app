/* ============================================
   LOWPASS — the IA resolvers, across every URL shape (S-1)

   This module decides what the WHOLE APP highlights. A wrong resolver doesn't
   crash — it quietly mis-highlights every page, which is the kind of bug that
   ships because nobody can point at a broken thing. S-2..S-5 are mechanical
   only if this is right, so every route in IA_CANONICAL_2026-07-21.md is
   asserted here, by hand, from the document.

   The deep-link cases are the ones that matter most: each is a COLD LOAD with no
   prior interaction, which is exactly how a shell built on ambient client state
   fails and how one built on the pathname does not.
   ============================================ */

import { describe, it, expect } from 'vitest';
import {
  resolveScope,
  modeForPath,
  railFor,
  itemsFor,
  activeItemFor,
  modeLandingHref,
  upFrom,
  isUnshelledPath,
  TOUR_MODES,
} from './ia';

const T = 'tour-123';
const A = 'artist-abc';

describe('resolveScope — tour scope, from the path alone', () => {
  it.each([
    [`/operations/${T}/routing`, 'tour'],
    [`/operations/${T}/day`, 'tour'],
    [`/operations/${T}/personnel`, 'tour'],
    [`/budget/${T}`, 'money'],
    [`/budget/${T}/settlement`, 'money'],
    [`/operations/${T}/payroll`, 'money'],
    [`/operations/${T}/hire`, 'production'],
    [`/operations/${T}/channel-list`, 'production'],
    [`/operations/${T}/stage-plot`, 'production'],
    [`/operations/${T}/riders`, 'production'],
    [`/advance/${T}`, 'tour'],
    [`/advance/${T}/routing-9`, 'tour'],
  ])('%s → tour scope, %s mode', (path, mode) => {
    const ctx = resolveScope(path);
    expect(ctx.scope).toBe('tour');
    expect(ctx.tourId).toBe(T);
    expect(ctx.mode).toBe(mode);
  });

  it('PAYROLL is Money even though it lives under /operations', () => {
    /* The rail is organised by what a thing IS, not by which route folder
       history put it in. IA_CANONICAL moves it explicitly. */
    expect(modeForPath(`/operations/${T}/payroll`)).toBe('money');
  });
});

describe('resolveScope — the other three scopes', () => {
  it.each([
    [`/artists/${A}`, 'artist'],
    [`/artists/${A}/riders`, 'artist'],
    [`/artists/${A}/files`, 'artist'],
    [`/artists/${A}/stage-plots/plot-1`, 'artist'],
    [`/artists/${A}/edit`, 'artist'],
  ])('%s → artist scope', (path) => {
    const ctx = resolveScope(path);
    expect(ctx.scope).toBe('artist');
    expect(ctx.artistId).toBe(A);
    expect(ctx.mode).toBeNull();
  });

  it.each(['/artists', '/personnel', '/equipment', '/assets', '/venues', '/'])(
    '%s → workspace scope',
    (path) => {
      expect(resolveScope(path).scope).toBe('workspace');
    },
  );

  it.each(['/settings', '/settings/members', '/settings/ai-limits', '/profile', '/bugs'])(
    '%s → you scope',
    (path) => {
      expect(resolveScope(path).scope).toBe('you');
    },
  );

  it('the mode pill exists ONLY at tour scope', () => {
    for (const p of ['/artists', `/artists/${A}`, '/settings', '/venues']) {
      expect(resolveScope(p).mode).toBeNull();
    }
  });

  it('/artists is workspace, not a malformed artist scope', () => {
    // The bare list must not read as "artist with id undefined".
    const ctx = resolveScope('/artists');
    expect(ctx.scope).toBe('workspace');
    expect(ctx.artistId).toBeNull();
  });
});

describe('activeItemFor — the deep-link contract', () => {
  it('the spec’s named case: cold /budget/[id]/settlement', () => {
    const path = `/budget/${T}/settlement`;
    const ctx = resolveScope(path);
    expect(ctx.scope).toBe('tour');
    expect(ctx.mode).toBe('money');
    expect(ctx.tourId).toBe(T);
    expect(activeItemFor(path)).toBe('settlements');
  });

  it.each([
    [`/operations/${T}/routing`, '', 'routing'],
    [`/operations/${T}/day`, '', 'day-sheets'],
    [`/operations/${T}/day/routing-5`, '', 'day-sheets'],
    // NB: there is no top-level /day/[routingId] route — see the note in ia.ts.
    [`/advance/${T}`, '', 'advance'],
    [`/advance/${T}/routing-5`, '', 'advance'],
    [`/operations/${T}/personnel`, '', 'crew'],
    [`/operations/${T}/rooming`, '', 'rooming'],
    [`/operations/${T}/files`, '', 'files'],
    [`/operations/${T}/payroll`, '', 'payroll'],
    [`/operations/${T}/hire`, '', 'assets'],
    [`/operations/${T}/channel-list`, '', 'channel-list'],
    [`/operations/${T}/stage-plot`, '', 'stage-plot'],
    [`/operations/${T}/riders`, '', 'riders'],
    [`/operations/${T}/riders/pack-1`, '', 'riders'],
    [`/budget/${T}/settlement`, '', 'settlements'],
    [`/artists/${A}`, '', 'overview'],
    [`/artists/${A}/riders`, '', 'riders-specs'],
    [`/artists/${A}/channel-lists`, '', 'riders-specs'],
    [`/artists/${A}/stage-plots/p1`, '', 'riders-specs'],
    [`/artists/${A}/files`, '', 'documents'],
    ['/artists', '', 'artists'],
    ['/personnel', '', 'personnel'],
    ['/assets', '', 'equipment'],
    ['/equipment', '', 'equipment'],
    ['/venues', '', 'venues'],
    ['/settings', '', 'preferences'],
    ['/settings/members', '', 'team'],
    ['/profile', '', 'account'],
    ['/bugs', '', 'bugs'],
  ])('%s%s → %s', (path, search, expected) => {
    expect(activeItemFor(path, search)).toBe(expected);
  });

  it('budget tabs resolve from the QUERY, because that is how the route works', () => {
    expect(activeItemFor(`/budget/${T}`, '?tab=summary')).toBe('summary');
    expect(activeItemFor(`/budget/${T}`, '?tab=budget')).toBe('expenses');
    expect(activeItemFor(`/budget/${T}`, '?tab=income')).toBe('income');
    expect(activeItemFor(`/budget/${T}`, '?tab=receipts')).toBe('receipts');
    expect(activeItemFor(`/budget/${T}`, '?tab=settings')).toBe('reports');
  });

  it('bare /budget/[id] is Expenses — the route’s own default tab', () => {
    expect(activeItemFor(`/budget/${T}`)).toBe('expenses');
  });

  it('the longest href prefix wins', () => {
    // /budget/x/settlement must not resolve to a bare-/budget/x item.
    expect(activeItemFor(`/budget/${T}/settlement`)).toBe('settlements');
  });

  it('nothing matches → null, rather than a confident guess', () => {
    /* A rail that highlights something plausible when it doesn't know is a nav
       that lies. Highlighting nothing is the honest failure. */
    expect(activeItemFor(`/operations/${T}/some-future-page`)).toBeNull();
  });
});

describe('railFor — the shape of each rail', () => {
  it('every tour mode has a rail, and they differ', () => {
    const ids = TOUR_MODES.map((m) => itemsFor('tour', m).map((i) => i.id).join(','));
    expect(new Set(ids).size).toBe(3);
  });

  it('Labor calls is NOT a top-level rail item anywhere', () => {
    /* IA_CANONICAL is explicit: it's reached from Day sheets → Schedule, and its
       badge lives on the Day's Schedule button. */
    const all = [
      ...itemsFor('tour', 'tour'), ...itemsFor('tour', 'money'), ...itemsFor('tour', 'production'),
      ...itemsFor('artist', null), ...itemsFor('workspace', null), ...itemsFor('you', null),
    ];
    expect(all.some((i) => /labor|labour/i.test(i.label))).toBe(false);
  });

  it('Payroll is in Money’s rail and NOT in Tour’s', () => {
    expect(itemsFor('tour', 'money').some((i) => i.id === 'payroll')).toBe(true);
    expect(itemsFor('tour', 'tour').some((i) => i.id === 'payroll')).toBe(false);
  });

  it('every item id is unique within its rail', () => {
    for (const [scope, mode] of [
      ['tour', 'tour'], ['tour', 'money'], ['tour', 'production'],
      ['artist', null], ['workspace', null], ['you', null],
    ] as const) {
      const ids = itemsFor(scope, mode).map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('every rail opens with a group heading', () => {
    for (const [scope, mode] of [
      ['tour', 'tour'], ['tour', 'money'], ['tour', 'production'],
      ['artist', null], ['workspace', null], ['you', null],
    ] as const) {
      expect(railFor(scope, mode)[0].kind).toBe('group');
    }
  });

  it('the not-yet-built pages are present but hrefless — a visible gap, not a hidden one', () => {
    /* IA_CANONICAL S-5: these are missing PAGES, not missing nav. Rendering them
       disabled is what turns "a feature nobody could find" into an empty slot. */
    const hrefless = [
      ...itemsFor('tour', 'tour'), ...itemsFor('tour', 'money'), ...itemsFor('tour', 'production'),
      ...itemsFor('artist', null), ...itemsFor('you', null),
    ].filter((i) => i.href === null).map((i) => i.id);
    expect(hrefless).toEqual(
      expect.arrayContaining(['travel', 'per-diems', 'spaces', 'movements', 'year-budget', 'contacts']),
    );
  });
});

describe('modeLandingHref — clicking a mode pill', () => {
  it('Tour → Routing, Money → Summary, Production → Assets', () => {
    expect(modeLandingHref('tour', T)).toBe(`/operations/${T}/routing`);
    expect(modeLandingHref('money', T)).toBe(`/budget/${T}?tab=summary`);
    expect(modeLandingHref('production', T)).toBe(`/operations/${T}/hire`);
  });

  it('every landing href resolves back to its own mode — no cross-wiring', () => {
    for (const mode of TOUR_MODES) {
      const href = modeLandingHref(mode, T);
      const [path, search] = href.split('?');
      expect(modeForPath(path, search ? `?${search}` : '')).toBe(mode);
    }
  });
});

describe('upFrom — the ↑ link in the mock', () => {
  it('tour → artist when we know the artist', () => {
    expect(upFrom({ scope: 'tour', artistId: A, tourId: T, mode: 'tour' })).toEqual({
      label: 'Artist', href: `/artists/${A}`,
    });
  });

  it('tour → workspace when we don’t', () => {
    expect(upFrom({ scope: 'tour', artistId: null, tourId: T, mode: 'tour' })?.label).toBe('Workspace');
  });

  it('artist → workspace; workspace and you go nowhere', () => {
    expect(upFrom({ scope: 'artist', artistId: A, tourId: null, mode: null })?.label).toBe('Workspace');
    expect(upFrom({ scope: 'workspace', artistId: null, tourId: null, mode: null })).toBeNull();
    expect(upFrom({ scope: 'you', artistId: null, tourId: null, mode: null })).toBeNull();
  });
});

describe('isUnshelledPath — what the shell must NOT wrap', () => {
  it.each([
    '/login', '/signup', '/invite/accept', '/r/tok', '/a/tok', '/intake/tok',
    '/advance-intake/tok', '/m/day/tok', '/m/today', '/share/advance/tok',
    '/rental/print-labels', '/admin/anything', '/grid-demo',
  ])('%s keeps its own chrome', (p) => {
    expect(isUnshelledPath(p)).toBe(true);
  });

  it.each([
    '/artists', `/operations/${T}/routing`, `/budget/${T}`, '/settings', '/venues',
  ])('%s IS shelled', (p) => {
    expect(isUnshelledPath(p)).toBe(false);
  });

  it('/a/ does not swallow /artists, /assets or /advance', () => {
    // The P0 lesson, re-asserted here because this list is prefix-matched too.
    expect(isUnshelledPath('/artists')).toBe(false);
    expect(isUnshelledPath('/assets')).toBe(false);
    expect(isUnshelledPath(`/advance/${T}`)).toBe(false);
  });
});

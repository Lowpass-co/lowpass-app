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
  isShelledPath,
  hasOwnRail,
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

  it('S-3b — /rider-packs/[id] is ARTIST scope with the id supplied by data', () => {
    /* The standalone rider editor joined the artist library (Adam's call,
       2026-08-04). The URL carries no artist id, so the resolver returns null
       and the mounting view passes the pack's artist — same contract as tour
       URLs, where the artist comes from server data too. */
    const ctx = resolveScope('/rider-packs/pack-1');
    expect(ctx.scope).toBe('artist');
    expect(ctx.artistId).toBeNull();
    expect(ctx.mode).toBeNull();
    expect(resolveScope('/rider-packs').scope).toBe('artist');
  });

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

/* ============================================
   THE RSC BOUNDARY (S-1 fix)

   S-1 shipped a server component passing `railFor()`'s output — whose hrefs and
   matchers are FUNCTIONS — to a client component, and React threw during the
   server render. Production showed "Something went wrong"; tsc, eslint, the
   build and every jsdom test passed, because none of them has an RSC boundary.

   These assert the PROPERTY instead of the render: whatever crosses to the
   client must survive a JSON round-trip. That is checkable without a boundary,
   which is exactly why it's the right guard for a fault no local gate can see.
   ============================================ */

import { resolveRailView, railViewIsSerialisable } from './ia';

describe('what crosses to the client is plain data', () => {
  const CTX = { scope: 'tour', artistId: A, tourId: T, mode: 'money' } as const;

  it('the resolved view is serialisable', () => {
    const view = resolveRailView(CTX, `/budget/${T}/settlement`);
    expect(railViewIsSerialisable(view)).toBe(true);
  });

  it('the RAW config is NOT — which is why it must never be passed', () => {
    // railFor() is right for a config module and fatal at a boundary.
    const raw = railFor('tour', 'money') as unknown as Parameters<typeof railViewIsSerialisable>[0];
    expect(railViewIsSerialisable(raw)).toBe(false);
  });

  it('every scope and mode resolves to something serialisable', () => {
    for (const [scope, mode] of [
      ['tour', 'tour'], ['tour', 'money'], ['tour', 'production'],
      ['artist', null], ['workspace', null], ['you', null],
    ] as const) {
      const view = resolveRailView(
        { scope, artistId: A, tourId: T, mode },
        scope === 'tour' ? `/operations/${T}/routing` : '/artists',
      );
      expect(railViewIsSerialisable(view)).toBe(true);
      expect(view.length).toBeGreaterThan(0);
    }
  });

  it('hrefs arrive as strings, or null for unbuilt pages', () => {
    const view = resolveRailView({ scope: 'tour', artistId: A, tourId: T, mode: 'tour' }, `/operations/${T}/routing`);
    const items = view.filter((e) => e.kind === 'item');
    for (const i of items) {
      if (i.kind !== 'item') continue;
      expect(i.href === null || typeof i.href === 'string').toBe(true);
    }
    const travel = items.find((i) => i.kind === 'item' && i.id === 'travel');
    expect(travel && travel.kind === 'item' ? travel.href : 'x').toBeNull();
  });

  it('the active flag is resolved server-side, not left to the client', () => {
    const view = resolveRailView(CTX, `/budget/${T}/settlement`);
    const active = view.filter((e) => e.kind === 'item' && e.active);
    expect(active.length).toBe(1);
    expect(active[0].kind === 'item' && active[0].id).toBe('settlements');
  });

  it('badges arrive as strings', () => {
    const view = resolveRailView(CTX, `/budget/${T}`, '?tab=budget', { lines: 48 });
    const expenses = view.find((e) => e.kind === 'item' && e.id === 'expenses');
    expect(expenses && expenses.kind === 'item' ? expenses.badge : null).toBe('48');
  });
});

/* ============================================
   S-2a — THE MIGRATION BOUNDARY

   The stated failure mode for this whole staging is "a half-migrated app", and
   the thing that makes that survivable is being able to say exactly which half.
   These tests are that statement: every assertion below is a claim about which
   surfaces render the canonical shell TODAY, and each bank flips a handful of
   them deliberately rather than by accident.

   They are also the revert test. If a bank goes red, one entry comes out of
   SHELLED_TOUR_MODES and these say precisely what came back with it.
   ============================================ */

describe('isShelledPath — what is on the canonical shell after S-2c', () => {
  it.each([
    // S-2a — Tour mode.
    `/operations/${T}/routing`,
    `/operations/${T}/day`,
    `/operations/${T}/day/r-1`,
    `/operations/${T}/personnel`,
    `/operations/${T}/rooming`,
    `/operations/${T}/files`,
    `/advance/${T}`,
    `/advance/${T}/r-1`,
    // S-2b — Money mode.
    `/budget/${T}`,
    `/budget/${T}/settlement`,
  ])('%s is shelled', (p) => {
    expect(isShelledPath(p)).toBe(true);
  });

  it('PAYROLL crossed with Money, not with Operations', () => {
    /* It sits in the /operations route tree but it is pay, so it moved rails in
       S-2b — the bank that took Money, not the one that took the Operations
       folder. If this ever reads true a bank early, the rail and the URL have
       stopped agreeing about what Payroll is. */
    expect(isShelledPath(`/operations/${T}/payroll`)).toBe(true);
    expect(modeForPath(`/operations/${T}/payroll`)).toBe('money');
  });

  it.each([
    // S-2c — Production, which completes tour scope.
    `/operations/${T}/hire`,
    `/operations/${T}/channel-list`,
    `/operations/${T}/stage-plot`,
    `/operations/${T}/riders`,
    `/operations/${T}/riders/pack-1`,
  ])('%s is Production → shelled', (p) => {
    expect(isShelledPath(p)).toBe(true);
  });

  it('TOUR SCOPE IS COMPLETE — no tour URL is left on old chrome', () => {
    /* The check that says S-2d can start: if any of these went false, the
       ProductShell branches the next bank deletes would still be load-bearing. */
    for (const mode of TOUR_MODES) {
      expect(isShelledPath(modeLandingHref(mode, T).split('?')[0])).toBe(true);
    }
    // And the odd corners that belong to no rail item.
    for (const p of [`/operations/${T}`, `/operations/${T}/summary`, `/operations/${T}/edit`, `/operations/${T}/labor`]) {
      expect(isShelledPath(p)).toBe(true);
    }
  });

  it.each([
    // S-3a — artist scope.
    `/artists/${A}`,
    `/artists/${A}/edit`,
    `/artists/${A}/production`,
    `/artists/${A}/riders`,
    `/artists/${A}/channel-lists`,
    `/artists/${A}/stage-plots`,
    `/artists/${A}/stage-plots/p1`,
    `/artists/${A}/files`,
  ])('%s is artist scope → shelled', (p) => {
    expect(isShelledPath(p)).toBe(true);
  });

  it.each(['/artists', '/personnel', '/assets', '/venues', '/settings', '/profile', '/bugs'])(
    '%s is workspace or You → shelled (S-3b — the migration is COMPLETE)',
    (p) => {
      /* S-3b flipped these. This is what let ProductShell, ProductHeader, the
         two-bar nav, WorkspaceTopBar and WorkspaceTabs be deleted — if any of
         these reads false again, that chrome is gone and the surface would
         render with NO navigation at all. */
      expect(isShelledPath(p)).toBe(true);
    },
  );

  it('S-3b — the tourless product landings are shelled (greyed bar + workspace rail)', () => {
    for (const p of ['/operations', '/budget', '/advance']) {
      expect(isShelledPath(p)).toBe(true);
      expect(resolveScope(p).scope).toBe('workspace');
    }
  });

  it('S-3b — the standalone rider editor is shelled at artist scope', () => {
    expect(isShelledPath('/rider-packs/pack-1')).toBe(true);
  });

  it('never claims a public or auth route, whatever its shape', () => {
    // These have their own chrome by design; wrapping one would be a real bug.
    for (const p of ['/login', '/m/today', '/share/abc', '/intake/xyz', '/grid-demo']) {
      expect(isShelledPath(p)).toBe(false);
    }
  });

  it('the budget ?tab= shapes agree with the plain path — the tab is not a scope', () => {
    for (const tab of ['summary', 'budget', 'income', 'receipts', 'settings']) {
      expect(isShelledPath(`/budget/${T}`, `?tab=${tab}`)).toBe(isShelledPath(`/budget/${T}`));
    }
  });
});

describe('hasOwnRail — where the app rail should start collapsed', () => {
  it('ROUTING DOES NOT HAVE ONE', () => {
    /* S-1 collapsed the rail on Routing on the assumption that the routing page
       owned the day rail. It doesn't. Caught on the first walk; this is the
       assertion that stops it coming back. */
    expect(hasOwnRail(`/operations/${T}/routing`)).toBe(false);
  });

  it('NOR DOES ROOMING — same mistake, one bank later', () => {
    /* Rooming has three views and only Cards renders a day rail. The view is
       component state defaulting to MATRIX, so collapsing here was wrong on
       every arrival, not on two views out of three.

       The fix is per-path granularity rather than a view-aware shell: chrome
       that waits for a client component to say which view is showing is chrome
       back on ambient state, which is the dependency S-1 removed. */
    expect(hasOwnRail(`/operations/${T}/rooming`)).toBe(false);
  });

  it.each([
    `/operations/${T}/day/r-1`,     // DayLayout → DayRail
    `/advance/${T}/r-1`,            // AdvanceUpcomingSidebar
    `/operations/${T}/riders/p-1`,  // RiderPackEditorView → RiderPackSidebar, 280px
    '/rider-packs/p-1',             // S-3b — the STANDALONE editor, same sidebar
  ])('%s carries one, unconditionally — no view can turn it off', (p) => {
    expect(hasOwnRail(p)).toBe(true);
  });

  it.each([
    `/operations/${T}/day`,      // the day INDEX has no rail — the per-day page does
    `/advance/${T}`,             // tour-level advance overview, no rail
    `/operations/${T}/riders`,   // the pack LIST, likewise
    `/operations/${T}/personnel`,
    `/operations/${T}/files`,
    `/operations/${T}/channel-list`,
    `/operations/${T}/stage-plot`,
    `/operations/${T}/hire`,
    `/budget/${T}`,
  ])('%s does not', (p) => {
    expect(hasOwnRail(p)).toBe(false);
  });
});

describe('a rail with nothing lit reads as broken', () => {
  it('Labor calls lights Day sheets, its parent', () => {
    /* It has no rail item by design — IA_CANONICAL reaches it from Day sheets →
       Schedule. But "no item of its own" and "nothing highlighted at all" look
       very different to someone using the thing. */
    expect(activeItemFor(`/operations/${T}/labor`)).toBe('day-sheets');
    expect(activeItemFor(`/operations/${T}/labor/call-1`)).toBe('day-sheets');
  });

  it('and Day sheets itself is unaffected', () => {
    expect(activeItemFor(`/operations/${T}/day`)).toBe('day-sheets');
    expect(activeItemFor(`/operations/${T}/day/r-1`)).toBe('day-sheets');
  });
});

/* ============================================
   S-2b — the Receipts badge survives the move

   The count of receipts still needing fields lived on the budget tab band. The
   band's tabs stand down on the canonical shell (the rail carries them), so the
   number had to move rather than quietly stop existing — it is the one figure
   on that bar anybody acts on.
   ============================================ */

describe('badges count work, so zero is not a badge', () => {
  const money = { scope: 'tour' as const, artistId: null, tourId: T, mode: 'money' as const };
  const receiptsBadge = (badges: Record<string, string | number | null | undefined>) => {
    const view = resolveRailView(money, `/budget/${T}`, '?tab=budget', badges);
    const r = view.find((e) => e.kind === 'item' && e.id === 'receipts');
    return r && r.kind === 'item' ? r.badge : undefined;
  };

  it('a real count shows', () => {
    expect(receiptsBadge({ receiptsNeedingDetails: 3 })).toBe('3');
  });

  it('zero shows NOTHING — an item with no work wants no number beside it', () => {
    expect(receiptsBadge({ receiptsNeedingDetails: 0 })).toBeNull();
    expect(receiptsBadge({ receiptsNeedingDetails: '0' })).toBeNull();
  });

  it('absent, null and empty are all no badge', () => {
    expect(receiptsBadge({})).toBeNull();
    expect(receiptsBadge({ receiptsNeedingDetails: null })).toBeNull();
    expect(receiptsBadge({ receiptsNeedingDetails: '' })).toBeNull();
  });

  it('the rule is general, not a receipts special case', () => {
    const view = resolveRailView(money, `/budget/${T}`, '?tab=budget', { lines: 0, unsettled: 0 });
    for (const id of ['expenses', 'settlements']) {
      const item = view.find((e) => e.kind === 'item' && e.id === id);
      expect(item && item.kind === 'item' ? item.badge : 'x').toBeNull();
    }
  });
});

/* ============================================
   S-2d — GREYED MEANS ONE THING

   A disabled rail item is a promise: "this doesn't exist yet." Patch broke that
   promise — it is built and shipped as a MODE of Channel list (the PATCH toggle
   swaps in <PatchMatrix>), with no route of its own and none planned. Greying
   it told the user working software was missing.

   This pins the whole set rather than the one case, so adding a grey item is a
   deliberate act with a test to update, not a shrug.
   ============================================ */

describe('the disabled items are exactly the unbuilt ones', () => {
  const greyed = (scope: Parameters<typeof itemsFor>[0], mode: Parameters<typeof itemsFor>[1]) =>
    itemsFor(scope, mode).filter((i) => !i.href).map((i) => i.id).sort();

  it('Patch is NOT in the rail — it is a mode of Channel list', () => {
    expect(itemsFor('tour', 'production').some((i) => i.id === 'patch')).toBe(false);
  });

  it.each([
    ['tour', 'tour', ['travel']],
    ['tour', 'money', ['per-diems']],
    ['tour', 'production', ['manifests', 'movements', 'spaces', 'templates']],
    ['artist', null, ['brand', 'contacts', 'people', 'year-budget']],
    ['workspace', null, []],
    ['you', null, ['billing']],
  ] as const)('%s/%s greys exactly %j', (scope, mode, expected) => {
    expect(greyed(scope, mode)).toEqual([...expected]);
  });

  it('every OTHER item resolves to a real href', () => {
    const ctx = { scope: 'tour' as const, artistId: A, tourId: T, mode: 'production' as const };
    for (const item of itemsFor('tour', 'production')) {
      if (!item.href) continue;
      expect(item.href(ctx).startsWith('/')).toBe(true);
    }
  });
});

/* ============================================
   S-3a — the artist rail against the routes that actually exist

   IA_CANONICAL was transcribed in S-1 from the document, before any of these
   routes had been checked against the filesystem. Two items did not survive
   the check.
   ============================================ */

describe('S-3a — the artist rail describes real pages', () => {
  const ctx = { scope: 'artist' as const, artistId: A, tourId: null, mode: null };

  it('TOURS is not a second item — the landing IS the tour list', () => {
    /* IA_CANONICAL lists Overview and Tours separately. There is one page:
       /artists/[id] renders the hero + the tours list, with Production and a
       locked Business as hero tabs. Two rail items on one URL means one can
       never light — the Patch mistake in another costume. */
    expect(itemsFor('artist', null).some((i) => i.id === 'tours')).toBe(false);
    expect(activeItemFor(`/artists/${A}`)).toBe('overview');
  });

  it('every artist item points at a route that exists', () => {
    // Checked by hand against src/app/(app)/artists/[id]/ on this commit.
    const real = new Set([
      `/artists/${A}`,
      `/artists/${A}/riders`,
      `/artists/${A}/files`,
    ]);
    for (const item of itemsFor('artist', null)) {
      if (!item.href) continue;
      expect(real.has(item.href(ctx).split('?')[0])).toBe(true);
    }
  });

  it.each([
    [`/artists/${A}/edit`, 'overview'],
    [`/artists/${A}/production`, 'overview'],
    [`/artists/${A}/riders`, 'riders-specs'],
    [`/artists/${A}/channel-lists`, 'riders-specs'],
    [`/artists/${A}/stage-plots/p1`, 'riders-specs'],
    ['/rider-packs/p-1', 'riders-specs'], // S-3b — the standalone editor too
    [`/artists/${A}/files`, 'documents'],
  ])('%s lights %s — nothing in the subtree leaves the rail blank', (p, expected) => {
    expect(activeItemFor(p)).toBe(expected);
  });

  it('the mode pill stays away — Money and Production are properties of a TOUR', () => {
    expect(resolveScope(`/artists/${A}/riders`).mode).toBeNull();
  });

  it('the way up from an artist is the workspace', () => {
    expect(upFrom(ctx)?.href).toBe('/artists');
  });
});

/* ============================================
   P-1 — THE RAIL'S ACCESS FILTER

   These prove the resolver agrees with the config. They do NOT prove the
   allow-list matches what the server enforces — only a real restricted account
   can do that, which is why P-1's acceptance test is a live walk and not this
   file. Adam's point, and it's the right one: a unit test here would only ever
   prove the allow-list agrees with itself.

   What they DO cover is the class of mistake a live walk is bad at catching:
   a gated item whose resource id isn't in the catalogue would be invisible to
   every readonly member forever, and would look on a walk exactly like a
   permission that simply hadn't been granted.
   ============================================ */

import { allRailResources } from './ia';
import { RESOURCE_CATALOG } from '@/lib/permissions/resources';

describe('P-1 — every gated rail item names a REAL resource', () => {
  it('no rail item invents a resource id', () => {
    const catalogue = new Set(RESOURCE_CATALOG.map((r) => r.id));
    const unknown = allRailResources().filter((id) => !catalogue.has(id));
    expect(unknown).toEqual([]);
  });

  it('the resource set is non-empty and covers all three tour modes', () => {
    // A silently-empty set would make the filter a no-op and look like it works.
    for (const mode of TOUR_MODES) {
      expect(itemsFor('tour', mode).some((i) => i.resource)).toBe(true);
    }
  });

  it('no DISABLED item is gated — hiding a thing that does nothing is noise', () => {
    for (const mode of TOUR_MODES) {
      for (const item of itemsFor('tour', mode)) {
        if (!item.href) expect(item.resource).toBeUndefined();
      }
    }
  });
});

describe('P-1 — resolveRailView filters by the allow-list', () => {
  const money = { scope: 'tour' as const, artistId: null, tourId: T, mode: 'money' as const };
  const ids = (view: ReturnType<typeof resolveRailView>) =>
    view.filter((e) => e.kind === 'item').map((e) => (e.kind === 'item' ? e.id : ''));

  it('omitting the list shows everything — the pre-P-1 behaviour', () => {
    expect(ids(resolveRailView(money, `/budget/${T}`))).toContain('payroll');
  });

  it('THE ACCEPTANCE SHAPE: no operations.payroll grant → no Payroll item', () => {
    const allowed = allRailResources().filter((r) => r !== 'operations.payroll');
    expect(ids(resolveRailView(money, `/budget/${T}`, '', {}, allowed))).not.toContain('payroll');
  });

  it('and the rest of Money survives that removal', () => {
    const allowed = allRailResources().filter((r) => r !== 'operations.payroll');
    const shown = ids(resolveRailView(money, `/budget/${T}`, '', {}, allowed));
    expect(shown).toEqual(expect.arrayContaining(['summary', 'expenses', 'settlements']));
  });

  it('ungated items survive an EMPTY allow-list — absent means ungated', () => {
    /* Settlements, Income and Per diems have no catalogue entry. If an empty
       list hid them, the filter would be denying by default, which is a
       different and much worse policy than the one intended. */
    const shown = ids(resolveRailView(money, `/budget/${T}`, '', {}, []));
    expect(shown).toEqual(expect.arrayContaining(['income', 'settlements', 'per-diems']));
    expect(shown).not.toContain('payroll');
  });

  it('a heading left with no items under it is dropped', () => {
    /* "Plan" holds Summary / Expenses / Income. Income is ungated so the group
       survives here; the PRODUCTION rail's "Paper" group is the empty-able one
       once its two disabled items are the only members. Asserted structurally:
       no view may end with a group, and no two groups may be adjacent. */
    const view = resolveRailView(money, `/budget/${T}`, '', {}, []);
    expect(view[view.length - 1].kind).toBe('item');
    for (let i = 0; i < view.length - 1; i++) {
      if (view[i].kind === 'group') expect(view[i + 1].kind).toBe('item');
    }
  });

  it('the filtered view still survives an RSC boundary', () => {
    const allowed = allRailResources().filter((r) => r !== 'operations.payroll');
    expect(railViewIsSerialisable(resolveRailView(money, `/budget/${T}`, '', {}, allowed))).toBe(true);
  });
});

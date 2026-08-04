/* ============================================
   LOWPASS — the information architecture, as data (S-1)

   ONE module. Scopes, tour modes, rail groups, items, hrefs, badge keys, and the
   pure resolvers that turn a URL into "where am I". Transcribed from
   docs/design/IA_CANONICAL_2026-07-21.md and the clickable mock beside it.

   WHY IT IS A MODULE AND NOT MARKUP: S-2..S-5 migrate the whole app onto this
   shell. If nav strings live in components, that migration is forty edits and a
   guess; if they live here, it is a mount. Every href, label and matcher is in
   this file precisely once — no component builds a nav URL by hand.

   THE HARD REQUIREMENT is deep-link correctness. Landing cold on any URL must
   derive scope, mode and active item FROM THE PATHNAME, never from ambient
   client state. That is the P0-context lesson: a shell that depends on "which
   tour did you last click" shows the wrong thing to anyone who follows a link,
   and shows nothing at all on a hard refresh. Every resolver here is pure and
   takes the URL — there is no store to consult and nothing to hydrate.

   Budget's sub-pages are the one exception to "pathname alone": Summary /
   Expenses / Income are ?tab= on a single route, so the money resolvers also
   read the query string. That is a property of the existing routes, not of the
   shell, and it is confined to this file.
   ============================================ */

/** The four scopes. The mode pill exists ONLY at tour scope. */
export type Scope = 'workspace' | 'artist' | 'tour' | 'you';

/** The three tour modes. Confirmed by Adam: Tour · Money · Production. */
export type TourMode = 'tour' | 'money' | 'production';

export const TOUR_MODES: readonly TourMode[] = ['tour', 'money', 'production'];

export const MODE_LABEL: Record<TourMode, string> = {
  tour: 'Tour',
  money: 'Money',
  production: 'Production',
};

export const SCOPE_LABEL: Record<Scope, string> = {
  workspace: 'Workspace',
  artist: 'Artist',
  tour: 'Tour',
  you: 'You',
};

/** A rail entry: either a group heading or a navigable item. */
export interface RailItem {
  kind: 'item';
  /** Stable id — what `activeItemFor` returns and what tests assert on. */
  id: string;
  label: string;
  /** lucide-react icon name; the rail maps it to a component. */
  icon: string;
  /** Built from the ids in context. Null = the page doesn't exist yet (S-5). */
  href: ((ctx: NavContext) => string) | null;
  /** Which count to show, if the host supplies one. */
  badge?: string;
  /** Extra pathname prefixes that should light this item up. */
  match?: (pathname: string, search: string) => boolean;
  /**
   * The permission resource this item's page is gated by (P-1).
   *
   * An id from RESOURCE_CATALOG — NOT a free invention. A resource id that
   * isn't in the catalogue can never be granted through the members UI, so an
   * item gated on one would be invisible to every readonly member forever, with
   * nothing anyone could do about it. A test cross-checks every id here against
   * the catalogue for exactly that reason.
   *
   * ABSENT MEANS UNGATED, deliberately. The catalogue has no entry for Day
   * sheets, Income, Settlements, Assets or most of the artist library, and
   * inventing ids to close that gap would be inventing a permission model. An
   * item with no resource shows to everyone, which is what happens today.
   */
  resource?: string;
}

export interface RailGroup {
  kind: 'group';
  label: string;
}

export type RailEntry = RailGroup | RailItem;

/** What the resolvers extract from a URL, and what hrefs are built from. */
export interface NavContext {
  scope: Scope;
  /** Present at artist and tour scope. */
  artistId: string | null;
  /** Present at tour scope. */
  tourId: string | null;
  mode: TourMode | null;
}

const g = (label: string): RailGroup => ({ kind: 'group', label });

/* ── TOUR scope ───────────────────────────────────────────────────────────── */

const TOUR_RAIL: RailEntry[] = [
  g('The run'),
  {
    kind: 'item', id: 'routing', label: 'Routing', icon: 'Rows3', badge: 'days', resource: 'operations.routing',
    href: (c) => `/operations/${c.tourId}/routing`,
  },
  {
    kind: 'item', id: 'day-sheets', label: 'Day sheets', icon: 'CalendarDays',
    href: (c) => `/operations/${c.tourId}/day`,
    /* IA_CANONICAL writes this as "/operations/[tourId]/day · /day/[routingId]",
       which reads as a top-level /day route. There isn't one — the per-day page
       is /operations/[tourId]/day/[routingId], nested. Worth knowing before S-2
       plans around a path that does not exist.

       LABOR CALLS LIGHTS THIS TOO. It has no rail item by design — IA_CANONICAL
       reaches it from Day sheets → Schedule — but "no rail item" and "nothing
       highlighted" are different things to look at. A rail with nothing lit
       reads as broken, so it lights its PARENT, which is where you came from
       and where you'd go back to. */
    match: (p) => /^\/operations\/[^/]+\/(day|labor)(\/|$)/.test(p),
  },
  {
    kind: 'item', id: 'advance', label: 'Advance', icon: 'Send', badge: 'advanced', resource: 'advance',
    href: (c) => `/advance/${c.tourId}`,
    match: (p) => p.startsWith('/advance/'),
  },
  g('People & logistics'),
  { kind: 'item', id: 'crew', label: 'Crew', icon: 'Users', resource: 'operations.personnel', href: (c) => `/operations/${c.tourId}/personnel` },
  { kind: 'item', id: 'rooming', label: 'Rooming', icon: 'BedDouble', resource: 'operations.rooming', href: (c) => `/operations/${c.tourId}/rooming` },
  /* Travel has no page yet — IA_CANONICAL S-5 calls it out as a missing PAGE,
     not missing nav. A null href renders it disabled rather than hiding it, so
     the gap is visible instead of forgotten. */
  { kind: 'item', id: 'travel', label: 'Travel', icon: 'Plane', href: null },
  { kind: 'item', id: 'files', label: 'Files', icon: 'FolderOpen', resource: 'operations.files', href: (c) => `/operations/${c.tourId}/files` },
];

/* ── MONEY scope ──────────────────────────────────────────────────────────── */

/** Budget's tabs are query params, so money items match on ?tab= as well. */
const budgetTab = (tab: string) => (p: string, s: string) => {
  if (!/^\/budget\/[^/]+\/?$/.test(p)) return false;
  const active = new URLSearchParams(s).get('tab') ?? 'budget';
  return active === tab;
};

const MONEY_RAIL: RailEntry[] = [
  g('Plan'),
  {
    kind: 'item', id: 'summary', label: 'Summary', icon: 'LayoutDashboard', resource: 'budget.summary',
    href: (c) => `/budget/${c.tourId}?tab=summary`, match: budgetTab('summary'),
  },
  {
    kind: 'item', id: 'expenses', label: 'Expenses', icon: 'Table2', badge: 'lines', resource: 'budget.line_items',
    // 'budget' is the stored tab id for Expenses (budget-tab-utils).
    href: (c) => `/budget/${c.tourId}?tab=budget`, match: budgetTab('budget'),
  },
  {
    kind: 'item', id: 'income', label: 'Income', icon: 'TrendingUp',
    href: (c) => `/budget/${c.tourId}?tab=income`, match: budgetTab('income'),
  },
  g('Settle & pay'),
  {
    kind: 'item', id: 'settlements', label: 'Settlements', icon: 'Scale', badge: 'unsettled',
    href: (c) => `/budget/${c.tourId}/settlement`,
  },
  /* Payroll MOVES here from Operations — it's pay, not ops (IA_CANONICAL). The
     route still lives under /operations; the rail is what changed, not the URL. */
  { kind: 'item', id: 'payroll', label: 'Payroll', icon: 'Users', resource: 'operations.payroll', href: (c) => `/operations/${c.tourId}/payroll` },
  { kind: 'item', id: 'per-diems', label: 'Per diems', icon: 'Coins', href: null },
  {
    kind: 'item', id: 'receipts', label: 'Receipts', icon: 'ReceiptText', badge: 'receiptsNeedingDetails', resource: 'budget.receipts',
    href: (c) => `/budget/${c.tourId}?tab=receipts`, match: budgetTab('receipts'),
  },
  g('Out'),
  {
    kind: 'item', id: 'reports', label: 'Reports & workbook', icon: 'FileSpreadsheet',
    href: (c) => `/budget/${c.tourId}?tab=settings`, match: budgetTab('settings'),
  },
];

/* ── PRODUCTION scope ─────────────────────────────────────────────────────── */

const PRODUCTION_RAIL: RailEntry[] = [
  g('Inventory'),
  { kind: 'item', id: 'assets', label: 'Assets', icon: 'Package', badge: 'gear', href: (c) => `/operations/${c.tourId}/hire` },
  { kind: 'item', id: 'spaces', label: 'Spaces & cases', icon: 'Boxes', href: null },
  { kind: 'item', id: 'movements', label: 'Movements', icon: 'ArrowLeftRight', href: null },
  g('The show'),
  /* PATCH IS NOT A SURFACE. IA_CANONICAL lists it as a rail item, but it is
     built and shipped as a MODE of Channel list — the PATCH toggle swaps
     <PatchMatrix> in for the input grid. There is no /patch route and never
     was, so a greyed "Patch — no page yet" was a lie about working software.
     Dropped so that greyed means one thing only: not built yet. */
  { kind: 'item', id: 'channel-list', label: 'Channel list', icon: 'ListOrdered', resource: 'operations.channel_list', href: (c) => `/operations/${c.tourId}/channel-list` },
  { kind: 'item', id: 'stage-plot', label: 'Stage plot', icon: 'Shapes', resource: 'operations.stage_plot', href: (c) => `/operations/${c.tourId}/stage-plot` },
  {
    kind: 'item', id: 'riders', label: 'Riders', icon: 'FileText', resource: 'operations.riders',
    href: (c) => `/operations/${c.tourId}/riders`,
    match: (p) => /^\/operations\/[^/]+\/riders(\/|$)/.test(p),
  },
  g('Paper'),
  { kind: 'item', id: 'manifests', label: 'Manifests & carnet', icon: 'ClipboardList', href: null },
  { kind: 'item', id: 'templates', label: 'Templates', icon: 'LayoutTemplate', href: null },
];

/* ── ARTIST scope ─────────────────────────────────────────────────────────── */

const ARTIST_RAIL: RailEntry[] = [
  g('Artist'),
  {
    kind: 'item', id: 'overview', label: 'Overview', icon: 'LayoutDashboard', resource: 'artist.home',
    href: (c) => `/artists/${c.artistId}`,
    /* Also claims Edit and the Production hub. Neither has a rail item of its
       own; both are reached from the landing, and a rail showing nothing lit
       reads as broken. Same call as labor → Day sheets.

       S-4b dropped `financials` from this list along with the route — it was an
       unlinked stub with no model behind it. A matcher for a page that no
       longer exists is dead config that reads as intent. */
    match: (p) =>
      /^\/artists\/[^/]+\/?$/.test(p) ||
      /^\/artists\/[^/]+\/(edit|production)(\/|$)/.test(p),
  },
  /* S-3a — IA_CANONICAL lists TOURS as a second item here. There is no second
     page: /artists/[id] IS the tour list (hero + tours, with Production and a
     locked Business as hero tabs). Two rail items on one URL means one of them
     can never light, which is the Patch mistake in another costume. Dropped;
     Overview is the landing, and the landing is the tours list. */
  g('Across tours'),
  { kind: 'item', id: 'year-budget', label: 'Year budget', icon: 'CircleDollarSign', href: null },
  { kind: 'item', id: 'people', label: 'People', icon: 'Users', href: null },
  g('Library'),
  {
    kind: 'item', id: 'riders-specs', label: 'Riders & specs', icon: 'FileText',
    href: (c) => `/artists/${c.artistId}/riders`,
    // Channel lists and stage plots are grouped under this item (IA_CANONICAL).
    /* S-3b — /rider-packs/[id] lights this too. The standalone rider editor is
       reached FROM the artist library riders list, and Adam's call was that it
       belongs to the artist library, not to a workspace no-man's-land. The URL
       carries no artist id; the pack's own artist_id is supplied server-side by
       the mounting view (same pattern as tour scope, where the artist comes
       from data, not the path). */
    match: (p) =>
      /^\/artists\/[^/]+\/(riders|channel-lists|stage-plots)(\/|$)/.test(p) ||
      /^\/rider-packs(\/|$)/.test(p),
  },
  { kind: 'item', id: 'brand', label: 'Brand & logos', icon: 'Shapes', href: null },
  { kind: 'item', id: 'documents', label: 'Documents', icon: 'FolderOpen', href: (c) => `/artists/${c.artistId}/files` },
  { kind: 'item', id: 'contacts', label: 'Contacts', icon: 'Contact', href: null },
];

/* ── WORKSPACE scope ──────────────────────────────────────────────────────── */

const WORKSPACE_RAIL: RailEntry[] = [
  g('Workspace'),
  { kind: 'item', id: 'artists', label: 'Artists', icon: 'Music2', badge: 'artists', href: () => '/artists' },
  { kind: 'item', id: 'personnel', label: 'Personnel pool', icon: 'Users', href: () => '/personnel' },
  {
    kind: 'item', id: 'equipment', label: 'Equipment & rentals', icon: 'Package',
    href: () => '/assets',
    // /equipment survives until S-3 picks a winner; both light this item.
    match: (p) => p.startsWith('/assets') || p.startsWith('/equipment'),
  },
  { kind: 'item', id: 'venues', label: 'Venues', icon: 'MapPin', href: () => '/venues' },
];

/* ── YOU scope ────────────────────────────────────────────────────────────── */

const YOU_RAIL: RailEntry[] = [
  g('You'),
  {
    kind: 'item', id: 'account', label: 'Account', icon: 'CircleUser', href: () => '/profile',
    match: (p) => p.startsWith('/profile') || p.startsWith('/account'),
  },
  {
    kind: 'item', id: 'preferences', label: 'Preferences', icon: 'Settings', href: () => '/settings',
    match: (p) => /^\/settings\/?$/.test(p) || p.startsWith('/settings/ai-limits'),
  },
  { kind: 'item', id: 'team', label: 'Team & roles', icon: 'Users', href: () => '/settings/members' },
  { kind: 'item', id: 'billing', label: 'Billing', icon: 'CreditCard', href: null },
  { kind: 'item', id: 'bugs', label: 'Report a bug', icon: 'Flag', href: () => '/bugs' },
];

/* ── Resolvers ────────────────────────────────────────────────────────────── */

/** Routes that keep their own chrome — never wrapped in the app shell. */
const UNSHELLED = [
  '/login', '/signup', '/invite/', '/r/', '/a/', '/intake/', '/advance-intake/',
  '/m/', '/share/', '/rental/print-labels', '/admin/',
  // Dev harnesses stay outside the shell (IA_CANONICAL "Delete" §6).
  '/grid-demo', '/stage-plot-icon', '/stage-plot-icons', '/tour-fingerprint-demo',
];

export function isUnshelledPath(pathname: string): boolean {
  return UNSHELLED.some((p) => pathname === p.replace(/\/$/, '') || pathname.startsWith(p));
}

/** Tour-scoped route prefixes and where the tour id sits in the path. */
const TOUR_PREFIXES = ['/operations/', '/budget/', '/advance/'];

/**
 * Scope + ids + mode, from the URL alone.
 *
 * Order matters: tour prefixes are checked before /artists, because a tour URL
 * never contains an artist id — the artist is looked up server-side from the
 * tour and passed in as data, not parsed out of the path.
 */
export function resolveScope(pathname: string, search = ''): NavContext {
  const p = pathname || '/';

  for (const prefix of TOUR_PREFIXES) {
    if (p.startsWith(prefix)) {
      const tourId = p.slice(prefix.length).split('/')[0] || null;
      if (tourId) {
        return { scope: 'tour', artistId: null, tourId, mode: modeForPath(p, search) };
      }
    }
  }

  const artist = /^\/artists\/([^/?#]+)/.exec(p);
  if (artist) {
    return { scope: 'artist', artistId: artist[1], tourId: null, mode: null };
  }

  /* S-3b — the standalone rider editor is ARTIST scope with the id supplied by
     server data (rider_packs.artist_id, or the tour's artist for tour-scoped
     packs), exactly as tour URLs carry no artist id either. artistId stays null
     here because a pure-URL resolver cannot know it; AppShellV3 merges the
     caller-supplied id before building hrefs. */
  if (p === '/rider-packs' || p.startsWith('/rider-packs/')) {
    return { scope: 'artist', artistId: null, tourId: null, mode: null };
  }

  if (YOU_PATHS.some((y) => p === y || p.startsWith(`${y}/`))) {
    return { scope: 'you', artistId: null, tourId: null, mode: null };
  }

  return { scope: 'workspace', artistId: null, tourId: null, mode: null };
}

const YOU_PATHS = ['/settings', '/profile', '/account', '/bugs'];

/**
 * Which mode a tour URL belongs to. Null when the path isn't tour-scoped.
 *
 * Payroll is the interesting one: it lives under /operations but belongs to
 * MONEY, because the rail is organised by what a thing IS, not by which route
 * folder history put it in.
 */
export function modeForPath(pathname: string, search = ''): TourMode | null {
  const p = pathname || '/';
  if (!TOUR_PREFIXES.some((prefix) => p.startsWith(prefix))) return null;

  if (p.startsWith('/budget/')) return 'money';
  if (p.startsWith('/advance/')) return 'tour';

  if (p.startsWith('/operations/')) {
    const rest = p.split('/').slice(3).join('/'); // after /operations/[tourId]/
    const head = rest.split('?')[0].split('/')[0];
    if (head === 'payroll') return 'money';
    if (PRODUCTION_SEGMENTS.has(head)) return 'production';
    return 'tour';
  }
  void search;
  return 'tour';
}

const PRODUCTION_SEGMENTS = new Set([
  'hire', 'channel-list', 'stage-plot', 'riders',
]);

/** The rail for a scope (and, at tour scope, a mode). */
export function railFor(scope: Scope, mode: TourMode | null): RailEntry[] {
  if (scope === 'tour') {
    if (mode === 'money') return MONEY_RAIL;
    if (mode === 'production') return PRODUCTION_RAIL;
    return TOUR_RAIL;
  }
  if (scope === 'artist') return ARTIST_RAIL;
  if (scope === 'you') return YOU_RAIL;
  return WORKSPACE_RAIL;
}

/** Just the navigable items, for iteration and tests. */
export function itemsFor(scope: Scope, mode: TourMode | null): RailItem[] {
  return railFor(scope, mode).filter((e): e is RailItem => e.kind === 'item');
}

/**
 * Which rail item is active for a URL.
 *
 * An item matches by its own `match` when it has one, else by its href's
 * pathname being a prefix of the current one. Returns null when nothing
 * matches — the rail then highlights nothing, which is honest. Highlighting a
 * guess is how a nav quietly lies about where you are.
 */
export function activeItemFor(pathname: string, search = ''): string | null {
  const ctx = resolveScope(pathname, search);
  const items = itemsFor(ctx.scope, ctx.mode);

  for (const item of items) {
    if (item.match?.(pathname, search)) return item.id;
  }

  // Longest href-prefix wins, so /budget/x/settlement beats /budget/x.
  let best: { id: string; len: number } | null = null;
  for (const item of items) {
    if (!item.href) continue;
    const href = item.href(ctx).split('?')[0];
    if (href.length <= 1) continue;
    if (pathname === href || pathname.startsWith(`${href}/`)) {
      if (!best || href.length > best.len) best = { id: item.id, len: href.length };
    }
  }
  return best?.id ?? null;
}

/** Where a mode pill click should land — the mode's first navigable item. */
export function modeLandingHref(mode: TourMode, tourId: string): string {
  const ctx: NavContext = { scope: 'tour', artistId: null, tourId, mode };
  const first = itemsFor('tour', mode).find((i) => i.href);
  return first?.href ? first.href(ctx) : `/operations/${tourId}/routing`;
}

/* ============================================
   THE MIGRATION BOUNDARY (S-2)

   S-1 was proven on Routing alone; S-2..S-5 move the rest of the app across one
   bank at a time. Which surfaces have crossed is a FACT ABOUT THE APP, so it
   lives here as data rather than as a regex growing inside each layout. Three
   things follow from that: a bank is a one-line edit, a bank is revertible by
   the same one line, and "what is migrated" is testable without rendering
   anything.

   The failure mode this guards against is a half-migrated app where nobody can
   say which half.
   ============================================ */

/** Tour-scope modes on the canonical shell. S-2a: Tour. S-2b: Money.
 *  S-2c: Production — which completes tour scope. Every tour-scoped URL is now
 *  shelled, so the ProductShell branches in the three tour layouts are dead;
 *  S-2d removes them. Artist is S-3a, workspace and You S-3b. */
const SHELLED_TOUR_MODES = new Set<TourMode>(['tour', 'money', 'production']);

/** Non-tour scopes on the canonical shell. S-3a: artist. S-3b: workspace and
 *  You — which completes the migration. Every authenticated URL that is not
 *  deliberately UNSHELLED (admin, mobile, share/intake, dev harnesses) now
 *  renders <AppShellV3>. This is what let shell-v2's chrome be deleted. */
const SHELLED_SCOPES = new Set<Scope>(['artist', 'workspace', 'you']);

/** True when this URL should render inside <AppShellV3> rather than old chrome. */
export function isShelledPath(pathname: string, search = ''): boolean {
  if (isUnshelledPath(pathname)) return false;
  const ctx = resolveScope(pathname, search);
  if (ctx.scope === 'tour') return !!ctx.mode && SHELLED_TOUR_MODES.has(ctx.mode);
  return SHELLED_SCOPES.has(ctx.scope);
}

/**
 * Pages that render a LEFT RAIL OF THEIR OWN, and so shouldn't have to share
 * the width with a full-width app rail. Where one is present the app rail
 * starts collapsed: the app rail is a glance ("where am I"), the page's rail is
 * a surface you work in, and the one you work in shouldn't be the one that
 * shrinks.
 *
 * Three, and each renders its rail UNCONDITIONALLY — that qualifier is the
 * whole lesson of this function:
 *   · the per-day page              → DayLayout → DayRail
 *   · the per-show Advance surface  → AdvanceUpcomingSidebar
 *   · the rider pack editor         → RiderPackSidebar (280px)
 *
 * NOT ROUTING. S-1 collapsed it there on my assumption that the routing page
 * owned the day rail; it doesn't.
 *
 * NOT ROOMING EITHER — the same mistake one bank later. Rooming has three views
 * and only **Cards** renders a rail. The view is component state defaulting to
 * **Matrix**, so every arrival was an icon-only rail beside nothing at all:
 * wrong on 100% of cold loads, not on two views out of three.
 *
 * Rooming is also why this takes a pathname and nothing else. Making the shell
 * wait for a client component to report which view is showing would put chrome
 * back on ambient state — the exact dependency S-1 exists to remove. Moving the
 * view into the query would keep that rule but cost a server round-trip on
 * every toggle, which is a bad trade for an instant segmented control. So
 * Rooming stays expanded, and in Cards the collapse control is one click and
 * persists.
 *
 * It was called `hasOwnRail` until the rider editor joined: not every competing
 * rail is a day rail, and a name that says otherwise is how the next person
 * guesses instead of checking.
 */
export function hasOwnRail(pathname: string): boolean {
  return (
    /^\/operations\/[^/]+\/day\/[^/]+/.test(pathname) ||
    /^\/operations\/[^/]+\/riders\/[^/]+/.test(pathname) ||
    /^\/advance\/[^/]+\/[^/]+/.test(pathname) ||
    /* S-3b — the STANDALONE rider editor renders the same RiderPackSidebar the
       tour-scoped one does (280px, unconditional whenever the pack has a
       context id). Same component, same collapse rule. */
    /^\/rider-packs\/[^/]+/.test(pathname)
  );
}

/**
 * Which of the three product route trees a tour URL sits in.
 *
 * Not the same question as `modeForPath` — Payroll is Money mode but lives in
 * the Operations tree, and the "open this tour where I left it" memory keys on
 * the TREE, because that's what a URL is made of. Null when not tour-scoped.
 */
export function productForPath(pathname: string): 'operations' | 'budget' | 'advance' | null {
  if (pathname.startsWith('/budget/')) return 'budget';
  if (pathname.startsWith('/advance/')) return 'advance';
  if (pathname.startsWith('/operations/')) return 'operations';
  return null;
}

/** The "up a level" target, mirroring the mock's ↑ link. */
export function upFrom(ctx: NavContext): { label: string; href: string } | null {
  if (ctx.scope === 'tour') {
    return ctx.artistId
      ? { label: 'Artist', href: `/artists/${ctx.artistId}` }
      : { label: 'Workspace', href: '/artists' };
  }
  if (ctx.scope === 'artist') return { label: 'Workspace', href: '/artists' };
  return null;
}

/* ============================================
   THE SERIALISATION BOUNDARY (S-1 fix)

   `railFor()` returns config objects whose `href` and `match` are FUNCTIONS.
   That is right for a config module and fatal at an RSC boundary: a server
   component cannot pass a function to a client component, and React throws
   during the server render — "Functions cannot be passed directly to Client
   Components".

   S-1 shipped exactly that and took the Routing page down. Nothing caught it:
   tsc, eslint and the build never see the boundary, and the jsdom tests render
   the server component as a plain function call, so no boundary exists there
   either.

   So the boundary is now explicit. `resolveRailView()` does ALL the function
   work on the server — calling hrefs, running matchers, reading badges — and
   returns plain data. Client components consume RailView, never RailEntry, and
   `railViewIsSerialisable()` lets a test assert that in a form that would have
   failed against the broken build.
   ============================================ */

/** A rail entry with everything resolved — plain data, safe across RSC. */
export type RailView =
  | { kind: 'group'; label: string }
  | {
      kind: 'item';
      id: string;
      label: string;
      icon: string;
      /** Already built. Null = no page yet, render disabled. */
      href: string | null;
      badge: string | null;
      active: boolean;
    };

/**
 * The rail, resolved for a URL — the ONLY shape that crosses to the client.
 */
export function resolveRailView(
  ctx: NavContext,
  pathname: string,
  search = '',
  badges: Record<string, string | number | null | undefined> = {},
  /**
   * P-1 — the resource ids this caller may READ, resolved server-side.
   *
   * `null` means "not supplied", and everything shows. That is the honest
   * default for a caller that hasn't done the permission work, and it keeps the
   * pre-P-1 behaviour rather than silently hiding the whole rail from anyone
   * whose layout forgets to pass it. Fail-open on a NAV is right; the pages and
   * RLS are what actually enforce access.
   */
  visibleResources: readonly string[] | null = null,
): RailView[] {
  const activeId = activeItemFor(pathname, search);
  const allowed = visibleResources === null ? null : new Set(visibleResources);

  const permitted = railFor(ctx.scope, ctx.mode).filter((entry) => {
    if (entry.kind === 'group') return true;
    // No resource → ungated → always visible. See RailItem.resource.
    if (!allowed || !entry.resource) return true;
    return allowed.has(entry.resource);
  });

  /* Drop headings the filter emptied. "Settle & pay" with nothing under it is a
     label for an absence — it tells a restricted member there is a section they
     can't see, which is the opposite of what hiding the items was for. */
  const kept = permitted.filter((entry, i) => {
    if (entry.kind !== 'group') return true;
    for (let j = i + 1; j < permitted.length; j++) {
      if (permitted[j].kind === 'group') break;
      return true; // at least one item follows before the next heading
    }
    return false;
  });

  return kept.map((entry) => {
    if (entry.kind === 'group') return { kind: 'group', label: entry.label };
    /* A ZERO IS NOT A BADGE. Every badge in this rail counts work — days,
       lines, unsettled shows, receipts needing fields — and "0" of any of them
       means there is nothing to look at. Rendering it puts a number next to an
       item that wants no attention, which is how a nav starts crying wolf. */
    const raw = entry.badge ? badges[entry.badge] : null;
    const badge = raw === 0 || raw === '0' ? null : raw;
    return {
      kind: 'item',
      id: entry.id,
      label: entry.label,
      icon: entry.icon,
      href: entry.href ? entry.href(ctx) : null,
      badge: badge == null || badge === '' ? null : String(badge),
      active: entry.id === activeId,
    };
  });
}

/**
 * Every resource id the rails reference, deduped — what a caller needs to run
 * `canAccess` over to build the allow-list. Derived from the config so a new
 * gated item is covered the moment it's added, with nothing to remember.
 */
export function allRailResources(): string[] {
  const out = new Set<string>();
  const rails: Array<[Scope, TourMode | null]> = [
    ['tour', 'tour'], ['tour', 'money'], ['tour', 'production'],
    ['artist', null], ['workspace', null], ['you', null],
  ];
  for (const [scope, mode] of rails) {
    for (const item of itemsFor(scope, mode)) if (item.resource) out.add(item.resource);
  }
  return [...out];
}

/**
 * True when every value in the view can cross an RSC boundary.
 * Exists so a test can assert the property that broke production.
 */
export function railViewIsSerialisable(view: RailView[]): boolean {
  try {
    return JSON.parse(JSON.stringify(view)).length === view.length
      && !view.some((e) => Object.values(e).some((v) => typeof v === 'function'));
  } catch {
    return false;
  }
}

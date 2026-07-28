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
    kind: 'item', id: 'routing', label: 'Routing', icon: 'Rows3', badge: 'days',
    href: (c) => `/operations/${c.tourId}/routing`,
  },
  {
    kind: 'item', id: 'day-sheets', label: 'Day sheets', icon: 'CalendarDays',
    href: (c) => `/operations/${c.tourId}/day`,
    /* IA_CANONICAL writes this as "/operations/[tourId]/day · /day/[routingId]",
       which reads as a top-level /day route. There isn't one — the per-day page
       is /operations/[tourId]/day/[routingId], nested. Worth knowing before S-2
       plans around a path that does not exist. */
    match: (p) => /^\/operations\/[^/]+\/day(\/|$)/.test(p),
  },
  {
    kind: 'item', id: 'advance', label: 'Advance', icon: 'Send', badge: 'advanced',
    href: (c) => `/advance/${c.tourId}`,
    match: (p) => p.startsWith('/advance/'),
  },
  g('People & logistics'),
  { kind: 'item', id: 'crew', label: 'Crew', icon: 'Users', href: (c) => `/operations/${c.tourId}/personnel` },
  { kind: 'item', id: 'rooming', label: 'Rooming', icon: 'BedDouble', href: (c) => `/operations/${c.tourId}/rooming` },
  /* Travel has no page yet — IA_CANONICAL S-5 calls it out as a missing PAGE,
     not missing nav. A null href renders it disabled rather than hiding it, so
     the gap is visible instead of forgotten. */
  { kind: 'item', id: 'travel', label: 'Travel', icon: 'Plane', href: null },
  { kind: 'item', id: 'files', label: 'Files', icon: 'FolderOpen', href: (c) => `/operations/${c.tourId}/files` },
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
    kind: 'item', id: 'summary', label: 'Summary', icon: 'LayoutDashboard',
    href: (c) => `/budget/${c.tourId}?tab=summary`, match: budgetTab('summary'),
  },
  {
    kind: 'item', id: 'expenses', label: 'Expenses', icon: 'Table2', badge: 'lines',
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
  { kind: 'item', id: 'payroll', label: 'Payroll', icon: 'Users', href: (c) => `/operations/${c.tourId}/payroll` },
  { kind: 'item', id: 'per-diems', label: 'Per diems', icon: 'Coins', href: null },
  {
    kind: 'item', id: 'receipts', label: 'Receipts', icon: 'ReceiptText', badge: 'receiptsNeedingDetails',
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
  { kind: 'item', id: 'channel-list', label: 'Channel list', icon: 'ListOrdered', href: (c) => `/operations/${c.tourId}/channel-list` },
  { kind: 'item', id: 'patch', label: 'Patch', icon: 'Grid3x3', href: null },
  { kind: 'item', id: 'stage-plot', label: 'Stage plot', icon: 'Shapes', href: (c) => `/operations/${c.tourId}/stage-plot` },
  {
    kind: 'item', id: 'riders', label: 'Riders', icon: 'FileText',
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
    kind: 'item', id: 'overview', label: 'Overview', icon: 'LayoutDashboard',
    href: (c) => `/artists/${c.artistId}`,
    match: (p) => /^\/artists\/[^/]+\/?$/.test(p) || /^\/artists\/[^/]+\/(edit|production)$/.test(p),
  },
  { kind: 'item', id: 'tours', label: 'Tours', icon: 'Route', badge: 'tours', href: (c) => `/artists/${c.artistId}?tab=tours` },
  g('Across tours'),
  { kind: 'item', id: 'year-budget', label: 'Year budget', icon: 'CircleDollarSign', href: null },
  { kind: 'item', id: 'people', label: 'People', icon: 'Users', href: null },
  g('Library'),
  {
    kind: 'item', id: 'riders-specs', label: 'Riders & specs', icon: 'FileText',
    href: (c) => `/artists/${c.artistId}/riders`,
    // Channel lists and stage plots are grouped under this item (IA_CANONICAL).
    match: (p) => /^\/artists\/[^/]+\/(riders|channel-lists|stage-plots)(\/|$)/.test(p),
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

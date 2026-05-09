/* ============================================
   LOWPASS — Scope detection (Sprint 10 §1.1)

   Pure function that derives the current navigation scope
   from a pathname. Three levels:

     - workspace : /, /personnel, /equipment, /settings/*,
                   /admin/*, /bugs, /artists (workspace landing)
     - artist    : /artists/[id] and /artists/[id]/*
     - tour      : /operations/[tourId]/*, /budget/[tourId]/*,
                   /advance/[tourId]/[routingId]/*

   Used by <UnifiedTopBar>, <BreadcrumbPill>, <ScopeNavStrip>,
   and <SubNavStrip> to render scope-appropriate chrome.

   Pure — no side effects, no React imports. Safe in server
   components, client components, and tests.
   ============================================ */

export type ScopeLevel = 'workspace' | 'artist' | 'tour';

export type TourProduct = 'operations' | 'budget' | 'advance';

export interface ScopeInfo {
  level: ScopeLevel;
  /** When level === 'artist' or 'tour'-scope-with-known-artist. */
  artistId: string | null;
  /** When level === 'tour'. */
  tourId: string | null;
  /** Which top-level product owns the tour route, when at tour
   *  scope. Drives the <SubNavStrip> contents. */
  tourProduct: TourProduct | null;
  /** Slug under the tour product, when at tour scope and the
   *  URL has a sub-page. e.g. /operations/[tourId]/personnel
   *  → 'personnel'. /operations/[tourId] → '' (summary). */
  tourSubSlug: string | null;
  /** For /advance/[tourId]/[routingId]/... — the routing id. */
  routingId: string | null;
}

const TOUR_PRODUCT_PATTERNS: ReadonlyArray<{
  prefix: string;
  product: TourProduct;
}> = [
  { prefix: '/operations/', product: 'operations' },
  { prefix: '/budget/', product: 'budget' },
  { prefix: '/advance/', product: 'advance' },
];

/** Trims trailing slash; collapses /a/b/?... to '/a/b'. */
function normalize(pathname: string): string {
  const queryIdx = pathname.indexOf('?');
  const noQuery = queryIdx >= 0 ? pathname.slice(0, queryIdx) : pathname;
  if (noQuery.length > 1 && noQuery.endsWith('/')) {
    return noQuery.slice(0, -1);
  }
  return noQuery;
}

/** Match /<prefix>/<id>(/<rest>)? → returns { id, rest }. */
function matchSegmented(
  pathname: string,
  prefix: string,
): { id: string; rest: string } | null {
  if (!pathname.startsWith(prefix)) return null;
  const after = pathname.slice(prefix.length);
  if (after.length === 0) return null;
  const slashIdx = after.indexOf('/');
  if (slashIdx < 0) return { id: after, rest: '' };
  return { id: after.slice(0, slashIdx), rest: after.slice(slashIdx + 1) };
}

/**
 * Derive the navigation scope from a pathname.
 *
 * Examples:
 *   /                                  → workspace
 *   /personnel                         → workspace
 *   /artists                           → workspace (the artist hub list)
 *   /artists/abc                       → artist (artistId='abc')
 *   /artists/abc/tours                 → artist
 *   /operations/xyz                    → tour (operations summary)
 *   /operations/xyz/personnel          → tour (operations / personnel)
 *   /budget/xyz/line-items             → tour (budget / line-items)
 *   /advance/xyz/r1                    → tour (advance, routingId='r1')
 *   /advance/xyz/r1/setup              → tour (advance, routingId='r1', sub='setup')
 */
export function deriveScope(pathnameRaw: string | null | undefined): ScopeInfo {
  const pathname = normalize(pathnameRaw ?? '/');

  // Tour scope — three product prefixes
  for (const { prefix, product } of TOUR_PRODUCT_PATTERNS) {
    const m = matchSegmented(pathname, prefix);
    if (!m) continue;
    if (product === 'advance') {
      // Advance has a second segmented id (routingId).
      const inner = matchSegmented('/' + m.rest, '/');
      const routingId = inner?.id ?? null;
      const subSlug = inner?.rest ? inner.rest.split('/')[0] : '';
      return {
        level: 'tour',
        artistId: null,
        tourId: m.id,
        tourProduct: product,
        tourSubSlug: subSlug || null,
        routingId,
      };
    }
    return {
      level: 'tour',
      artistId: null,
      tourId: m.id,
      tourProduct: product,
      tourSubSlug: m.rest ? m.rest.split('/')[0] : '',
      routingId: null,
    };
  }

  // Artist scope — /artists/[id] (NOT /artists exact)
  const artist = matchSegmented(pathname, '/artists/');
  if (artist) {
    return {
      level: 'artist',
      artistId: artist.id,
      tourId: null,
      tourProduct: null,
      tourSubSlug: null,
      routingId: null,
    };
  }

  // Everything else — workspace
  return {
    level: 'workspace',
    artistId: null,
    tourId: null,
    tourProduct: null,
    tourSubSlug: null,
    routingId: null,
  };
}

/** Helper: server-side, given a tour row, look up the parent
 *  artist id. Used by the layout that mounts <UnifiedTopBar>
 *  to enrich the breadcrumb at tour scope. */
export interface ScopeBreadcrumb {
  artist: { id: string; name: string; logoUrl: string | null } | null;
  tour: { id: string; name: string } | null;
}

/* The fetch helper is intentionally NOT included here — it
   needs a Supabase client and breaks the "pure / no side
   effects" contract of this module. The (app)/layout.tsx
   server component does the fetch and threads the result
   into <UnifiedTopBar> as a `breadcrumb` prop. */

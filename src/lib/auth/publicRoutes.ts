/* ============================================
   LOWPASS — the unauthenticated allow-list (P0)

   THE ONE PLACE that decides whether a path renders without a session. Extracted
   out of supabase-middleware.ts so it is a pure string function — which means it
   can be unit-tested directly, which is the whole reason this bug survived to
   production: the list lived inline in edge middleware where nothing could reach it.

   WHAT WENT WRONG (Cowork, 2026-07-21): /advance-intake/, /m/day/, /a/ and
   /share/advance/ were all missing, so every venue-intake link and every crew day
   link ever sent bounced to /login. The venue-intake feature — the no-signup
   differentiator over ATOM and AdvanceWithMe — had never once worked for its
   intended audience.

   PREFIX SAFETY IS THE HARD PART. `/a/` is two characters. Matching it loosely
   (startsWith('/a')) would open /artists, /assets, /admin, /advance, /account and
   /api in one stroke — a far worse bug than the one being fixed. Every entry here
   therefore ends in '/', so the character AFTER the segment must be a separator:
     '/a/'      matches '/a/TOKEN'         — NOT '/artists' ('/a' + 'r')
     '/m/day/'  matches '/m/day/TOKEN'     — NOT '/m/today' ('/m/' + 'today')
   The trailing slash is load-bearing. Do not remove it to "tidy" an entry.

   OPENING MIDDLEWARE DOES NOT OPEN DATA. Each of these resolves its token with
   the service-role client and enforces scope in its own loader — see the
   per-route authorisation notes below. Middleware is the outer door; the token
   check is the lock, and it is unchanged by this file.
   ============================================ */

/**
 * Path prefixes that render to visitors with no session.
 *
 * EVERY ENTRY MUST END IN '/' (or be a complete path segment) so it cannot
 * swallow a sibling route. See the prefix-safety note above.
 *
 * Authorisation that remains AFTER middleware lets these through:
 *   /r/               rider-pack share  — token → rider_packs row, service-role
 *                     lookup; an unknown token 404s.
 *   /invite/accept    workspace invite  — token validated against the invite row;
 *                     the panel only offers sign-in/sign-up, grants nothing.
 *   /intake/          personnel intake  — token-gated form; the route resolves the
 *                     token server-side and scopes writes to that person.
 *   /advance-intake/  VENUE intake      — token → advance instance, service-role;
 *                     the form writes only into that instance's intake answers.
 *   /a/               public advance packet — token → packet, read-only render.
 *   /m/day/           CREW day link     — token → routing day, then D1-3's
 *                     SERVER-SIDE role slice decides which blocks are even
 *                     queried. Out-of-slice data (money, internal notes) is
 *                     ABSENT from the HTML, not CSS-hidden. Cowork's byte-level
 *                     check after R5-2 confirmed this holds.
 *   /share/advance/   shared advance    — share token → advance, read-only.
 *   /s/               ONE SHOW LINK (B4) — token → show_links row, service-role;
 *                     the /api/public/show-link endpoint owns the password gate
 *                     and assembles read-only data. Two characters, so the
 *                     trailing slash is doing the same load-bearing work as
 *                     /a/: '/s/TOKEN' opens; /settings, /signup and /share
 *                     each have a non-slash third character and stay shut.
 */
export const PUBLIC_PATH_PREFIXES: readonly string[] = [
  '/r/',
  '/invite/accept',
  '/intake/',
  '/advance-intake/',
  '/a/',
  '/m/day/',
  '/share/advance/',
  '/s/',
];

/** Dev-only: the Stage Plot icon catalog, browsable without a session while
 *  building the icon library. The page itself refuses to render in production. */
const DEV_ONLY_PREFIXES: readonly string[] = ['/stage-plot-'];

/** Auth pages — reachable signed-out by definition. */
export function isAuthPath(pathname: string): boolean {
  return (
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/auth')
  );
}

/**
 * True when `pathname` may render without a session.
 *
 * `isProduction` is a parameter rather than a read of process.env so the
 * dev-only branch is testable both ways.
 */
export function isPublicPath(pathname: string, isProduction = true): boolean {
  if (PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  if (!isProduction && DEV_ONLY_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  return false;
}

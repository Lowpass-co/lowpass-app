# CC — P0: four public token routes are behind the auth wall. FIX FIRST, BEFORE ANY OTHER WORK.

Found by Cowork 2026-07-21 while inventorying routes for the nav migration. Tested on production with `credentials:'omit'` (i.e. exactly what a logged-out recipient's browser sends) against a bogus token, so the result isolates middleware behaviour from app behaviour: a redirect means the middleware bounced it to /login before the route ever ran; a 200/404 means the app handled it.

```
/m/day/BOGUSTOKEN123          → REDIRECTED to login   ✗ GATED
/advance-intake/BOGUSTOKEN123 → REDIRECTED to login   ✗ GATED
/a/BOGUSTOKEN123              → REDIRECTED to login   ✗ GATED
/share/advance/BOGUSTOKEN123  → REDIRECTED to login   ✗ GATED
/r/BOGUSTOKEN123              → 200, reached the app  ✓ ok
/intake/BOGUSTOKEN123         → 200, reached the app  ✓ ok
```
Also confirmed with a REAL freshly-minted crew token: logged-out fetch → `opaqueredirect`; the same URL with session cookies → 200. So the pages work; **nobody without a Lowpass login can reach them.**

## Why this is the top of the queue
- **`/advance-intake/[token]` is the venue intake** — the no-signup feature repeatedly described as best-in-class and a key differentiator over ATOM and AdvanceWithMe (both of which force venue accounts). **Every venue link sent to date has hit a login wall.** The feature has never worked for its intended audience in production.
- **`/m/day/[token]` is the crew day link** — D1's headline deliverable and the intended beta demo. Crew would be asked to log in to an app they have no account for.
- `/a/[token]` (public advance packet) and `/share/advance/[token]` (shared advance) are the same class.

## The fix
`src/lib/supabase-middleware.ts` (~lines 55–68) holds the unauthenticated allow-list. It currently covers `/r/`, `/invite/accept`, `/intake/`, `/stage-plot-*`, `/login`, `/signup`, `/auth`. Add: `/m/day/`, `/advance-intake/`, `/a/`, `/share/advance/`.

Do it with care, not a loose prefix match:
- Match **path prefixes precisely**. `/a/` in particular is a short prefix — make sure the rule cannot swallow other routes (`/artists`, `/advance/…`, `/assets`, `/admin`). Anchor it: allow `/a/<token>` only, not `/a` + anything.
- `/m/day/` must stay allowed while the rest of `/m/*` (the authed mobile tab-bar app) stays gated. `/m/today`, `/m/files`, `/m/receipt` etc are authed surfaces — do not open them.
- These routes resolve their token with the **service-role client** and enforce scope in the loader (D1-3). Opening the middleware does not open data — but re-state in the report exactly which layer authorises each of the four, so we know the gate that remains.

## Regression test (this must never silently break again)
Add an automated test asserting each public path is reachable WITHOUT credentials and each authed path is NOT. A route added to the app without an allow-list entry should fail this test, not fail silently in a venue's inbox six weeks later. Include `/m/today` and `/artists` as negative cases (must still redirect).

## Verify
Report the middleware diff and the test output. Cowork re-runs the exact probe above on the deployed build — all six lines must read "reached the app" for the public set, and the negative cases must still redirect.

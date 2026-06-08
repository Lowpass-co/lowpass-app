# Auth smoke tests

> **Last bulk verification**: (pending — design/ux-audit-2026)

Walk these after changes to the signed-out surfaces (login / signup /
password reset). Format defined in `docs/smoke-tests/README.md`.
Prefix: `AUTH`.

## Login + signup unification (UX Audit 2026)

#### AUTH-01 — Login layout + brand colour + input affordances

**Do**: Open `/login`.

**Expect**: Dark globe split layout (brand panel + form). Brand orange
is `#FF4500` (grep confirms zero `#ff5500`). Inputs have visible focus
rings; the password field has a working show/hide toggle.

**Last verified**:

#### AUTH-02 — Signup matches login

**Do**: Open `/signup`.

**Expect**: Same `AuthShell` layout as login (not the old plain card).
Name/email/new-password autocomplete set; password toggle; errors
announce via `aria-live`.

**Last verified**:

#### AUTH-03 — Forgot-password + Google button consistent

**Do**: On `/login`, open the forgot-password form; note the Google
button.

**Expect**: Forgot-password renders through the shared AuthKit fields;
the Google button uses the shared button styling (not bespoke chrome).

**Last verified**:

## Route proxy + CSRF (security audit §M3/§L4 — merged to `main` 2026-06-07)

> The audit's `middleware.ts` was folded into `src/proxy.ts` (Next 16
> renamed middleware→proxy). These verify the merge didn't break auth and
> that the new CSRF layer is live. **Run these first after any deploy.**

#### AUTH-05 — Signed-out redirect still works

**Do**: In a fresh/incognito window, open an authenticated page (e.g.
`/artists`).

**Expect**: Redirected to `/login` — the proxy → `updateSession` redirect is
intact after the merge.

**Last verified**:

#### AUTH-06 — Signed-in app loads and saves (same-origin not blocked)

**Do**: Log in; edit a budget line or add a personnel row.

**Expect**: Saves succeed — no `403 "Cross-origin request blocked"`.
Same-origin mutations pass the new CSRF check; API routes still authenticate
normally (the proxy short-circuits `/api/` after the CSRF check, so they
return JSON, not redirects).

**Last verified**:

#### AUTH-07 — Public token routes reachable signed-out

**Do**: In incognito, open a rider-pack share link (`/r/[token]`) or
`/invite/accept`.

**Expect**: Renders for the unauthenticated visitor — NOT bounced to
`/login`. (Public-route allowlist in `updateSession` intact.)

**Last verified**:

#### AUTH-08 — Auth route bounce when signed-in

**Do**: While logged in, visit `/login`.

**Expect**: Redirected to `/dashboard`.

**Last verified**:

#### AUTH-09 — Cross-origin write blocked (code-level; manual optional)

**Do**: Hard to do by hand — a `POST/PUT/PATCH/DELETE` from a foreign
`Origin` header should be rejected. Trust the proxy code unless you can craft
a cross-site request.

**Expect**: `403` JSON `"Cross-origin request blocked"`. Server-to-server
callers that send no `Origin` (Vercel Cron, webhooks) pass through to their
own secret checks (e.g. `CRON_SECRET`).

**Last verified**:

## Known broken

#### AUTH-04 — Login globe not yet deduped onto AuthShell

**Currently**: `/login` still carries its own inline globe `useEffect`
+ post-login zoom overlay rather than reusing `AuthShell`'s globe.
Cosmetically identical; flagged for a dedup pass.

**Tracked in**: design/ux-audit-2026 auth follow-up.

## Retired

(None yet.)

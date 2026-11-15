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
>
> **2026-06-07 (Adam, preview)**: AUTH-05/06/07/08 PASS; AUTH-09 not
> hand-testable. AUTH-05 note — the signed-out redirect preserves the
> `?artist_id&tour_id` query params rather than landing on a bare `/login`.
> Acceptable (keeps return context); revisit only if a clean `/login` is
> wanted.

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

## New accounts (Nov 2026 — needs migration 290)

#### AUTH-10 — A new sign-up lands in its own workspace, with the welcome

**Do**: Paste migration 290. Sign up a brand-new account (new email), confirm from the email.

**Expect**: Lands on `/artists` — "<name>'s Workspace", no artists — and the welcome opens by itself. No reloading. (Before 290 a new account had no workspace membership, couldn't read its own workspace, and `/artists` ⇄ `/login` looped.)

**Last verified**:

#### AUTH-11 — Signed in with no workspace: a message, not a loop

**Do**: (Staging / by hand) delete a test account's `workspace_members` row for its active workspace, then open `/artists`.

**Expect**: "We can't open your workspace" with Try again / Sign out. The page doesn't reload by itself; Sign out goes to `/login`.

**Last verified**:

## Known broken

#### AUTH-04 — Login globe not yet deduped onto AuthShell

**Currently**: `/login` still carries its own inline globe `useEffect`
+ post-login zoom overlay rather than reusing `AuthShell`'s globe.
Cosmetically identical; flagged for a dedup pass.

**Tracked in**: design/ux-audit-2026 auth follow-up.

## Retired

(None yet.)

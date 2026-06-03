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

## Known broken

#### AUTH-04 — Login globe not yet deduped onto AuthShell

**Currently**: `/login` still carries its own inline globe `useEffect`
+ post-login zoom overlay rather than reusing `AuthShell`'s globe.
Cosmetically identical; flagged for a dedup pass.

**Tracked in**: design/ux-audit-2026 auth follow-up.

## Retired

(None yet.)

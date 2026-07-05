# Nav & entry smoke tests

> Prefix: `NAV`. Covers the Nav & entry fixpack (Stage 4): post-login
> landing, tour-open product resolution, orphan/stub routes, admin gates.
> Format defined in `docs/smoke-tests/README.md`.

## Post-login landing (item 3)

#### NAV-01 — Login lands directly on /artists (no /dashboard bounce)

**Do**: Sign in from `/login` with no `?next=`.

**Expect**: One redirect to `/artists` (the workspace landing) — no
intermediate `/dashboard` (retired) hop. A single-artist workspace then
auto-skips to `/artists/{id}` (Salvage #5). With `?next=/budget/X`, lands
on `/budget/X` instead.

**Last verified**:

#### NAV-02 — Authenticated visit to /login redirects to /artists

**Do**: While signed in, navigate to `/login` directly.

**Expect**: Middleware redirects to `/artists`, not `/dashboard`.

**Last verified**:

## Tour-open resolves to last-used product (item 1)

#### NAV-03 — Tour card / Resume open the last-used product

**Do**: Open a tour's Budget, then its Operations (so Operations is the
last product used). Return to the artist Home; click the tour card. Then
from the workspace landing, click "Resume …" for that tour.

**Expect**: Both land on `/operations/{tourId}` (the last product used),
not the old hardwired `/budget/{tourId}`. The Resume button label reads
"Resume Operations". A never-opened tour falls back to Operations.

**Last verified**:

#### NAV-04 — Card still selects → banner (behavior unchanged)

**Do**: On the artist Home, click a tour card.

**Expect**: The tour selects and the ActiveTourBanner (Operations / Budget /
Advance + "Change tour") behaviour is unchanged — only the resolved open
href changed (per UX_WALK §Correction).

**Last verified**:

## Orphans & stubs (item 5)

#### NAV-05 — /tours redirects to /artists

**Do**: Navigate to `/tours` (the bare legacy list).

**Expect**: 301 → `/artists`. (Every `/tours/:id*` URL already redirected;
this closed the last gap. 301s cache hard — test in incognito.)

**Last verified**:

#### NAV-06 — /admin/ai-usage single chrome (no double shell)

**Do**: As a site admin, open `/admin/ai-usage`.

**Expect**: One set of page chrome (from `admin/layout.tsx`'s
listAppPageShell) — the page no longer wraps itself in a second
`<ProductShell>`. KPI tiles + dashboard render normally.

**Last verified**:

#### NAV-07 — /grid-demo is site-admin-only

**Do**: Visit `/grid-demo` as (a) a non-admin user, (b) a site admin.

**Expect**: (a) 404 (notFound gate). (b) The Grid smoke harness renders.

**Last verified**:

## Known good (no code change — verified NO-OPs)

- **/gear** — NOT deleted. `/gear` is the canonical Gear Library (`gear`
  entities); the Equipment workspace tab is the Rental House
  (rental_inventory / rental_jobs) — a different data model, so Equipment
  does not cover it. Per "verify-then-delete", the delete is blocked. It
  remains an orphan pending Adam's nav decision.
- **/settings/ai-limits** — already linked from `/settings` via the
  SettingsSubNav "AI limits" tab (`SettingsSubNav.tsx` SETTINGS_LINKS),
  mounted on the settings page. No new link needed.
- **/admin/{shell,data-table,spreadsheet}-playground + /admin/design-tokens**
  — already site-admin-gated (each calls `getUserAndAdminStatus` + inherits
  `/admin/layout.tsx`). Left as-is.
- **/stage-plot-{editor,icon-preview,canvas-preview}** — already
  `return null` in production. `/stage-plot-icons` gained a server layout
  that `notFound()`s in production to match (item 5).

## Known broken

(None yet.)

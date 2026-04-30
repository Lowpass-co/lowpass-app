# Product Split Phase 1 — Foundation Shells + Tokens + Migration Map Wiring + Home Revision

> Phase 0 is done (PR #7). Adam reviewed the migration map, resolved every tbd, signed off the visual direction with two specific revisions: (1) drop the tour-list inside product cards on Home — every product involves every tour, listing tours per card is redundant, (2) shrink the recent-activity table and add an extra useful column. Phase 1 builds the foundation shells, applies the new token system, wires the migration map decisions, deletes obsolete routes, and revises Home to match Adam's "overview of the artist's world" framing.
>
> **New branch off `feat/product-split-phase0`** (PR #7's branch, not main — Phase 1 builds on Phase 0's reference page and migration docs). When Phase 1 lands, both PRs merge together.
>
> No production routes touched outside the foundation shells, the Home page (which moves out of `/playground/new-home` into its real home), and the obsolete-route deletions. Existing pages keep working via redirects to placeholders until Phases 2-4 migrate them.

---

## 0. Required reading

1. `CLAUDE.md`
2. `docs/handover/PRODUCT_SPLIT_MIGRATION_MAP.md` — Phase 0's output. The §6 tbd entries are now resolved (see §1.7 below).
3. `docs/handover/PRODUCT_SPLIT_TOKEN_PROPOSAL.md` — Phase 0's token sketch. Phase 1 makes the proposal real in `globals.css`.
4. `src/app/(app)/playground/new-home/[artistId]/page.tsx` — Phase 0's reference Home. Becomes the basis for the production Home in §B.
5. `src/components/shell/TopBar.tsx`, `LeftRail.tsx`, `PageShell.tsx`, `app-page-shells.tsx` — existing shells. **Don't modify them in Phase 1.** New shells (`<ProductRail>`, `<ProductHeader>`, `<ProductShell>`) sit alongside.
6. `src/contexts/ArtistTourContext.tsx` — existing artist + tour state container. New `<ProductContext>` integrates with this.

---

## 1. Hard rules

1. No new dependencies.
2. All visual values via `var(--lp-…)` tokens — including the new ones added in §A.
3. No `any`, no `// @ts-ignore`.
4. Lint clean (75/120 baseline). Typecheck zero errors.
5. Build via `next build --webpack` only.
6. **Five commits in order: A → B → C → D → V.** Foundation, Home revision, migration-map wiring, obsolete-route deletions, verify.
7. **Adam's locked decisions for the 14 tbd entries** (do not relitigate):

| # | Route / Component | Decision |
|---|---|---|
| 1 | `/calendar` | Home shows it as a widget (artist-scoped). Standalone `/calendar` route stays at Foundation/workspace level. |
| 2 | `/personnel` | **Two homes**: tour-scoped Personnel inside Operations (`/operations/[tour-id]/personnel`); workspace-level cross-tour Personnel directory at Foundation level (under account/settings menu, not in product nav). |
| 3 | `/equipment` (rental business) | **Account-level, not workspace-level.** Move under the avatar dropdown alongside Settings + Bug reports. Per-user feature, not in product nav at all. |
| 4 | `/library/*` subpaths | **Library dropdown retires entirely.** Contents migrate: Rider Packs → Ops, Deal Memos → Budget, Gear (templates) → folded into account-level rental, Templates → Foundation cross-product, Performance → see #5, Venues → workspace-level directory at Foundation. |
| 5 | `/performance` | **Retire as a standalone page.** Whatever functionality lives there folds into Ops or Budget where contextual. Audit + integrate; remove the route. |
| 6 | `/rooming` workspace-level | Operations (tour-scoped). Link badges from Budget hotel/accom rows. |
| 7 | `/advance` + `/budget` workspace-level | **Stay as product-level dashboards** (top-level overview pages for each product). Not folded into Home. Each product has its own "across all tours" landing surface inside its silo. |
| 8 | `/tours/[id]/payroll` | Operations canonical. Tile/badge link to Budget for the financial side. |
| 9 | `/tours/[id]/day` | Operations. |
| 10 | `/tours/[id]/sheet` | **Delete entirely.** Adam's call. Audit references first; if anything imports from it, surface and ask before deleting. |
| 11 | `/tours/[id]/summary` vs `/overview` vs `/tours/[id]` | **`/tours/[id]/summary` is canonical Operations landing.** Becomes `/operations/[tour-id]` post-migration. `/overview` and bare `/tours/[id]` redirect to it. |
| 12 | `/m/*` mobile PWA | **Flat, not product-aware.** Mobile is its own surface optimized for day-of-show workflows. Doesn't mirror the four-product split. |
| 13 | `src/components/equipment/*` | Move alongside the per-user rental feature (decision #3). NOT in Operations folder. |
| 14 | `src/components/templates/*` | Foundation cross-product. Stays where it is; available to all four products. |

---

## A. Foundation — tokens + shells (~3 hr)

The chassis everything else hangs off. No UI changes visible to users yet — only the shells exist as components, and `globals.css` picks up new tokens.

### A.1 Token additions to `globals.css`

Add the new tokens from `PRODUCT_SPLIT_TOKEN_PROPOSAL.md` §B.2:

```css
:root {
  /* Existing Lowpass tokens stay as-is */

  /* New product-split tokens */
  --lp-bg-deep: #0a0a0a;            /* deeper than --lp-bg, table backgrounds */
  --lp-panel: #111111;               /* table headers, strip backgrounds */
  --lp-border-subtle: #222222;       /* dense table cell borders */
  --lp-border-strong: #333333;       /* card borders, modal edges */
  --lp-text-mono: #d1d5db;           /* monospace numeric content */
  --lp-mono-font: 'JetBrains Mono', ui-monospace, monospace;
}

/* Density rule — applied via class, not global */
.lp-dense {
  font-size: 12px;
  line-height: 1.4;
}
.lp-dense th,
.lp-dense td {
  padding: 4px 8px;
}

/* JetBrains Mono utility for numerics */
.lp-mono {
  font-family: var(--lp-mono-font);
  font-variant-numeric: tabular-nums;
}
```

JetBrains Mono via Google Fonts CDN at the top of `globals.css` (Phase 0 already loaded Inter):

```css
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap');
```

**Body base font size: 13px.** Update the `html` or `body` selector accordingly. Existing components that hard-code 14px stay (don't touch existing pages — they'll re-render at 13px naturally and any that look bad get fixed in Phases 2-4 when their product migrates).

### A.2 Shell components

Three new files in `src/components/shell-v2/` (don't replace `src/components/shell/` — that's the existing shells, which keep working until product migrations retire them).

**`<ProductRail>`** — left icon-only rail, 56px wide, fixed-positioned within `<ProductShell>`.

```tsx
interface ProductRailProps {
  active: 'home' | 'operations' | 'budget' | 'advance';
}
```

Renders five icons: Home / Operations / Budget / Advance / (gap, push to bottom) / Settings + Avatar. Lucide icons (`House`, `Briefcase`, `DollarSign`, `Calendar`, `Settings`). Active product gets the brand-orange tint background; others muted. Click navigates to the product's root route.

**`<ProductHeader>`** — top header, 44-48px tall.

```tsx
interface ProductHeaderProps {
  artistId: string | null;
  tourId?: string | null;          // optional — only shown in tour-scoped products
  productName: 'Home' | 'Operations' | 'Budget' | 'Advance';
}
```

Layout: artist switcher + tour switcher (when `tourId` provided) on the left, search + notifications + account avatar on the right. Replaces the existing TopBar conceptually but lives alongside until Phases 2-4 cut over.

**`<ProductShell>`** — wraps the page body, owns scroll context.

```tsx
interface ProductShellProps {
  active: ProductRailProps['active'];
  artistId: string | null;
  tourId?: string | null;
  productName: ProductHeaderProps['productName'];
  children: React.ReactNode;
}
```

Composition: `<ProductRail>` + `<ProductHeader>` + main content area with proper scroll containment so a sticky element inside the children doesn't fight the rail's stacking. (See `CLAUDE.md`'s TourBreadcrumb note for the prior class of bug.)

### A.3 ProductContext + useEntitlements

`src/contexts/ProductContext.tsx`:

```tsx
type Product = 'home' | 'operations' | 'budget' | 'advance';

interface ProductContextValue {
  current: Product;
  // ... whatever else makes sense
}
```

Provider mounts inside the app layout. Sets `current` based on URL pathname.

`src/lib/entitlements.ts`:

```ts
export interface Entitlements {
  home: boolean;
  operations: boolean;
  budget: boolean;
  advance: boolean;
}

export function useEntitlements(): Entitlements {
  // Hardcoded TRUE for everyone in Phase 1.
  // When Stripe integration lands, this hook reads from the
  // `subscriptions` or `entitlements` table.
  return {
    home: true,
    operations: true,
    budget: true,
    advance: true,
  };
}
```

Every product nav element calls `useEntitlements()` and conditionally renders. Today everything renders; the day entitlements table goes live, swapping the hook is the only change.

### A.4 Acceptance for §A

- [ ] `globals.css` has the new tokens + JetBrains Mono import + `.lp-dense` and `.lp-mono` utility classes
- [ ] `<ProductRail>` / `<ProductHeader>` / `<ProductShell>` exist in `src/components/shell-v2/` with the documented APIs
- [ ] `<ProductContext>` provider mounted in app layout
- [ ] `useEntitlements()` hook returns hardcoded all-true
- [ ] Existing pages still render correctly (no regressions from the body font-size shift)
- [ ] Lint + typecheck clean

### A.5 Commit

```
feat(shell-v2): foundation tokens + product shells + entitlements scaffold

Phase 1 chassis for the four-product split:
- New tokens in globals.css (--lp-bg-deep, --lp-panel,
  --lp-border-subtle, --lp-border-strong, --lp-text-mono,
  --lp-mono-font). 13px base body. Density rule via .lp-dense
  class, JetBrains Mono via .lp-mono.
- shell-v2/ProductRail, ProductHeader, ProductShell. Live alongside
  existing shell/ until Phases 2-4 cut over.
- ProductContext provider + useEntitlements() hook (hardcoded
  all-true; entitlement enforcement lands when Stripe does).

No existing pages migrated yet — they keep their current shells
until their product's Phase ships.

Made-with: Claude Code (product split Phase 1)
```

---

## B. Home revision (~2 hr)

Move Home out of `/playground/new-home/[artistId]` and into its real route. Apply Adam's two specific revisions (no tour-list inside product cards, smaller activity table + extra column).

### B.1 New route

`src/app/(app)/artists/[id]/page.tsx` becomes Home (replacing the existing Artist Hub from PR #3 — that page's content folds into Home).

Phase 0's `/playground/new-home/[artistId]/page.tsx` is the starting point. **Move and adapt it.** The playground catch-all route (`[product]/[tourId]`) goes away too — Phase 1 wires real product routes.

### B.2 Layout (revised per Adam's feedback)

Top to bottom:

1. **Hero** — kept as-is. Artist logo + name + sub-line "X tours · Y active shows · Z upcoming this month".

2. **4 stat tiles** — kept but **denser** (less vertical padding, smaller numbers). Take less screen real estate. Same data: Active Tours / Shows This Month / Personnel Active / Budget Committed. JetBrains Mono numerics, applied via `.lp-mono`.

3. **Calendar widget** (NEW per migration map #1) — artist-scoped. Shows the next 30 days of dates across all this artist's tours. Compact horizontal strip or small grid — pick whichever fits cleanly. Each cell shows day type colour (using existing `--lp-day-*` tokens) + venue name on hover. Click a date → navigate to that show's advance page. **Keep small** — this is a widget, not the page's centerpiece.

4. **3 product cards** — STRIPPED. No tour list inside. Each card shows:
   - Icon + product name + one-line description
   - **Single "what's hot" indicator** at the bottom — one number with context. Examples:
     - Operations: "12 personnel awaiting assignment" or "3 routings to finalize"
     - Budget: "12 receipts pending" or "$X over budget across all tours"
     - Advance: "3 shows missing advance" or "5 shows due this week"
   - Click card → navigates to the product's top-level page (`/operations`, `/budget`, `/advance`) where the user picks a tour.
   
   Pick the most actionable single metric per product. Surface in the audit if the data isn't trivially available.

5. **Recent activity** — COMPRESSED. Default 5 rows visible, "View all" link expands or navigates to a fuller view. **One additional column** with useful data — recommend "actor" (who did the action) since today's table only shows what+when. So columns become: Product badge / Actor / Tour / Summary / When.

### B.3 Data fetching

Reuse `src/server/home/getHomeData.ts` from Phase 0, extending it for:
- Calendar dates (artist-scoped, next 30 days)
- "What's hot" metric per product
- Activity actor lookup (join through `profiles` to get name/email)

### B.4 Acceptance for §B

- [ ] `/artists/[id]` is the production Home (not the playground URL)
- [ ] Old `/playground/new-home/*` routes deleted
- [ ] Hero + stat tiles + Calendar widget + 3 product cards (no tour list, with "what's hot" metric) + compressed Recent Activity (5 rows, +actor column)
- [ ] Click a product card → routes to product's top-level page (placeholder if not yet migrated)
- [ ] Click a calendar cell → routes to the show's advance page
- [ ] Lint + typecheck clean

### B.5 Commit

```
feat(home): production Home page — overview-shaped, no tour-list-inside-cards

Per Adam's Phase 0 review: Home is artist-scope overview, not a
tour-launcher. Playground reference moves into /artists/[id] and
gets revised:

- Hero + stat tiles kept (denser layout)
- Calendar widget added (next 30 days, artist-scoped)
- 3 product cards stripped of tour lists; each shows ONE
  "what's hot" metric + click-through to product top-level
- Recent activity compressed to 5 rows default + "actor"
  column added

Old /playground/new-home/* routes deleted.

Made-with: Claude Code (product split Phase 1)
```

---

## C. Migration-map wiring + redirect scaffolding (~2 hr)

Stand up the new product-prefixed routes as placeholders + redirect every old route to its new home. No content migration yet — just routing.

### C.1 New product routes (placeholders)

Create the route trees:

```
src/app/(app)/
  operations/
    page.tsx                   → Operations dashboard (cross-tour)
    [tourId]/
      page.tsx                 → Operations tour landing (placeholder, content from /tours/[id]/summary in Phase 4)
      routing/page.tsx         → placeholder
      channel-list/page.tsx    → placeholder
      rooming/page.tsx         → placeholder
      personnel/page.tsx       → placeholder
      payroll/page.tsx         → placeholder
      day/page.tsx             → placeholder
      files/page.tsx           → placeholder
      hire/page.tsx            → placeholder
      riders/page.tsx          → placeholder
      edit/page.tsx            → placeholder
  budget/
    page.tsx                   → Budget dashboard (cross-tour)
    [tourId]/
      page.tsx                 → placeholder (current /tours/[id]/budget content lands here in Phase 3)
      settlement/page.tsx      → placeholder
  advance/
    page.tsx                   → Advance dashboard (cross-tour)
    [tourId]/
      page.tsx                 → placeholder
      [routingId]/page.tsx     → placeholder
```

Each placeholder renders a simple "Coming in Phase X" message inside the new `<ProductShell>`. Wire the rail / header so navigation between products works even though content is empty.

### C.2 Redirects

Add `next.config.js` redirects (or middleware-driven, your call) for every old route → new equivalent:

```js
{ source: '/tours/:id', destination: '/operations/:id', permanent: true },
{ source: '/tours/:id/summary', destination: '/operations/:id', permanent: true },
{ source: '/tours/:id/overview', destination: '/operations/:id', permanent: true },
{ source: '/tours/:id/budget', destination: '/budget/:id', permanent: true },
{ source: '/tours/:id/budget/settlement', destination: '/budget/:id/settlement', permanent: true },
{ source: '/tours/:id/advance', destination: '/advance/:id', permanent: true },
{ source: '/tours/:id/advance/:routingId', destination: '/advance/:id/:routingId', permanent: true },
{ source: '/tours/:id/routing', destination: '/operations/:id/routing', permanent: true },
{ source: '/tours/:id/channel-list', destination: '/operations/:id/channel-list', permanent: true },
{ source: '/tours/:id/rooming', destination: '/operations/:id/rooming', permanent: true },
{ source: '/tours/:id/personnel', destination: '/operations/:id/personnel', permanent: true },
{ source: '/tours/:id/payroll', destination: '/operations/:id/payroll', permanent: true },
{ source: '/tours/:id/day', destination: '/operations/:id/day', permanent: true },
{ source: '/tours/:id/files', destination: '/operations/:id/files', permanent: true },
{ source: '/tours/:id/hire', destination: '/operations/:id/hire', permanent: true },
{ source: '/tours/:id/rider-packs', destination: '/operations/:id/riders', permanent: true },
{ source: '/tours/:id/rider-packs/:packId', destination: '/operations/:id/riders/:packId', permanent: true },
{ source: '/tours/:id/edit', destination: '/operations/:id/edit', permanent: true },
{ source: '/tours/:id/tour-wide', destination: '/operations/:id', permanent: true },  // tour-wide retired, content folded
{ source: '/dashboard', destination: '/', permanent: true },  // dashboard retires; / lands on artist picker
```

**CAREFUL**: `/tours/[id]/sheet` doesn't redirect — it's deleted entirely (decision #10). Same for `/performance` (decision #5). `/library/*` redirects to wherever its contents migrated:

```js
{ source: '/library/rider-packs/:rest*', destination: '/operations/:rest*', permanent: true },  // adjust pattern
{ source: '/library/deal-memos/:rest*', destination: '/budget/deal-memos/:rest*', permanent: true },
{ source: '/library/gear/:rest*', destination: '/account/rental/:rest*', permanent: true },  // user-level
{ source: '/library/templates/:rest*', destination: '/templates/:rest*', permanent: true },  // foundation
{ source: '/library/venues/:rest*', destination: '/venues/:rest*', permanent: true },  // foundation
{ source: '/library/performance/:rest*', destination: '/', permanent: true },  // performance retires
```

### C.3 Acceptance for §C

- [ ] Every old route from the migration map either redirects to its new home OR is deleted (per decisions #5 and #10)
- [ ] New product routes exist as placeholder pages mounted inside `<ProductShell>`
- [ ] Navigation between products via `<ProductRail>` works
- [ ] Hitting an old URL redirects with HTTP 301
- [ ] Deleted routes (`/tours/[id]/sheet`, `/performance`) return 404
- [ ] Lint + typecheck clean

### C.4 Commit

```
feat(routing): product-prefixed routes + 301 redirects from legacy URLs

Stands up the four-product URL structure:
- /operations/[tourId]/* — placeholders for ops surfaces
- /budget/[tourId]/* — placeholders
- /advance/[tourId]/* — placeholders
- /artists/[id] is now Home (per Phase 1.B)

Every old /tours/[id]/* URL 301s to its new home per Adam's
migration-map decisions. /dashboard retires.

Placeholder pages mount inside the new <ProductShell> so nav
between products works even though content lands in Phases 2-4.

Made-with: Claude Code (product split Phase 1)
```

---

## D. Obsolete-route deletions + workspace-level Foundation routes (~1 hr)

Per the migration map decisions, several routes need to die outright + a few new workspace-level Foundation routes need to exist.

### D.1 Delete

- `/tours/[id]/sheet` — decision #10. Audit imports first; if anything pulls from it, surface and ask. Otherwise delete the file + remove from any nav.
- `/performance` — decision #5. Same audit-first protocol.
- `/dashboard` — decision (folded into / via redirect). The page file itself goes.
- Library dropdown contents — Library as a dropdown concept retires. Each subpath migrates per decision #4.

### D.2 New workspace-level Foundation routes

Per migration-map decisions:

- **`/personnel`** (new) — workspace-level cross-tour Personnel directory. Per decision #2. Lives in the account/settings area of the nav (not in the product rail). Phase 1 ships a placeholder.
- **`/templates`** (new) — Foundation cross-product templates browser. Per decision #4 (Library/templates). Placeholder.
- **`/venues`** (new) — Foundation venues directory. Per decision #4 (Library/venues). Placeholder.
- **`/account/rental`** (new) — per-user rental business. Per decisions #3 + #13. Placeholder. Lives in the avatar dropdown menu, not in the product rail.

These don't live in any of the four products; they're workspace-level Foundation surfaces. They appear in the avatar dropdown or settings sidebar, NOT in `<ProductRail>`.

### D.3 Acceptance for §D

- [ ] `/tours/[id]/sheet` deleted (file + any references)
- [ ] `/performance` deleted
- [ ] Library dropdown UI removed from existing TopBar
- [ ] `/personnel`, `/templates`, `/venues`, `/account/rental` placeholder routes exist
- [ ] Avatar dropdown menu adds entries for those workspace-level routes (replacing what was in Library where appropriate)
- [ ] No broken imports anywhere
- [ ] Lint + typecheck clean

### D.4 Commit

```
chore(routing): retire obsolete routes + scaffold workspace-level Foundation

Per Adam's migration-map decisions:
- Delete /tours/[id]/sheet (#10), /performance (#5), /dashboard
- Library dropdown UI removed; subpath redirects in place from §C
- /personnel (workspace-level cross-tour directory), /templates,
  /venues, /account/rental scaffolded as placeholders. These live
  outside the four-product rail — accessed via avatar dropdown or
  settings.

Made-with: Claude Code (product split Phase 1)
```

---

## V. Verify (~30 min)

### V.1 Foundation

1. `globals.css` has the new tokens. Body text renders at 13px.
2. JetBrains Mono loads from Google Fonts CDN.
3. `<ProductRail>` / `<ProductHeader>` / `<ProductShell>` work — mount one at `/playground/shell-test` if helpful.
4. `useEntitlements()` returns all-true.

### V.2 Home

5. Visit `/artists/[id]` (any artist). See the new Home: hero, 4 stat tiles, calendar widget (next 30 days), 3 product cards (no tour list, single "what's hot" metric per card), 5-row activity table with actor column.
6. Click a product card → routes to product top-level (placeholder).
7. Click a calendar cell → routes to that show's advance page (placeholder).

### V.3 Routing

8. Visit `/tours/[id]` → 301 to `/operations/[id]`.
9. `/tours/[id]/budget` → `/budget/[id]`.
10. `/tours/[id]/sheet` → 404 (deleted).
11. `/performance` → 404 (deleted).
12. `/library/rider-packs` → redirects per decision.

### V.4 Workspace-level

13. Avatar dropdown shows entries for Personnel, Templates, Venues, Rental, Settings, Bug reports, Sign out.
14. Click each → placeholder page (or settings/bugs work as before).

### V.5 No regressions

15. Lint + typecheck clean. `next build --webpack` succeeds.
16. Existing legacy pages (still on old shells, content unchanged) continue to render — visit a few `/tours/[id]/budget`-style URLs and confirm the redirect leads to a working placeholder.

---

## When done

```
Product Split Phase 1 done.
Commits: <A-sha>, <B-sha>, <C-sha>, <D-sha>.
- A: Foundation tokens (13px base, JetBrains Mono numerics, density
  utility class) + shell-v2 components (ProductRail, ProductHeader,
  ProductShell) + ProductContext + useEntitlements scaffold.
- B: Production Home at /artists/[id] — overview-shaped (no
  tour-lists inside product cards, calendar widget, single
  "what's hot" metric per product card, compressed 5-row activity
  table with actor column).
- C: /operations/[tourId]/*, /budget/[tourId]/*, /advance/[tourId]/*
  scaffolded as placeholders. 301 redirects from every legacy
  /tours/[id]/* URL to its new home.
- D: Deleted /tours/[id]/sheet, /performance, /dashboard, Library
  dropdown. New workspace-level Foundation routes /personnel,
  /templates, /venues, /account/rental scaffolded.
- Lint + typecheck clean. Built via next build --webpack.
- Adam reviews; Phases 2 (Advance), 3 (Budget), 4 (Operations)
  migrate content into the placeholder routes.
```

If §D's audit reveals any unexpected imports from the deleted routes (`/sheet`, `/performance`), surface in the report — Adam will decide whether to keep, migrate, or rewrite the dependent code.

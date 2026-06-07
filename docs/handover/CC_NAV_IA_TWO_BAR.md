# Claude Code prompt — Two-bar navigation (app-wide shell) — RUN AFTER the grid system

> App-wide shell change: replace the left `ProductRail` with a horizontal
> top **product bar**, and render each product's existing sub-nav as a
> consistent **second bar** directly beneath it. High blast radius (every
> product + the workspace tier share this shell), so deliver in PHASES
> and verify each product renders before moving on. Branch off main
> (e.g. `feat/nav-two-bar`).
>
> **Run AFTER `CC_GRID_SYSTEM.md`.** That pass makes every grid fill its
> container + share one density. This pass reclaims the ~56px sidebar
> width by moving products to the top — so the container-filling grids
> automatically use the new width with NO rework (that's the whole point
> of doing grids first). Don't change any grid styling here; only the
> shell chrome. Everything (stage-plot, operations sub-nav, channel-list,
> rider, budget Income tab) is now live on main — wire the REAL,
> shipped sub-navs, not placeholders.

## The model (two bars, never three)
- **Bar 1 — product nav (horizontal, top).** Home · Operations · Budget ·
  Advance, with the workspace/artist/tour switchers and search/avatar in
  the same bar. Replaces the 56px left `ProductRail` and reclaims that
  width for content (critical for the wide budget grid).
- **Bar 2 — per-product sub-tabs (top, directly under Bar 1).** Each
  product renders its EXISTING sub-nav here, styled identically across
  products. Settings + Reports-type destinations sit as right-aligned
  corner icons, not equal tabs.
- Sheet/section tabs go at the **top** (Adam's call), Excel-style only in
  the sense of being a tab strip — not at the bottom.

## Hover dropdowns on Bar 1 (one-load jumps)
Each top-bar product reveals its sub-tabs as a **hover/focus dropdown**, so
the user can jump straight to a specific sub-page in a single navigation
(e.g. hover "Operations" → click "Rooming" → land directly on
`/operations/[tourId]/rooming`), instead of clicking the product then the
sub-tab. Rules:
- The dropdown lists exactly that product's Bar-2 items (same source).
- Click navigates directly (one load) to the target route.
- Accessible: opens on hover AND keyboard focus; arrow-key navigable;
  Escape closes; on touch/no-hover, the first tap opens the menu (don't
  rely on hover alone). Use the app's existing menu/popover primitive if
  there is one.
- Bar 2 still renders on the destination page — the dropdown is a
  shortcut, not a replacement.

## Hard rules
- Do NOT change each product's ROUTING mechanism (Budget `?tab=`,
  Operations path segments, Advance `?mode=`). Only move/restyle the
  chrome. Unifying routing is a separate, later refactor — out of scope.
- Keep `ProductShell`'s public props working (`active`, `productName`,
  `artistId`, `homeHref`) so callers don't all need rewriting; change its
  internals (rail → top bar) behind that API where possible.
- Preserve entitlement gating (products hidden by flag), admin-only items,
  and the workspace tier (`WorkspaceTopBar` + `WorkspaceTabs`).
- Mobile PWA (`/m/*`) is OUT OF SCOPE; ensure the new top bar degrades
  acceptably at narrow widths (wrap/scroll), don't build mobile nav.
- Token-clean; `npx eslint` 0 + `tsc --noEmit` clean; build with
  `next build --webpack`. Show diffs + line ranges. Commit nothing.
  Verify EVERY product loads after each phase; don't over-claim.

## Per-product Bar 2 contents (use each product's existing nav source)
- **Home / Artist** (`ProductShell active="home"`): Home · Financials ·
  Channel lists · Files · Riders (the `artists/[id]/(library)/*` set).
- **Operations**: Summary · Personnel · Routing · Channel list · Payroll ·
  Rooming · Files · Riders — already defined in `OperationsSubNav` /
  `OperationsSubNavClient`. Reuse it; just reposition/restyle into Bar 2.
- **Budget**: Summary · Expenses · Income — plus Reports + Settings as
  right-aligned corner icons. NOTE: today Budget's tabs are
  Summary/Budget/Reports/Settings (`BudgetTabNav` + `budget-tab-utils`).
  Income is now a LIVE tab (current order: Summary · Budget · Income ·
  Reports · Settings). For the sub-bar: rename "Budget" → "Expenses",
  keep "Income", and move Reports + Settings to right-aligned corner
  icons. Do NOT add rooming/payroll/flights to Budget — those live in
  Operations; Budget is financial only.
- **Advance**: Overview (tour show list) · and on a show, Show · Builder
  (the existing `?mode=` read/builder toggle). Sections stay data-driven
  inside the builder, not tabs.
- **Workspace** (no tour): Artists · Personnel · Equipment
  (`WorkspaceTabs`) — already a top tab row; just align its styling with
  the new Bar 2 so the whole app reads consistently.

## Phased delivery
1. Build a `TopProductNav` component from the `PRODUCTS` definition in
   `ProductRail.tsx` (Home/Operations/Budget/Advance + Settings), plus a
   generic `ProductSubBar` that takes tab items + an optional right-corner
   icon slot. Style both token-clean, sticky, with an active-underline.
2. Rewire `ProductShell` to render `TopProductNav` (top) + a Bar-2 slot
   instead of the left `ProductRail`. Keep the `<main>` scroll container.
   Verify one product (Budget) end-to-end.
3. Feed each product's existing sub-nav into the Bar-2 slot: Operations
   (`OperationsSubNav`), Budget (`BudgetTabNav` → Summary/Expenses/Income
   + corner Reports/Settings), Advance, Artist library. Verify each.
4. Align the workspace tier (`WorkspaceTopBar`/`WorkspaceTabs`) visually.
5. Delete `ProductRail` once nothing imports it; confirm no dead imports.

## Verify
After each phase: `next build --webpack` succeeds; open Home, Operations
(+ each sub-tab), Budget (each tab), Advance (overview + a show),
Settings/Venues/Bugs, and the workspace tabs — all render with the new
two-bar chrome, no left rail, no console errors. Report what you tested.

# Claude Agent Notes for Lowpass

> Read this before doing anything in this codebase. It captures conventions that have already bitten previous Claude/Cursor agents.

## Stack

- Next 16 + React 19 + TypeScript 5 strict
- Tailwind v4 (with `@theme inline` in `src/app/globals.css`)
- Supabase (Postgres + RLS + Storage)
- Build: `next build --webpack` (Turbopack hangs on the user's Drive filesystem)
- Lint: `eslint`. Typecheck: `tsc --noEmit`.

## Repo layout

```
src/
  app/
    (app)/      ← all authenticated pages; layout in (app)/layout.tsx (pass-through after UX04)
    (auth)/     ← signed-out pages
    api/        ← REST routes (server)
    m/          ← mobile PWA routes (pending UX18+)
  components/
    shell/      ← TopBar, LeftRail, PageShell, SlideOver (UX02/UX03 — shell-v1)
    shell-v2/   ← ProductRail, ProductHeader, ProductShell (Product Split — current)
    data-table/ ← <DataTable> (UX05)
    spreadsheet-grid/ ← <SpreadsheetGrid> (UX06)
    timeline/   ← <TimelineDashboard> (UX07)
    document/   ← <DocumentCanvas> (UX07)
    entity/     ← <EntityChip>, EntityRoutingProvider, slide-over hosts (UX08)
    command-palette/ ← ⌘K palette (UX08b)
    _legacy/    ← retired pre-overhaul code; do NOT import from here (rule has known leaky exceptions in budget — see §"_legacy" below)
  contexts/
    ProductContext.tsx ← which product silo the URL is inside (Phase 1)
    ArtistTourContext.tsx ← active artist+tour state
    DetailPanelContext.tsx
  lib/
    entities/   ← canonical entity registry (UX08+)
    api/        ← server-side data access for canonical entities
    types/      ← canonical entity TS types
    search/     ← ⌘K search providers + fuzzy matcher (UX08b)
    shell/      ← getShellData + per-archetype rail data helpers (UX04)
    entitlements.ts ← useEntitlements() / getEntitlements() — currently hardcoded all-true; Stripe seam
database/
  migrations/   ← sequential SQL migrations — read database/migrations/README.md before adding
docs/
  cursor-prompts/ ← every UX overhaul prompt is here, named CURSOR_PROMPT_UX*.md
  data-model/     ← per-entity schema docs (flights.md, persons.md, rooms.md, gear.md, ...)
  components/     ← contract docs for shared components (DATA_TABLE_CONTRACT.md, SLIDE_OVER_CONTRACT.md, SPREADSHEET_GRID_CONTRACT.md)
  design-tokens.md ← canonical token reference (UX01)
  handover/       ← session-handover docs between Claude agents
```

## Critical conventions

### Migrations — runner is wired

`npm run db:migrate` applies every pending migration in numeric order. Applied migrations live in `public._lp_migrations` keyed by filename + sha256 checksum. Editing an applied migration file is rejected by checksum mismatch — write a new migration that supersedes it instead.

The runner script is `scripts/db-migrate.mjs` (Node, ESM, ~140 lines). Connection string comes from `DATABASE_URL` or `SUPABASE_DB_URL` (service-role only — `_lp_migrations` RLS denies anon and authenticated). Run `npm run db:migrate -- --dry-run` to see what's pending without applying.

The "Adam pastes SQL by hand into Supabase SQL Editor" workflow is retired except for the runner's own bootstrap pair (migrations 067 + 068) which create the tracking table + backfill historical applied rows.

**Read `database/migrations/README.md` before writing any migration.** TL;DR: pick the next sequential number after the highest on `main` AND across active feature branches. Mirror the number in the file's header comment. Idempotent where possible. RLS via existing helpers. Down-migration block at the end. Two real collisions have already happened — don't make a third.

### Design tokens

**All visual values must reference `var(--lp-…)` tokens.** No hardcoded hex colours, font sizes, paddings, z-indexes, or shadows in component code. Token catalogue: `docs/design-tokens.md`. Tokens defined in `src/app/globals.css`.

For transparent variants of brand orange, use **hex+alpha** (`#FF45001a`) or `color-mix(in srgb, var(--lp-orange) X%, transparent)` — never JS string concatenation of CSS vars (`'var(--lp-orange)' + '1a'`) — that breaks at runtime.

### Page archetypes — two shells coexist during the Product Split

Two shell systems are both load-bearing right now:

- **`<PageShell>` (shell-v1, UX02-era)** — the original archetype-based shell. Five archetypes: `list | spreadsheet | dashboard | document | builder`. Used by ~44 pages: workspace-level surfaces (Personnel, Templates, Venues, Bug Reports), legacy `/tours/[id]/*` (unreachable via redirects but still mounted on disk), and the old query-string `/budget?tour_id=` surface.
- **`<ProductShell>` (shell-v2, Product Split)** — the new product-prefixed shell with `ProductRail` + `ProductHeader`. Used by ~17 pages: `/artists/[id]` (Home), `/operations/[tourId]/*`, `/budget/[tourId]/*`, `/advance/[tourId]/*`. Wraps in `ProductProvider` so `useProductContext()` works.

Phase 4 (Operations migration) ports the rest. Until then: new pages under `/operations/`, `/budget/`, `/advance/`, `/artists/[id]` use `ProductShell`. Anything else uses `PageShell`. Don't invent a third.

### Component primitives

- **Lists** → `<DataTable>` (`docs/components/DATA_TABLE_CONTRACT.md`). No custom `<table>` HTML in pages.
- **Spreadsheets** → `<SpreadsheetGrid>` (`docs/components/SPREADSHEET_GRID_CONTRACT.md`). Used for Budget, Payroll, Channel List, Routing.
- **Detail panels** → `<SlideOver>` from `src/components/shell/SlideOver.tsx` (`docs/components/SLIDE_OVER_CONTRACT.md`). Context only — never the primary edit surface (admin tools like Bug Reports are the documented exception). **Do NOT roll your own backdrop/aside chrome.** All entity slide-overs (Flight/Person/Room/Gear/DealMemo/Show/Tour/Template/File/RiderPack) now wrap the `<SlideOver>` primitive — the UX13 sweep target is done.
- **Inline entity references** → `<EntityChip kind={...} id={...} />` (UX08). Click opens the entity's slide-over via `useEntityRouting()`.

### Canonical entities

Five canonical entity kinds: `person`, `flight`, `room`, `gear`, `show`. Each has a registry descriptor in `src/lib/entities/`. **Do not query their tables directly from UI components** — go through `getEntityDescriptor(kind).fetchById()` / `.search()`. Adding a sixth entity kind is a non-trivial change; add it to the registry, the `EntityKind` union, and write a slide-over (using the `<SlideOver>` primitive).

### `_legacy/` directories — leaky on purpose

Two `_legacy/` trees exist:

- `src/components/_legacy/sidebar/` — clean. Pre-UX02 sidebar, retained as reference. Zero importers. Safe to delete.
- `src/_legacy/budget/` — leaky. Pre-budget-redesign tab system. Active code in `src/components/budget/` and `src/lib/shell/rails/` still imports `BUDGET_TABS`, `pushRecentTourId`, and `BudgetDetailShell` from here. The general "do not import from `_legacy/`" rule is violated by load-bearing code. Phase 3 (`feat/product-split-phase3`) is expected to retire most of these imports; a follow-up pass should delete what survives.

Until that follow-up lands, the rule is: don't add NEW imports from `_legacy/`. The existing four are documented exceptions, not licence to add more.

### Auth + RLS

- Site admin gating: `getUserAndAdminStatus()` from `@/lib/site-admin`. Mirror the pattern used in `src/app/(app)/bugs/page.tsx` for any admin-only page.
- Workspace scoping in SQL: always use `public.get_my_workspace_id()` and `public.is_workspace_admin()`. Don't inline `SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()`.

### Hex+alpha for orange tints

Right: `'#FF45001a'` or `'color-mix(in srgb, var(--lp-orange) 5.1%, transparent)'`
Wrong: `'var(--lp-orange)' + '1a'` (concatenation doesn't resolve the var)

### Tour-internal navigation — ProductShell handles it; TourBreadcrumb is legacy

Pages wrapped in `<ProductShell>` (everything under `/operations/[tourId]/`, `/budget/[tourId]/`, `/advance/[tourId]/`) get product-aware navigation from `<ProductHeader>` and `<ProductRail>` automatically. **No explicit `<TourBreadcrumb>` mount is needed** for those pages.

The legacy `<TourBreadcrumb>` component (`src/components/tours/TourBreadcrumb.tsx`) is currently imported by zero pages. It exists for any old `<PageShell>`-wrapped tour-internal page that ever needs to be reached directly. Since the redirects in `next.config.ts` now send every `/tours/[id]/*` URL to its product-prefixed equivalent, those legacy pages are unreachable by users — the requirement is effectively moot.

If you ever DO add a new page directly under `src/app/(app)/tours/[id]/**` (which you almost certainly shouldn't — Phase 4 is porting the rest), mount `<TourBreadcrumb>` per-page (not in `tours/[id]/layout.tsx` — `PageShell`'s `<main overflow:auto>` scroll container breaks sticky mounts in the layout).

## Active project — Product Split

The current architectural shift is the four-product split (Home / Operations / Budget / Advance). UX01–UX22 are merged. Product Split Phase 0–2 are on `main`. Phase 3 (Budget migration) is on `feat/product-split-phase3` awaiting verify+merge. The Advance visual redesign is on `feat/advance-visual-redesign` awaiting verify+merge. Phase 4 (Operations migration) hasn't been written yet.

Each product is URL-prefixed:

- `/artists/[id]` — Home (artist-scoped overview)
- `/operations/[tourId]/*` — Operations (placeholders pending Phase 4)
- `/budget/[tourId]/*` — Budget (placeholders pending Phase 3 merge)
- `/advance/[tourId]/[routingId]` — Advance (live)

Pre-overhaul UX01–UX22 prompts are in `docs/cursor-prompts/`. Active product-split + fix prompts are in `docs/handover/CC_*.md`. State-of-completion as of 2026-05-01 lives in `docs/handover/AUDIT_2026-05-01.md`.

## Things that have bitten agents before

1. **Migration number collisions.** Seven real duplicates exist on `main` already (017, 018, 019, 024, 025, 026, 035). Pick the next sequential number after the highest on `main` AND across active feature branches before writing a new migration. See `database/migrations/README.md` and `docs/handover/CC_MIGRATION_RENUMBER.md`.
2. **Migrations.** As of migration 066/067 there's a runner: `npm run db:migrate` applies pending migrations against `DATABASE_URL`/`SUPABASE_DB_URL`, recording each one in `public._lp_migrations`. Still write SQL idempotently (DROP IF EXISTS / CREATE OR REPLACE / ADD COLUMN IF NOT EXISTS / ON CONFLICT DO NOTHING) — the runner aborts if a migration throws, and idempotent SQL lets re-runs after a partial failure complete cleanly. See `docs/handover/SQL_DRIFT_AUDIT_2026_04_30.md` for the historical drift this fixed.
3. **Direct-pasted tables that have no `CREATE TABLE` migration file.** `rental_inventory`, `rental_jobs`, `rental_job_items`, and `workspace_members` exist in production but are reproducible only by hand on a fresh clone. The rental triplet is targeted in `docs/handover/CC_RENTAL_DENORMALISE.md`. Don't pile more onto this list.
4. **Hex+alpha string concatenation** of CSS vars. Doesn't resolve. Use literal hex+alpha or `color-mix(...)`.
5. **Glob patterns choking on `(app)` parens.** When searching the codebase, use individual paths or grep, not brace globs.
6. **Turbopack ETIMEDOUT on Drive filesystem.** Build must run via `next build --webpack`. Never run build with the default Next 16 Turbopack.
7. **Drive filesystem permission edges.** From the Cowork sandbox, bash sometimes cannot remove `.git/index.lock` or files it just wrote, even with `rm`. The Read/Write/Edit tools work normally — drive edits via those, then have Adam run git operations himself.
8. **Reading content from a `/tmp/` worktree or clone.** The Read tool is scoped to the user's connected folder; bash can reach `/tmp` via `cat`/`sed`. If you make a worktree under `/tmp`, drive your edits via bash, not Read/Edit.
9. **CC over-claiming what shipped.** CC has reported structural redesigns done that weren't actually applied (Phase 2 budget hub redesign, original nav redesign Phase X3). Always include a "verify before claiming" hard rule in CC prompts and have CC name specific files/lines that should change. After CC reports done, open the diff and confirm before merging.
10. **Branch fragmentation.** Work spreads across many branches (`ux01-tokens-foundation`, `test/partner-sync-…`, `feat/product-split-phase{0,1,2,3}`, `feat/advance-visual-redesign`, multiple `fix/*` and `chore/*`). Always confirm which branch you're on before committing.

## When uncertain

Ask the user. The user has explicitly said they prefer clarification over guessed implementations. Don't guess at schema, don't invent token names, don't pick page archetypes for new pages without checking — surface the question.
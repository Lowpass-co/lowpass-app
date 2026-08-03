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
    shell/      ← TopBar, LeftRail, PageShell (shell-v1 — ADMIN ONLY, see below)
    shell-v2/   ← ProductHeader (two-bar: TopProductNav + ProductSubBar), ProductShell (current). ProductRail retired (two-bar nav)
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

### Smoke tests

Per-product smoke checklists live in `docs/smoke-tests/<product>.md`
(advance, budget, operations, etc.). Each test has a stable `XYZ-NN`
ID. Read `docs/smoke-tests/README.md` for the format. When a sprint
ships observable behaviour, land the new test IDs in the same PR;
when a gap closes, move the test out of "Known broken".

### Migrations — hand-applied, no runner

The `npm run db:migrate` runner exists in the repo but is **NOT in use** — Adam has no `DATABASE_URL`/`SUPABASE_DB_URL` in his terminal. **Every migration is pasted by hand into the Supabase SQL Editor, and `public._lp_migrations` is NOT maintained.** Consequences that are now hard rules:

- **Migrations must be idempotent / re-runnable.** Guard everything: `UPDATE … WHERE <col> <> <target>`, `ADD COLUMN IF NOT EXISTS`, `DROP … IF EXISTS`, `CREATE OR REPLACE`, `ON CONFLICT DO NOTHING`. There is no tracking table to prevent a double-paste, so a re-run must be a no-op.
- **Deliver migrations as SQL for Adam to paste.** Do NOT instruct "run `npm run db:migrate`". A migration is "applied" when Adam pastes it, not when a runner records it.
- **Do NOT trust `_lp_migrations` to reflect reality** — it doesn't. Never run the runner casually: with nothing from the 200-block recorded, it would treat the entire 200-block as pending and try to re-apply all of it (idempotent SQL survives that; anything non-idempotent would double-apply or error).
- **Numbering:** next free number ≥ the highest on `main` AND across all active feature branches; **≥200** (clean-break block, see below); mirror the number in the file's header comment; down-migration block at the end. Real collisions have already happened — don't make another.

**Read `database/migrations/README.md` before writing any migration.**

**CLEAN-BREAK NUMBERING (as of 2026-06-04): new migrations start at `200`.** The historical range (≤113 on `main`, plus stray 114/115s across feature branches) is a collision mess. To get a clean run, the next migration written is `200_*.sql` and we continue sequentially from there (`201`, `202`, …). Anything below `200` is legacy — do not add new files in that range. The budget redesign (templates/sections) is the first to use the 200 block.

### Design tokens

**All visual values must reference `var(--lp-…)` tokens.** No hardcoded hex colours, font sizes, paddings, z-indexes, or shadows in component code. Token catalogue: `docs/design-tokens.md`. Tokens defined in `src/app/globals.css`.

For transparent variants of brand orange, use **hex+alpha** (`#FF45001a`) or `color-mix(in srgb, var(--lp-orange) X%, transparent)` — never JS string concatenation of CSS vars (`'var(--lp-orange)' + '1a'`) — that breaks at runtime.

### Two-tier IA + chrome (post IA Cleanup sprint)

Canonical hierarchy:

```
Tier 1 — Workspace (no tour context)
  /artists      ← workspace dashboard, Artists tab (default)
  /personnel    ← workspace dashboard, Personnel tab
  /equipment    ← workspace dashboard, Equipment tab
  /settings     ← gear icon + avatar dropdown
  /venues       ← avatar dropdown
  /bugs         ← avatar dropdown (admin)

Tier 2 — Artist (one artist, multiple tours)
  /artists/[id]                       ← artist home
  /artists/[id]/(library)/*           ← artist library surfaces

Tier 3 — Tour (one tour, multiple shows)
  /operations/[tourId]/*    ← Operations product
  /budget/[tourId]/*        ← Budget product
  /advance/[tourId]/[routingId]
```

The three workspace tabs share chrome via the `(workspace)`
route group at `src/app/(app)/(workspace)/`. Layout
(`(workspace)/layout.tsx`) mounts `WorkspaceTopBar` +
`WorkspaceTabs`. NO `ProductRail` on the workspace tier.

Artist + tour tiers use `<ProductShell>` (shell-v2). The nav
is now **two horizontal bars** (see `CC_NAV_IA_TWO_BAR.md`),
both inside `<ProductHeader>`: Bar 1 = `TopProductNav`
(Home/Operations/Budget/Advance + switchers), Bar 2 =
`ProductSubBar` (the active product's sub-tabs). The old left
`ProductRail` component is **retired** (only the
`ProductRailActive` type name lingers). Bar 1 also exposes a
hover/click dropdown per product as a one-load cross-product
jump shortcut — not a replacement for the persistent Bar 2.
Settings / Venues / Bugs use `ProductShell` with `active={null}`
(no product highlighted).

**Adding a new surface:**
- **Workspace tab** (sibling of Artists / Personnel /
  Equipment): create `src/app/(app)/(workspace)/<name>/page.tsx`
  and add the tab entry to `WorkspaceTabs.tsx`. Chrome
  inherits.
- **Tour-scoped product page**: mount under `/operations/`,
  `/budget/`, or `/advance/` with `<ProductShell active="…">`.
- **Neutral surface** (settings-adjacent / admin /
  low-traffic): `<ProductShell active={null} productName="…">`.
- Don't add to shell-v1 (`<PageShell>` / `listAppPageShell`)
  for anything new.

### Shell-v1 is SCOPED TO ADMIN — not pending retirement

`src/components/shell/*` (`PageShell`, `LeftRail`, `TopBar`,
`ShellTopBarClient`, `app-page-shells`) is **the admin chrome**,
plus two surfaces S-3b will move (`/budget` with no tour id,
`/profile`) and the rider pack editor's
`builderAppPageShell`.

**The retirement idea is CLOSED.** `/admin/shell-playground`
exists to demonstrate shell-v1 — porting it would delete the
thing it documents — and a working admin on old chrome beats a
broken one on new. An open ticket that can never complete is
worse than an honest boundary. Don't reopen it; scope it.

New product code uses `<ShellV3Mount>`. Nothing new goes here.

**The folder does not contain what its name suggests, and this
has nearly caused a catastrophic delete twice.** Two components
were moved OUT for exactly that reason:

- `<SlideOver>` → `@/components/ui/SlideOver` — the app-wide
  detail-panel primitive, 26 callers.
- `<AccountAvatar>` → `@/components/ui/AccountAvatar` — rendered
  by shell-v2's avatar menu, which **shell-v3** mounts.

Same shape as `src/components/tours/`, where four of five
survivors looked like legacy code by name and location. **Before
deleting anything from a folder whose name implies it is dead,
grep each file's exact import path** — a substring match on a
component name will hit `DashboardTourCard` when you searched
for `TourCard`, which is how `TourCard` survived S-4c as a false
positive.

**A reference count of ONE deserves following, not counting.**
Mutual orphans read as live: `DashboardTourList` and
`DashboardTourCard` were each other's only importer, so both
looked referenced until someone asked *who the referrer was*.
The same applies to any count you didn't read — a grep's first
screen said three `/tours` links when there were 32. **Read the
referrers, don't tally them.**

See `docs/handover/IA_HIERARCHY.md` for the full reference.

### Component primitives

- **Lists** → `<DataTable>` (`docs/components/DATA_TABLE_CONTRACT.md`). No custom `<table>` HTML in pages.
- **Spreadsheets** → `<SpreadsheetGrid>` (`docs/components/SPREADSHEET_GRID_CONTRACT.md`). Used for Budget, Payroll, Channel List, Routing.
- **Detail panels** → `<SlideOver>` from `src/components/ui/SlideOver.tsx` (`docs/components/SLIDE_OVER_CONTRACT.md`). Context only — never the primary edit surface (admin tools like Bug Reports are the documented exception). **Do NOT roll your own backdrop/aside chrome.** The design pass + P8 hygiene converted ~24 of the ~26 real slide-overs onto the `<SlideOver>` primitive. Two known stragglers remain: `PersonnelDetailSlideOver` (bespoke 2161-line chrome — JSX-in-title + loader/flush bridge; conversion deferred on visual-parity risk) and `GridSlideOver` (the isolated `/grid-demo` `lp-gso` system, outside this contract's scope). New slide-overs must use the primitive.
- **Inline entity references** → `<EntityChip kind={...} id={...} />` (UX08). Click opens the entity's slide-over via `useEntityRouting()`.

### Canonical entities

Five canonical entity kinds: `person`, `flight`, `room`, `gear`, `show`. Each has a registry descriptor in `src/lib/entities/`. **Do not query their tables directly from UI components** — go through `getEntityDescriptor(kind).fetchById()` / `.search()`. Adding a sixth entity kind is a non-trivial change; add it to the registry, the `EntityKind` union, and write a slide-over (using the `<SlideOver>` primitive).

### Multi-field slide-overs — auto-save vs explicit Save

Sprint 11 §4 adopted `useAutoSave` (`src/lib/forms/useAutoSave.ts`) + `<SaveStatus>` (`src/components/forms/SaveStatus.tsx`) across the four big multi-field slide-overs. Pattern:

- All editable fields fold into a single state shape `T` owned by the hook. Snapshot at open, debounced PATCH on each change, `cancel()` restores the snapshot via one final PATCH.
- Footer becomes `[Remove?] [SaveStatus pill] [Cancel] [Done]`. Cancel restores snapshot + closes; Done flushes any pending save + closes; X / overlay click flushes too (so the last keystroke isn't lost).
- Slide-overs remount via `key={`${id}:${open}`}` so the snapshot resets on entity switch.
- Validation that's hard (network failure, schema mismatch) → throw → `error` pill + Retry. Validation that's transient (mid-typing a number) → `setValidationError` + skip the PATCH; don't throw.

**Hybrid pattern for slide-overs with destructive paths** (`EditTourSlideOver` is the canonical example):

Some fields have cascading consequences — narrowing a tour window orphans routing rows; toggling a sensitive grant exposes data. Auto-saving them would bypass safety gates.

The hybrid pattern splits state into two groups:

1. **Safe fields** (one-shot effects) → `useAutoSave` with `T = { /* safe subset */ }`.
2. **Destructive fields** (cascading effects) → conventional `useState` + an inline explicit Save button next to the field group, gated by the existing confirmation modal.

Example (`EditTourSlideOver`):
- Safe: `name`, `currency`, `continent` → auto-saved.
- Destructive: `start_date`, `end_date` → explicit "Save dates" button + out-of-window confirmation modal listing every routing row that would fall outside the new window.

Cancel restores BOTH groups (snapshot for safe fields via the hook; explicit reset for the destructive ones, which were never PATCHed). The SaveStatus pill in the footer only reflects the auto-saved subset.

When introducing a new slide-over with a destructive path, opt for hybrid rather than full auto-save. Document the safe / destructive split at the top of the file.

**Sensitive-grants policy** (`MemberManageSlideOver`): the visible warning panel + Cancel-restores-snapshot replaces the Sprint 9 confirm-on-Save modal. Future slide-overs that toggle visible-warning state should follow the same pattern — show the consequence inline the moment it's triggered, and rely on Cancel for the safety gate.

### `_legacy/` directories — leaky on purpose

One `_legacy/` tree remains (`src/components/_legacy/sidebar/` was deleted in P8 hygiene):

- `src/_legacy/budget/` — leaky. Pre-budget-redesign tab system. Active code in `src/components/budget/` and `src/lib/shell/rails/` still imports `BUDGET_TABS`, `pushRecentTourId`, and `BudgetDetailShell` from here, and `budget/[tourId]/settlement/page.tsx:18` imports `SettlementTab` from `@/_legacy/budget/SettlementTab`. The general "do not import from `_legacy/`" rule is violated by load-bearing code. A follow-up pass should retire these and delete what survives.

Until that follow-up lands, the rule is: don't add NEW imports from `_legacy/`. The existing four (`BUDGET_TABS`, `pushRecentTourId`, `BudgetDetailShell`, `SettlementTab`) are documented exceptions, not licence to add more.

### Auth + RLS

- Site admin gating: `getUserAndAdminStatus()` from `@/lib/site-admin`. Mirror the pattern used in `src/app/(app)/bugs/page.tsx` for any admin-only page.
- Workspace scoping in SQL: always use `public.get_my_workspace_id()` and `public.is_workspace_admin()`. Don't inline `SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()`.

### Hex+alpha for orange tints

Right: `'#FF45001a'` or `'color-mix(in srgb, var(--lp-orange) 5.1%, transparent)'`
Wrong: `'var(--lp-orange)' + '1a'` (concatenation doesn't resolve the var)

### Tour-internal navigation — ProductShell handles it

Pages wrapped in `<ProductShell>` (everything under `/operations/[tourId]/`, `/budget/[tourId]/`, `/advance/[tourId]/`) get product-aware navigation from `<ProductHeader>` (the two-bar nav) automatically — no per-page breadcrumb mount is needed. The redirects in `next.config.ts` send every `/tours/[id]/*` URL to its product-prefixed equivalent, so the old `<TourBreadcrumb>` component was unreachable and has been **deleted** (P8 hygiene). Don't reintroduce it; if a tour-internal surface needs chrome, wrap it in `<ProductShell>`.

## Active project — pipeline complete

The four-product split (Home / Operations / Budget / Advance) is the app's architecture, and the multi-stage build pipeline that hardened it is **done**: the **MASTER PASS** (rates convergence, FX unify, income-actuals provenance, salvage/nav fixpacks) and the **DESIGN PASS** (surface-by-surface visual redesign across all products) are both COMPLETE and merged to `main`. `main` is the single line of development post the 2026-07-03 consolidation (see `docs/handover/CONSOLIDATION_2026-07-03.md`). P7 (Intake Upgrade) and P8 (this hygiene pass) closed the pipeline.

Nav / IA as it now stands:

- `/artists/[id]` — Home (artist-scoped overview; the artist's touring surfaces are branded **Production**, route group `(home)/production` — not "Library").
- `/operations/[tourId]/*` — Operations. **Routing is the tour landing** (`next.config.ts` redirects `/operations/[id]` → `/operations/[id]/routing`).
- `/budget/[tourId]/*` — Budget (live).
- `/advance/[tourId]/[routingId]` — Advance. One per-show surface with three modes via `<AdvanceModeSwitcher>`: **Build** (`?mode=edit`) / **Advance** (fill/read) / **Share** (packet + intake).

**VENUE RESOLVER RULE:** never read the gated `routing.venue_*` columns (`venue_name` / `venue_phone` / `venue_website` / `venue_capacity`) directly for display — always go through `resolveVenue()` (`src/lib/venues/resolveVenue.ts`), the one live-vs-frozen read path. On the advance read surfaces the venue block prefers the advance's own edited Venue Info values, else `resolveVenue()` — via `resolveAdvanceVenue()` (`src/lib/advance/venue.ts`).

Doc locations: the roadmap + state-of-completion is `docs/handover/ROADMAP_2026-07*` and the pipeline queue is `docs/handover/CC_PROMPTS_QUEUE_2026-07.md`; per-stage specs are the `docs/handover/CC_*.md` files. Pre-overhaul UX01–UX22 prompts are in `docs/cursor-prompts/`.

## Things that have bitten agents before

1. **Migration number collisions.** Seven real duplicates exist on `main` already (017, 018, 019, 024, 025, 026, 035). Pick the next sequential number after the highest on `main` AND across active feature branches before writing a new migration. See `database/migrations/README.md` and `docs/handover/CC_MIGRATION_RENUMBER.md`.
2. **Migrations are hand-applied — see "Migrations — hand-applied, no runner" above.** The `db:migrate` runner exists but is NOT used; Adam pastes SQL by hand and `_lp_migrations` is not maintained. So SQL **must** be idempotent (DROP IF EXISTS / CREATE OR REPLACE / ADD COLUMN IF NOT EXISTS / guarded UPDATE / ON CONFLICT DO NOTHING) — there is no tracking table to stop a double-paste, so every migration must be a safe no-op on re-run. See `docs/handover/SQL_DRIFT_AUDIT_2026_04_30.md` for the historical drift this class of problem caused.
3. **Phantom tables — now resolved (zero remain).** The tables that once existed in production without a `CREATE TABLE` migration have been captured: the `rental_*` triplet in `092_rental_tables_orphan_capture.sql` (+ `095_rental_workspace_denormalise_and_canonical_rls.sql`), and `workspace_members` in `078_permissions_foundation.sql`. A fresh clone now reproduces them from migrations. Don't reintroduce direct-pasted tables — every new table ships a migration.
4. **Hex+alpha string concatenation** of CSS vars. Doesn't resolve. Use literal hex+alpha or `color-mix(...)`.
5. **Glob patterns choking on `(app)` parens.** When searching the codebase, use individual paths or grep, not brace globs.
6. **Turbopack ETIMEDOUT on Drive filesystem.** Build must run via `next build --webpack`. Never run build with the default Next 16 Turbopack.
7. **Drive filesystem permission edges.** From the Cowork sandbox, bash sometimes cannot remove `.git/index.lock` or files it just wrote, even with `rm`. The Read/Write/Edit tools work normally — drive edits via those, then have Adam run git operations himself.
8. **Reading content from a `/tmp/` worktree or clone.** The Read tool is scoped to the user's connected folder; bash can reach `/tmp` via `cat`/`sed`. If you make a worktree under `/tmp`, drive your edits via bash, not Read/Edit.
9. **CC over-claiming what shipped.** CC has reported structural redesigns done that weren't actually applied (Phase 2 budget hub redesign, original nav redesign Phase X3). Always include a "verify before claiming" hard rule in CC prompts and have CC name specific files/lines that should change. After CC reports done, open the diff and confirm before merging.
10. **Branch fragmentation.** Work spreads across many branches (`ux01-tokens-foundation`, `test/partner-sync-…`, `feat/product-split-phase{0,1,2,3}`, `feat/advance-visual-redesign`, multiple `fix/*` and `chore/*`). Always confirm which branch you're on before committing.

## When uncertain

Ask the user. The user has explicitly said they prefer clarification over guessed implementations. Don't guess at schema, don't invent token names, don't pick page archetypes for new pages without checking — surface the question.
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
    shell/      ← TopBar, LeftRail, PageShell, SlideOver (UX02/UX03)
    data-table/ ← <DataTable> (UX05)
    spreadsheet-grid/ ← <SpreadsheetGrid> (UX06)
    timeline/   ← <TimelineDashboard> (UX07)
    document/   ← <DocumentCanvas> (UX07)
    entity/     ← <EntityChip>, EntityRoutingProvider, slide-over hosts (UX08)
    command-palette/ ← ⌘K palette (UX08b)
    _legacy/    ← retired pre-overhaul code; do NOT import from here
  lib/
    entities/   ← canonical entity registry (UX08+)
    api/        ← server-side data access for canonical entities
    types/      ← canonical entity TS types
    search/     ← ⌘K search providers + fuzzy matcher (UX08b)
    shell/      ← getShellData + per-archetype rail data helpers (UX04)
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

### Migrations
**Read `database/migrations/README.md` before writing any migration.** TL;DR: pick the next sequential number after the highest on `main` AND across active feature branches. Mirror the number in the file's header comment. Idempotent where possible. RLS via existing helpers. Down-migration block at the end. Two real collisions have already happened — don't make a third.

### Design tokens
**All visual values must reference `var(--lp-…)` tokens.** No hardcoded hex colours, font sizes, paddings, z-indexes, or shadows in component code. Token catalogue: `docs/design-tokens.md`. Tokens defined in `src/app/globals.css`.

For transparent variants of brand orange, use **hex+alpha** (`#FF45001a`) or `color-mix(in srgb, var(--lp-orange) X%, transparent)` — never JS string concatenation of CSS vars (`'var(--lp-orange)' + '1a'`) — that breaks at runtime.

### Page archetypes
Every page wraps in `<PageShell>` (UX02) with one of five archetypes: `list | spreadsheet | dashboard | document | builder`. The `LeftRail` variant is determined by the archetype. Don't invent bespoke layouts. See `docs/cursor-prompts/UX_OVERHAUL_ROADMAP.md` §3.

### Component primitives
- **Lists** → `<DataTable>` (`docs/components/DATA_TABLE_CONTRACT.md`). No custom `<table>` HTML in pages.
- **Spreadsheets** → `<SpreadsheetGrid>` (`docs/components/SPREADSHEET_GRID_CONTRACT.md`). Used for Budget, Payroll, Channel List, Routing.
- **Detail panels** → `<SlideOver>` from `src/components/shell/SlideOver.tsx` (`docs/components/SLIDE_OVER_CONTRACT.md`). Context only — never the primary edit surface (admin tools like Bug Reports are the documented exception). **Do NOT roll your own backdrop/aside chrome** — the four entity slide-overs (Flight/Person/Room/Gear) currently do this and it's marked for sweep in UX13. Don't add a fifth.
- **Inline entity references** → `<EntityChip kind={...} id={...} />` (UX08). Click opens the entity's slide-over via `useEntityRouting()`.

### Canonical entities
Five canonical entity kinds: `person`, `flight`, `room`, `gear`, `show`. Each has a registry descriptor in `src/lib/entities/`. **Do not query their tables directly from UI components** — go through `getEntityDescriptor(kind).fetchById()` / `.search()`. Adding a sixth entity kind is a non-trivial change; add it to the registry, the `EntityKind` union, and write a slide-over (using the `<SlideOver>` primitive).

### Auth + RLS
- Site admin gating: `getUserAndAdminStatus()` from `@/lib/site-admin`. Mirror the pattern used in `src/app/(app)/bugs/page.tsx` for any admin-only page.
- Workspace scoping in SQL: always use `public.get_my_workspace_id()` and `public.is_workspace_admin()`. Don't inline `SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()`.

### Tour-internal pages require `<TourBreadcrumbServer>`
Every page under `src/app/(app)/tours/[id]/**` must mount `<TourBreadcrumbServer tourId={tourId} />` at the top of its content tree. The mount **cannot live in `tours/[id]/layout.tsx`** because `PageShell` creates a `<main overflow:auto>` scroll container — a sticky element mounted in the layout sits outside that scroll context and breaks against the TopBar's stacking. Mounted per-page (inside main), sticky `top:0` works as intended. See the Phase D commit (`e347a5f`) for the pattern. If you're adding a new tour-internal page and skip this, the user loses the `← Artist › Tour › Page` orientation strip and the `[Back to tour]` escape hatch.

### Hex+alpha for orange tints
Right: `'#FF45001a'` or `'color-mix(in srgb, var(--lp-orange) 5.1%, transparent)'`
Wrong: `'var(--lp-orange)' + '1a'` (concatenation doesn't resolve the var)

## UX overhaul context

The active project on this repo is the UX overhaul (UX01 through UX21). Roadmap: `docs/cursor-prompts/UX_OVERHAUL_ROADMAP.md`. Each prompt is `docs/cursor-prompts/CURSOR_PROMPT_UX<NN>_<TOPIC>.md`. Run them in numeric order; each is self-contained but later ones depend on earlier ones.

State at last update (2026-04-27, after UX12 + this fix branch):
- UX01–UX08 merged
- UX08b merged (Command Palette)
- UX09–UX12 merged on `test/partner-sync-20260420-165518` (with `fix/ux12-migration-renumber` cleanup)
- UX13 in flight (list pages re-skin)
- UX14 onwards not started

## Things that have bitten agents before

1. **Migration number collisions.** Two real cases (UX09/10/11 used 033/034/035; UX12 used 048). Always check `main` AND active feature branches before numbering. See `database/migrations/README.md`.
2. **Hex+alpha string concatenation** of CSS vars. Doesn't resolve. Use literal hex+alpha or `color-mix(...)`.
3. **Glob patterns choking on `(app)` parens.** When searching the codebase, use individual paths or grep, not brace globs.
4. **Turbopack ETIMEDOUT on Drive filesystem.** Build must run via `next build --webpack`. Never run build with the default Next 16 Turbopack.
5. **Reading content from a `/tmp/` worktree or clone.** The Read tool is scoped to the user's connected folder; bash can reach `/tmp` via `cat`/`sed`. If you make a worktree under `/tmp`, drive your edits via bash, not Read/Edit.
6. **Rolling your own slide-over chrome.** All four entity slide-overs (Flight/Person/Room/Gear) currently re-implement backdrop/aside/header/footer instead of using the `<SlideOver>` primitive. Each has a `// TODO(UX13)` marker. UX13 is the sweep target. Don't add a fifth.
7. **Branch fragmentation.** UX work has been spread across `ux01-tokens-foundation`, `test/partner-sync-20260420-165518`, `claude/nostalgic-khorana-144dcb`, and various fix branches. Always confirm which branch you're on before committing.

## When uncertain

Ask the user. The user has explicitly said they prefer clarification over guessed implementations. Don't guess at schema, don't invent token names, don't pick page archetypes for new pages without checking — surface the question.

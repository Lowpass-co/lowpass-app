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
    command-palette/ ← ⌘K palette (UX08b — in flight)
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
  data-model/     ← per-entity schema docs (flights.md, persons.md, rooms.md, ...)
  components/     ← contract docs for shared components (DATA_TABLE_CONTRACT.md, SLIDE_OVER_CONTRACT.md, SPREADSHEET_GRID_CONTRACT.md)
  design-tokens.md ← canonical token reference (UX01)
```

## Critical conventions

### Migrations
**Read `database/migrations/README.md` before writing any migration.** TL;DR: pick the next sequential number after the highest on `main`, mirror it in the file's header comment, idempotent where possible, RLS via existing helpers, down-migration block at the end.

### Design tokens
**All visual values must reference `var(--lp-…)` tokens.** No hardcoded hex colours, font sizes, paddings, z-indexes, or shadows in component code. Token catalogue: `docs/design-tokens.md`. Tokens defined in `src/app/globals.css`.

For transparent variants of brand orange, use **hex+alpha** (`#FF45001a`) or `color-mix(in srgb, var(--lp-orange) X%, transparent)` — never JS string concatenation of CSS vars (`'var(--lp-orange)' + '1a'`) — that breaks at runtime.

### Page archetypes
Every page wraps in `<PageShell>` (UX02) with one of five archetypes: `list | spreadsheet | dashboard | document | builder`. The `LeftRail` variant is determined by the archetype. Don't invent bespoke layouts. See `docs/cursor-prompts/UX_OVERHAUL_ROADMAP.md` §3.

### Component primitives
- **Lists** → `<DataTable>` (`docs/components/DATA_TABLE_CONTRACT.md`). No custom `<table>` HTML in pages.
- **Spreadsheets** → `<SpreadsheetGrid>` (`docs/components/SPREADSHEET_GRID_CONTRACT.md`). Used for Budget, Payroll, Channel List, Routing.
- **Detail panels** → `<SlideOver>` (`docs/components/SLIDE_OVER_CONTRACT.md`). Context only — never the primary edit surface.
- **Inline entity references** → `<EntityChip kind={...} id={...} />` (UX08). Click opens the entity's slide-over via `useEntityRouting()`.

### Canonical entities
Five canonical entity kinds: `person`, `flight`, `room`, `gear`, `show`. Each has a registry descriptor in `src/lib/entities/`. **Do not query their tables directly from UI components** — go through `getEntityDescriptor(kind).fetchById()` / `.search()`. Adding a sixth entity kind is a non-trivial change; add it to the registry, the `EntityKind` union, and write a slide-over.

### Auth + RLS
- Site admin gating: `getUserAndAdminStatus()` from `@/lib/site-admin`. Mirror the pattern used in `src/app/(app)/bugs/page.tsx` for any admin-only page.
- Workspace scoping in SQL: always use `public.get_my_workspace_id()` and `public.is_workspace_admin()`. Don't inline `SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()`.

### Hex+alpha for orange tints
Right: `'#FF45001a'` or `'color-mix(in srgb, var(--lp-orange) 5.1%, transparent)'`
Wrong: `'var(--lp-orange)' + '1a'` (concatenation doesn't resolve the var)

## UX overhaul context

The active project on this repo is the UX overhaul (UX01 through UX21). Roadmap: `docs/cursor-prompts/UX_OVERHAUL_ROADMAP.md`. Each prompt is `docs/cursor-prompts/CURSOR_PROMPT_UX<NN>_<TOPIC>.md`. Run them in numeric order; each is self-contained but later ones depend on earlier ones.

State at last update:
- UX01–UX08 merged (`ux01-tokens-foundation` branch + onwards)
- UX09–UX11 on `test/partner-sync-20260420-165518` (then `fix/migration-renumber` after the renumber)
- UX08b in flight (Command Palette)
- UX12 onwards not started

## Things that have bitten agents before

1. **Migration number collisions** when working on parallel branches. Fixed once via `fix/migration-renumber`. Don't repeat.
2. **Hex+alpha string concatenation** of CSS vars. Doesn't resolve. Use literal hex+alpha or `color-mix(...)`.
3. **Glob patterns choking on `(app)` parens.** When searching the codebase, use individual paths or grep, not brace globs.
4. **Turbopack ETIMEDOUT on Drive filesystem.** Build must run via `next build --webpack`. Never run build with the default Next 16 Turbopack.
5. **Reading content from a `/tmp/` worktree.** The Read tool is scoped to the user's connected folder; bash can reach `/tmp` via `cat`/`sed`. If you make a worktree under `/tmp`, drive your edits via bash, not Read/Edit.

## When uncertain

Ask the user. The user has explicitly said they prefer clarification over guessed implementations. Don't guess at schema, don't invent token names, don't pick page archetypes for new pages without checking — surface the question.

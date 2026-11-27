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
    shell-v2/   ← SURVIVORS ONLY (S-3b): switcher + avatar menu + helpers that shell-v3 mounts. ProductShell/ProductHeader/two-bar nav/WorkspaceTopBar/WorkspaceTabs DELETED
    shell-v3/   ← THE canonical shell: AppShellV3 + TopBarV3 + NavRail, mounted via <ShellV3Mount>. IA lives in src/lib/nav/ia.ts
    data-table/ ← <DataTable> (UX05)
    spreadsheet-grid/ ← <SpreadsheetGrid> (UX06)
    timeline/   ← <TimelineDashboard> (UX07)
    document/   ← <DocumentCanvas> (UX07)
    entity/     ← <EntityChip>, EntityRoutingProvider, slide-over hosts (UX08)
    command-palette/ ← ⌘K palette (UX08b)
    (no _legacy/ — retired code is deleted, not parked; see §"_legacy — gone")
  contexts/
    ProductContext.tsx ← which product silo the URL is inside (Phase 1)
    ArtistTourContext.tsx ← active artist+tour state
    DetailPanelContext.tsx
  lib/
    entities/   ← canonical entity registry (UX08+)
    api/        ← server-side data access for canonical entities
    types/      ← canonical entity TS types
    search/     ← ⌘K search providers + fuzzy matcher (UX08b); pages.ts = pages + actions from ia.ts (Nov 2026)
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
  /venues       ← workspace sidebar (left the avatar menu Nov 2026)
  /templates    ← workspace sidebar — advance templates (Nov 2026)
  /bugs         ← You sidebar, "Report a bug" (left the avatar menu Nov 2026)

Tier 2 — Artist (one artist, multiple tours)
  /artists/[id]                       ← artist home
  /artists/[id]/(library)/*           ← artist library surfaces

Tier 3 — Tour (one tour, multiple shows)
  /operations/[tourId]/*    ← Operations product
  /budget/[tourId]/*        ← Budget product
  /advance/[tourId]/[routingId]
```

**S-3b (2026-08-04): ONE SHELL, EVERYWHERE.** Every authenticated
surface outside `/admin` and `/m` renders `<AppShellV3>` (top bar +
IA-driven left rail), mounted via `<ShellV3Mount>` from a layout.
The IA — every scope, rail item, href, matcher and permission gate —
is DATA in `src/lib/nav/ia.ts`; components render it and know no URLs.

Where the mounts live:
- `(workspace)/layout.tsx` → /artists, /personnel, /assets,
  /equipment, /venues (workspace scope; the rail REPLACED the old
  WorkspaceTabs — the "no rail at workspace tier" rule is reversed,
  Adam's call 2026-08-04).
- `(you)/layout.tsx` → /settings, /settings/members,
  /settings/ai-limits, /profile, /bugs (You scope).
- The three tour layouts + `artists/[id]/layout.tsx` (unchanged).
- The tourless landings /operations, /budget, /advance mount
  `<ShellV3Mount landing>` in their pages: workspace rail visible,
  live picker until a tour is picked.
- /rider-packs/[id] (since the Nov 2026 riders rebuild: the CHANNEL-LIST
  document editor only — an old rider pack redirects) is ARTIST scope —
  `RiderPackEditorView` wraps itself in `<ShellV3Mount>` with the
  pack's artist id; the rail lights "Riders & specs".

**ONE TOUR RAIL (Oct 2026 UX simplification — Adam's call), regrouped Nov
2026 around what Lowpass is for:** Tour (Advance) · Budget · Production ·
Logistics · Setup (Tour settings). The pill is DELETED and
`railFor('tour', *)` returns one `TOUR_RAIL`. **Schedule is not a
destination** (Master Tour / Daysheets own the itinerary — Adam won't ask for
it twice): the day editor is Tour settings › Dates & routing
(`/operations/[id]/routing`), beside Details (`/operations/[id]/settings`) and
Money (`/budget/[id]?tab=settings`), joined by `<TourSettingsTabs>`. **A tour
opens on `tourHomeHref()`** (ia.ts) — the Overview, `/operations/[id]/overview`
— the same place every time; never resolve
it from localStorage (`lastProduct` is only for the workspace Resume button).
Region and currency lists for tour editors live in `src/lib/tours/regions.ts`
/ `src/lib/currencies.ts` — one list each. `TourMode`
/ `modeForPath` survive only as URL classification (isShelledPath, tests);
nothing renders a mode. **There are no disabled rail items** — `RailItem.href`
is non-nullable, so an unbuilt page cannot be added to the nav; build the page
first. Page titles match the rail labels (Schedule, Crew, Hotels & rooming,
Travel, Gear, …), use `.lp-page-title` (sans, title case, `--lp-text-2xl`) with
no per-page fontSize, and never repeat the tour name (the top bar shows it).
**No instruction paragraphs under page titles** (Nov 2026, Adam: "that looks
AI"). A title stands alone; a line under it is only for FACTS (counts, dates —
e.g. Advance's "12 shows · 3 to review"), never how-to copy. Admin pages,
empty states and genuine blocked-state messages are exempt.

**Adding a new surface:** add/extend a rail item in
`src/lib/nav/ia.ts` (that is the ONLY place nav strings live), put
the page under the layout for its scope, done — chrome inherits. If
the page carries a left rail of its own, add its path to
`hasOwnRail()`. Never mount per-page chrome, never add to shell-v1
(`<PageShell>` / `listAppPageShell`) for anything new.

Deleted in S-3b (do not resurrect): `ProductShell`, `ProductHeader`,
`TopProductNav`, `WorkspaceTopBar`, `WorkspaceTabs`,
`PhaseScaffoldPlaceholder`, `NewTourButton`, `productNav.ts`,
`builderAppPageShell`, the shell-v2 barrel `index.ts`. Still ALIVE in
`shell-v2/` (shell-v3 mounts them): `ArtistTourSwitcher*`,
`WorkspaceSwitcher`, `ProductHeaderAvatarMenu`, `ProductSubBar`
(budget's tab strip), `TourEditorModal`, `TourVisitTracker`,
`HydrateTourArtist`, `RememberTourProduct`, `SelectTourPrompt`,
`WorkspaceTourRedirect`, `TourIdentityChip`, `TourDeleteConfirmationModal`,
`ArtistCreateSlideOver`.

### Shell-v1 is SCOPED TO ADMIN — not pending retirement

`src/components/shell/*` (`PageShell`, `LeftRail`, `TopBar`,
`ShellTopBarClient`, `app-page-shells`) is **the admin chrome** —
and since S-3b, ONLY the admin chrome: `/budget` (tourless),
`/profile` and the rider pack editor all moved to `<ShellV3Mount>`,
and `builderAppPageShell` was deleted with its last caller.

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

**A reference count of ZERO deserves following too — and for the
opposite reason.** One means "who is the referrer?"; zero means
"then nothing is checking this." Unexercised code can be wrong
indefinitely with no signal, because every signal we have —
errors, tests, user reports — requires something to run it.

The worked example is `/api/budget/exchange-rate`, and it is the
good one precisely because the code was *fine*: two vendors with
an ordered fallback, a documented admin-refresh POST seam, clean
error mapping. It also 502'd for every currency pair for every
caller, for months, because leg two parsed the PAID vendor shape
(`conversion_rates`) against the FREE endpoint (`rates`). It went
unnoticed because the GET had no caller until an equipment
feature added one, and the POST seam has **zero** callers to this
day. **Code quality is not evidence when nothing runs it.**

**Corollary: when a failure mode is SILENT, prevention beats
detection.** Both vendor legs signalled failure by returning
`null` rather than throwing, so there was no exception, no log
line, no 500 — nothing to detect. You cannot alert on an absence
nobody emits. So the defences that work are the ones that make
the bad state unrepresentable or unaddable in the first place:
the middleware allow-list, the P0-C route-guard ratchet
(`src/lib/auth/route-guard-coverage.test.tsx`), and
`resolveQuoteDisplay()` deriving a currency symbol from the same
fact that decides the number, so a £ can never sit over a $
figure. Where prevention genuinely isn't available, buy a
positive assertion instead — something must claim a NUMBER comes
back for a known pair. "Returns 200" would have passed that route
throughout; the 200 was never the problem.

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

### `_legacy/` — gone

`src/_legacy/budget/` was deleted in the money repair (Oct 2026), along with
every other unreachable budget surface (`spreadsheet-view/*Grid`,
`tour-overview/`, `tour-wide/`, `summary/`, the pre-Grid budget components,
`commission-context`). Each was found by an import-graph walk from the app's
entry points, not by name — and each carried its own copy of the money
formula, which is how the app came to have four commission formulas. Do not
recreate a `_legacy/` tree: delete dead code instead of parking it.

### Budget sheet — one page (Oct 2026, Adam's Sheets template)

- `/budget/[tourId]?tab=budget` is THE budget: `<BudgetSheetTop>` above the
  grid — since Nov 2026 (Adam) ONE light panel in the tour Overview's style
  (`budgetSheet.css`): Income · Total expenses · Net once, "Where it goes"
  (per section: spent of proposed + bar, click scrolls the grid), then FOLDED
  rows Commissions · Overheads · Income that open their editors in place.
  Don't bring back the side-by-side Totals / Commissions tables or repeat the
  bottom line (the toolbar meter is hidden on this tab for that reason).
- **Other income is typed in the summary** (Income fold: one row per source —
  name, proposed, actual, Commission tick, remove; **+ Add income** makes the
  tour's one `kind: 'income'` section on first use). The GRID IS COSTS ONLY:
  the page passes it lines without `isIncomeRow` and sections without the
  income kind — don't put income back in the grid (Nov 2026, Adam).
- The Budget tab has NO title block (the rail says Budget). Receipts on the
  budget: "N need details" + **Add receipts** in the toolbar band
  (`BudgetContextBand` `actions`); progress under the band (`ReceiptDropProvider` / `AddReceiptsButton` /
  `ReceiptDropActivity`). A file dropped ANYWHERE on the page is a receipt
  unless a grid row took it (`defaultPrevented`) — never re-add a drop box
  under the grid, and never let a row drop upload twice (tested).
- **Receipts land in real sections** (Nov 2026, Adam): a hotel bill attaches
  to its hotel's automatic line (`matchHotel`, src/lib/budget/hotelMatch.ts —
  by name, else by date inside exactly one stay); the apply route ALWAYS sends
  `section_id` for a new line (the old code sent only the name → Uncategorised).
  Hotels ≡ Accommodation in `receiptSection` aliases.
- The Summary card dashboard is DELETED; `?tab=summary|reports` resolve to
  `budget`. Sheet figures are `computeBudgetPnl` recomputed client-side;
  section rows are `sheetTotalsBySection` (Σ pinned to `baseExpenses` by test).
- Salary / per-diem rows carry READ-ONLY rate columns from
  `loadPayrollRateFacts` (same inputs as the derived lines). Rates are edited
  on Payroll only.
- Saved budget versions are self-contained snapshots (migration 270 dropped
  the snapshot→live FKs). Deleting a live line/section never touches a saved
  version; drafts are tidied by trigger.

### Budget row delete (Nov 2026, Adam)

- Grid prop `onDeleteRows(uids)` — fired by the row's hover bin, right-click →
  Delete, ⌘⌫ / Ctrl+Backspace and More → Delete, always with the rows
  HIGHLIGHTED ON SCREEN. Plain Delete / Backspace still only clears cells.
- Every display index (selection, `data-r`, the editor, fill, copy / paste /
  clear, row delete) resolves through `viewRows()` (`src/components/grid/gridModel.ts`)
  — inside Grid, `flat` IS `shownRows`. It used to be section order whatever
  the grouping, so grouped by status / phase, TYPING saved to a different row
  from the one highlighted, and ⤢ Open opened another line (grouped rows were
  drawn with a stand-in section, `_si` 0) — both fixed Nov 2026, tested. `groupedBuckets()` is the
  one place grouped order is decided (the renderer reads it too). Never index
  display rows with `flatRows()` directly.
- `BudgetGridView` hides the rows, shows "Deleted N rows · Undo" for 6 s, THEN
  sends `DELETE /api/budget/line-items?ids=` (keepalive; sent at once on
  unmount / pagehide). Undo never re-creates a line — nothing was deleted yet.
- Automatic lines (`isDerivedLine`) are never deleted: the client says where
  they come from (`planRowDelete`), the server keeps them (`kept`, or 409
  DERIVED_LINE when all are automatic). Locked budget → 409 VERSION_LOCKED.
  Rows with actuals ask first (their transactions + documents cascade).
- The Grid remounts on `allLines.length` (server rows + optimistic adds /
  deletes), not `lines.length` — keyed on the server count, a just-added or
  just-deleted row didn't show until the next refresh.
- Workbook import drops totals and blanks (`skipRowReason`) and offers
  percentage / no-amount rows UNTICKED (`reviewHint`).

### Grid right-click (Nov 2026, Adam: "add right click to the grid, with options")

- Every right-click in `<Grid>` opens a `<GridMenu>`, never the browser's —
  except inside a cell being typed in (spellcheck / paste stay). The row owns
  it (`onRowContextMenu`), so the locked Estimate, # and receipts get it too.
  - **Cell**: Copy · Paste · Clear · Open · Add line to "<section>" · Delete
    row(s). Off a cell (#, receipts): no cell ops; Delete = that row.
  - **Section header**: Rename · Add line · Move up / down · Delete section.
    `isFixedSection` (Budget: "Uncategorised") → only Add line. Delete asks
    the host (`onDeleteSection`) — no prop, no item.
  - **Column header**: Hide column (not # / the reference block) · Columns… ·
    Reset column widths.
- Right-click inside the highlight (or another column of several highlighted
  rows) keeps it; anywhere else moves it to the clicked cell first — the menu
  always acts on what's highlighted.
- **Clear commits through `onEdit`** like typing (it used to change only the
  screen). Paste and Clear obey typing's guards (`cellWritable`: ro unless
  overridden, version-locked Estimate, a derived section's Estimate) and
  never write computed / structural cells; Clear also skips pick-lists
  (status / dropdown — the grid can't know their "none").
- `GridMenu` items take `disabled` (with the reason as `hint`), `hint`
  (shortcut), `danger`, `sep`; config takes `title` and `gap`. It flips /
  pulls itself back on screen.
- **Delete section** (Budget): refused when the section holds automatic lines
  (`planSectionDelete`, src/lib/budget/rowDelete.ts — client and the DELETE
  route both use it, 409 DERIVED_LINES); 409 VERSION_LOCKED on an approved
  budget; 403 when RLS lets you read it but not delete it (it used to say
  204). Its lines move to Uncategorised (FK SET NULL); nothing is deleted.

### Keyboard + speed (Nov 2026, Adam)

- **⌘↵ / Ctrl+↵ presses OK everywhere** — ONE listener, `<SubmitShortcut>` in
  the root layout (`src/lib/keyboard/submitShortcut.ts`). From the focused
  field: a `<form>` → its submit; a `role="dialog"` (Modal, SlideOver, the
  grid's prompt) or a `data-submit-scope` block → its primary button
  (`data-submit` › `type="submit"` attribute › `<Button variant="primary">`
  (`data-variant`) › the one orange button). Two candidates = nothing. Never
  from a search box / page body, never inside a grid. A new inline editor that
  isn't a form or dialog: mark it `data-submit-scope` (+ `data-submit` on OK).
- **`<SpreadsheetGrid>` keeps the keyboard** (Payroll): closing an editor
  hands focus back to the grid (it fell to `<body>`, so Tab went to the Days
  paint chips and arrows scrolled the page); the focused cell scrolls into
  view; **Backspace / Delete** clears the highlight (numbers → 0, text →
  blank; pick-lists / checkboxes untouched). `rowOpenLabel` names the
  right-click open ("Open full profile" on Payroll).
- **Budget sections are optimistic**: Grid `onAddSection(name, tempUid)` —
  the grid draws the section at once under `tmp-…`; `BudgetGridView` saves in
  the background and every op on it (rename, add line, move, delete) awaits
  the real id (`realSectionId`). Created / renamed sections overlay the server
  list until a refresh carries them; the Grid key counts SERVER sections.
  Never go back to POST → `router.refresh()` → remount for a section: that was
  seconds per add and lost renames typed during the remount.
- **Line Status is retired on the budget** (Adam: "won't be updated ever"): no
  column, no panel field (`slideStatuses={false}`), no Status grouping. The DB
  column stays, unshown.

### Money — one writer, one formula (money repair, Oct 2026)

- **Automatic budget lines** (hotels, salaries, per diems, flights, gear) are
  written ONLY by `reconcileDerivedBudgetLines`
  (`src/server/budget/reconcileDerivedLines.ts`), whose rules live in the pure
  planner `src/lib/budget/derivedPlan.ts`. Any route that writes a source table
  calls `refreshDerivedLines(...)` (or is wrapped in `withDerivedRefresh`)
  after it succeeds. Never write a derived line anywhere else.
- **The P&L** is `computeBudgetPnl`. Server surfaces get it through
  `loadTourPnl` (`src/server/budget/loadTourPnl.ts`). Never re-derive income,
  commissions or overheads in a route.
- **Transaction sums** are converted into the line's currency
  (`src/lib/budget/moneyContext.ts`). Never `reduce` raw amounts across lines
  or transactions that may differ in currency.
- **Payroll paints** send only the changed cells (`changes`); the server merges
  them (`payroll_merge_day_statuses`, migration 269).
- **Rates are typed in ONE place: Payroll → Summary** (`/api/budget/rate-lines`).
  Every other surface (Crew panel, person library, crew My schedule) shows them
  read-only and links to Payroll (`?focus=<card id>`). A new tour card is seeded
  from the person's last tour (`src/server/payroll/seedRateCard.ts`); the library
  "Default day rates" (`standard_rates`) are retired. Don't add a rate input
  anywhere else (Oct 2026, Adam).
- **A tour's currency changes ONLY through `changeTourCurrency`**
  (`src/server/tours/currency.ts`, called by PATCH /api/tours/[id] — Tour
  settings › Details and Budget › Money's Currency card both send it). It
  fetches a live old → new rate and calls `change_tour_currency()` (migration
  297), which restates every `budget_fx_rates` row and every
  `locked_fx_rate` (lines + income) in one transaction, then rebuilds the
  automatic lines. Never write `tours.currency` directly: stored rates are
  "1 X = r <tour currency>", so flipping the code alone misreads all of them.
  Amounts with no currency of their own keep their numbers (£350 → $350).
- **"Show in" (?display=) is a VIEW**: the grid AND `<BudgetSheetTop>`
  convert (`convertVia`); while converted the summary is read-only (no $ typed
  into a £ field) and says so. It never changes the tour's currency.
- **FX is live, never typed.** `budget_fx_rates` is filled by
  `src/server/budget/liveFx.ts` (hourly on budget load + Settings "Refresh now");
  there is no manual FX endpoint. Actuals keep their `locked_fx_rate`.
- Tests for all of the above run against `src/test-utils/fakeSupabase.ts`.

### Tour templates — new-tour "Budget & advance" step (Nov 2026, Adam)

- The lists live in ONE file, `src/lib/templates/tourTemplates.ts`: six budget
  templates by scale (Support tour, Club, Theatre, Arena, Stadium, Press tour),
  the percentage fields (blank = 0%, suggestions for insurance / contingency /
  merch cost of goods), and four advance starters (Headline / Support / Festival
  show day, Day off). Migration 280 seeds the budget templates from it — the
  parity test fails if the two drift; regenerate the SQL rather than hand-edit.
- Template section names are a contract with `reconcileDerivedBudgetLines`:
  Salaries, Per Diems, Hotels (alias of Accommodation), Transport (takes
  flights), Production (takes gear hire). Never add a manual Flights / salary /
  per-diem / hotel line to a template — those are automatic and would double.
- Creating a tour POSTs `/api/tours/[id]/start-from` (`startTourFromTemplates`),
  which is additive and re-runnable. A tour's own advance choice lives in
  `tour_advance_day_templates` and beats the workspace day-type mapping.
- Retired system templates keep their rows (`retired_at`) — saved budgets may
  point at them; `orderTemplates` hides them.

### Income & settlements — one page, one deal (Nov 2026, Adam — migration 286)

- `/budget/[id]?tab=income` is ONE page (`ShowMoneyClient`,
  `src/components/income/`): shows on the left, the picked show (`?show=`) on
  the right — **Deal — expected** · **On the night — actual** · **Payment**.
  `/budget/[id]/settlement` redirects there. The Income grid, its deal
  slide-over, the Income/Settlements switch and `SettlementWalkClient` are
  deleted.
- **One deal per show, on `budget_income`.** One list
  (`src/lib/income/deal.ts`): FLAT (Flat guarantee — festival too), VS, PLUS,
  DOOR; `normaliseDealType` maps old words; the income route refuses others.
  ONE escalator, `tieredShare` (higher % above N tickets, marginal), used by
  BOTH the projection engine (Expected) and `computeBoxOffice` (the night).
  The settlement's migration-262 deal columns are unread and unwritten.
- **Actual money is typed only on the settlement** (the walk); the settlement
  route carries it to `budget_income.actual_*`. No Manual override. VIP is the
  one exception (no settlement figure): its actual is saved on the income row
  and does NOT mark the row manual.
- Settlement POST sets `status` only when the request says so (saves used to
  reset reconciled → pending).
- Status rules are pure in `src/lib/income/showMoney.ts` — untouched shows are
  Upcoming / To settle, never "Settled" or a green 0.
- **Edits show at once; saves queue behind** (Nov 2026, Adam: "data entry is
  super slow… if I edit before the new thing displays, it overwrites it").
  `ShowMoneyClient` keeps its own income + walks and applies every edit
  locally (`applySettlementPatch` / `recomputeWalk`, showMoney.ts — same maths
  as the server); it NEVER `router.refresh()`es after a save (only after an
  error, and after Catch up). Every write for a show — deal, VIP, settlement,
  lines, the Σ deductions push — goes through ONE queue per show
  (`createSaveQueue`, src/lib/income/saveQueue.ts): in order, edits typed
  meanwhile folded into the next save. Reason: `/api/budget/income` rewrites
  the WHOLE row from what it read, and the settlement route writes `actual_*`
  onto that same row — two saves in flight clobbered each other. Don't add a
  write on this page that bypasses the queue. (Two people editing one show at
  once can still race on the server — the income route isn't atomic.)
- **Boxes are text** (`NumInput` / `NumField`, moneyUi.tsx): no spinners;
  formatted at rest (`kind`: money "US$4,500" / pct "37%" / count), plain
  while typing; a 0 that means "not set" shows "—" (`zeroIsBlank`, off for
  comps / tickets sold). Rules: src/lib/income/amountText.ts.
- **Withholding on the night**: Expected takes withholding off; the night only
  subtracts deduction LINES. `withholdingToAdd` offers "+ Withholding X" on the
  Deductions row when the deal has a % and the night has no withholding line;
  Fill from the deal (`fillPlan`) adds it too.
- Known, unchanged: the income POST still pre-fills `actual_guarantee` from the
  deal on first save (#4), so the budget's ACTUAL income counts a show's
  guarantee before it's played. The page ignores that for status.

### One person record (Nov 2026, Adam — migration 285)

- **People (`personnel`) is the master.** `persons` is a copy the database
  keeps (trigger `personnel_mirror_person`: name, Nickname → preferred_name,
  pronouns, email, phone, dietary). Same id in both. Never write `persons`
  from app code — its POST / PATCH / DELETE routes and `/api/tour-personnel`
  are gone. Read it freely (⌘K, Crew, Rooming read names from it).
- **One person panel:** `<PersonnelDetailSlideOver>`. The entity person panel
  (⌘K, EntityChip), Payroll's row open and Crew's "Edit person" all open it.
  Don't build a second person form.
- **Where each field lands** (`src/server/people/tourPersonEdits.ts`):
  name → `personnel.name` (renames everywhere); role → THIS tour's
  `tour_personnel.role` (never the person — their "Usual role" only seeds new
  tours); employment (Principal / Band / Crew, `src/lib/personnel/employment.ts`)
  → THIS tour's card, `personnel_rates.person_type`. Payroll cells and the
  Crew panel both go through these. `tour_personnel.employment_type` is
  retired (left in place, unread, unwritten).
- **A payroll card's name and role are copies** (trigger
  `personnel_rates_follow_roster`): a linked card always shows its roster
  role and its person's People name — a direct write is overwritten. Cards
  off the roster keep what was typed.
- A new tour starts from People: role = their usual role when none typed,
  employment = `employmentFromGroups` (artist / mgmt → Principal, band → Band).
- Known gap: deleting a People record leaves them on their tours.

### Getting started — welcome + "Get set up" (Nov 2026, Adam)

- **A new account owns a workspace AND is its member** (migration 290: trigger
  `profiles_owner_membership` on profiles INSERT — owners only, never on
  UPDATE). `handle_new_user` (002) never added the membership, and since 086
  reading a workspace needs one, so new sign-ups couldn't open their own.
- **`profiles.workspace_id` is always a workspace the user belongs to**
  (migration 291: trigger refuses anything else; removing a member moves
  their profile on). Code that reads the profile's workspace relies on it.
- **Beta guards (291):** the crew double-booking check only looks in the
  caller's own workspaces (busy-elsewhere is private — Adam); a workspace
  admin can't raise their AI budget above $25 (site admin can); shared-venue
  edits are site-admin only (route + read-only panel). Permissions plan:
  `docs/handover/PERMISSIONS_DESIGN_2026_11.md`.
- **Signed in but no workspace → `<NoWorkspace>`, never `redirect('/login')`**
  (`(workspace)/layout.tsx`): the middleware bounces a signed-in user on
  `/login` back to `/artists`, so that redirect looped forever.

- Replaces the old "App tour & tutorial" panel (deleted with its registry).
  `src/components/onboarding/GettingStarted.tsx` is mounted once in AppShell;
  rules are pure in `src/lib/onboarding/checklist.ts`; facts come from
  `GET /api/onboarding/status` (`src/server/onboarding/status.ts`, read-only,
  count queries).
- The checklist TICKS ITSELF from real data — never add a hand-ticked step.
  Every step's link must be a page the rail has (a test checks this against
  `ia.ts`). Admins/managers get the checklist; read-only members get the
  welcome only.
- The welcome opens by itself once, only for a new workspace (no tour) or a
  member who joined in the last 14 days. Only "seen / hidden / folded" lives in
  localStorage (`lp-onboarding-v2`); the status call is made only while
  something could show.
- Welcome art is live-drawn from the app's own labels (`WelcomeArt.tsx`) —
  when a rail label or template changes, update the sketch too.

### Tour access — who sees what (Nov 2026, Adam — migrations 292 + 293)

- **Roles** (ONE list + labels: `src/lib/permissions/roles.ts`): admin / manager
  see every tour. **Tour manager** (`tour_manager`, migration 298 — Adam, Nov
  2026): ONLY the tours in their `tour_access` rows (the areas on those rows are
  ignored — every area is EDIT), plus dates & tour details (not currency /
  artist), crew, the People on their tours (passports incl.) and People they
  add (`personnel.created_by_user_id`), and the workspace's templates +
  libraries (ref tables via `private.is_library_editor()`). Never members,
  app logins, AI index, artist-level riders, other tours. Admin = god tier.
  **Members** (`readonly`) see only
  the tours + areas in `tour_access` (all tours or per tour; view / edit), set
  on Team & roles with a preset. Ten areas, ONE list:
  `src/lib/permissions/areas.ts` (parity-tested against 292's CHECK).
- **The database is the gate.** Every tour table's rules are GENERATED:
  `scripts/permissions/rules.mjs` → `node scripts/permissions/gen293.mjs` →
  `293_tour_access_rules.sql`. Never hand-edit 293; a test fails if it drifts.
  A NEW tour table must get a line in rules.mjs (293's report lists any table
  with a `tour_id` and no rule). Helpers live in the `private` schema.
  **Reference tables ('ref') read `workspace_id IS NULL OR` your workspace** —
  the built-in rows (default rate types, system budget templates, mic
  library) have NO workspace. 293 as first pasted left that out and Payroll
  lost its rate columns; migration 296 (generated by the same script from the
  'ref' blocks) put it back. Payroll's columns also fall back to
  `DEFAULT_RATE_TYPES` like the server's `rateLinesFor`, so an empty rate-type
  read can never mean "no rates" again.
- **The app asks the database**: `getViewerAccess` / `getRequestViewerAccess`
  (`my_tour_access` RPC). A page's edit switch is `viewerAllows(access, area,
  'edit')` — never `membership.role` (Parking checked the role and showed a
  Member with Parking EDIT a read-only map; fixed Nov 2026). Rail items carry `area` in ia.ts; AppShellV3 shows
  `<NoAccess>` for a page the viewer can't open. Never re-derive access in code.
- **Writes**: `requireWrite(supabase, { area, tourId })` lets a Member with EDIT
  through (and a Tour manager on their tours); `{ runsTour: true, tourId }` =
  admin / manager / that tour's Tour manager (dates, details, crew);
  `{ library: true }` = templates + libraries; `{ people: true }` = add / edit a
  People record (the DB decides which). Without any of these a route stays
  admin/manager-only (`adminOnly` = admin only). Pages ask `runsTour(access)`
  (tourAccess.ts); the rail has `area: 'runsTour' | 'library'`. **~100 routes
  are still `requireWrite(supabase)`** (admin / manager only) — converting
  them area by area is the open job (Adam chose "convert every action").
  298 is GENERATED by `gen293.mjs` too; paste order 293 → 296 → 298 (re-pasting
  293/296 later reverts the reference tables until 298 is pasted again). Converted so far: receipts, parking, advance, file share links. A route whose write touches another area (e.g.
  derived budget lines) must do that part as the server, for that row only
  (see receipts' `syncClientFor`).
- **ONE system** (Nov 2026, Adam): the old page grants + member tags are
  RETIRED. `canAccess` / `fetchActiveGrants` / `requireWrite({ resource })`,
  `PermissionMatrix`, `TagEditor` and the "Granted:" line are deleted, and a
  ratchet test (`requireWrite.test.tsx`) fails if any comes back. Pages ask
  `viewerAllows(access, area)` (strict — `viewerCan` fails open, display only);
  manager-only actions ask `access.manager`. Migration 294 moved the last
  database rule off `can_access` (crew document uploads). `workspace_member_tags`,
  `permission_grants` and `public.can_access` are left in place, unread.
  DECIDED (Adam, Nov 2026 — not a gap, don't "fix"): Schedule EDIT does NOT
  let a Member edit dates / tour details — those writes stay admin / manager.
  Crew documents (head shot, passport scans): admin / manager upload, ADMIN
  ONLY delete — the route refuses a manager with "Only admins can delete
  documents." to match the bucket's delete rule (085).
- **Own rows**: a login linked to its crew record (`personnel.user_id`, set by
  accepting an invite that names it) always reads its own crew / room / pay rows.
- **Sign-up is by code only** (Admin › Beta codes, `/auth/beta-signup`); public
  sign-up is OFF in Supabase. Invite links work as codes for their email.
- **Members land on `/crew`** (phone-first: shows, advance info, parking, files).
- **Deleting users and workspaces** (site admin, Nov 2026, Adam — migration 295):
  a workspace is ARCHIVED first, then "Delete permanently…" (shown only on
  archived rows) with its name typed; `admin_delete_workspace()` checks all of
  that in the database, cascades the tours, keeps every member's account, and
  the route then removes its stored files (`admin_workspace_storage_objects` —
  any path with the workspace id as a folder). A user who OWNS a workspace is
  always refused (409 `OWNS_WORKSPACE`); delete the workspace first. 295 turned
  every "who made this" column pointing at a user / profile into ON DELETE SET
  NULL (the old no-action rules are why user delete failed), so the work they
  added stays. `profiles` has no FK to `auth.users` — the route deletes the
  profile row itself. A new column referencing a user must say ON DELETE.
- Plan + as-built: `docs/handover/PERMISSIONS_DESIGN_2026_11.md`. DB tests:
  `database/tests/` (PGlite).

### Crew — add many, logins per tour, no status (Nov 2026, Adam)

- **ONE writer for crew rows: `addPersonToTour`** (`src/server/people/addToTour.ts`)
  — role (typed, else their usual role, else Crew), role tag (given, else
  `inferRoleTag` from the role), employment from their groups, payroll card
  seeded from their last tour. The single POST `/api/tours/[id]/personnel` and
  the Add crew panel's batch POST `/personnel/add` both call it. Reads People
  (`personnel`, the master) — never `persons` — so a person made a moment ago
  works.
- **Status is RETIRED** (Adam: "I wouldn't add someone tentatively, and I can
  remove them easily"). `tour_personnel.status` stays in the database, written
  'confirmed', read by NOTHING — not the list, panel, Overview, Home, routing
  readiness or crew My schedule. Don't bring a status back; remove = remove.
- **Add crew** = `<AddCrewSlideOver>` (Crew, Payroll, Rooming via
  `AddPersonToTourButton`): `/personnel/candidates` loads all People once
  (`rankCandidates`: this artist's people first; on-tour people greyed, not
  hidden — OPS-11), filtered client-side; tick many; "+ Add 'X' as new";
  a tray line per person (role, tag chip, dates, app access). A new person
  whose email is already in People IS that person.
- **App access per tour** (`src/server/people/tourLogin.ts`): `giveTourLogin`
  — has a login here → add this tour's areas (`accessWrites`, never lowers);
  admin / manager → nothing to do; else an invite (Member, `personnel_id`,
  this tour's preset rows), REUSING a pending invite for the same email.
  `removeTourLogin` takes this tour off. Workspace ADMINS only (invites +
  tour_access are admin-writable in the database); routes check up front.
  `tourLoginStates` feeds the list (managers see "Has login", no presets).
- **A new person needs their `persons` copy** (tour_personnel.person_id →
  persons). 285's trigger makes it; Adam's database was missing it (Nov 2026,
  "violates foreign key constraint tour_personnel_person_id_fkey") — migration
  305 reinstalls it + backfills. The batch add deletes a People record it made
  itself when the add then fails.
- Rules pure in `src/lib/personnel/crew.ts` (tags, departments, ranking,
  accessWrites). Smoke: CREW-01…09 (operations.md).

### File & folder share links (Nov 2026, Adam)

- Tour Files → ⋯ → **Share…** makes a `/f/<token>` link to one file or one
  folder (everything under it, incl. files added later). Anyone with the link,
  optional password + expiry, revocable. VIEW = see + download. EDIT = also add
  files to the folder and upload new versions — **never rename, move or delete**.
- Tables `file_share_links` / `file_share_events` (migration 281). Rules are
  pure in `src/lib/files/shareLinks.ts`; server in `src/server/files/shareLinks.ts`.
  `fileInLink()` is THE scope check for every public read/write — the public
  routes use the service-role client, so nothing else stands between a token
  and a file. Change it only with its tests (they were mutation-checked).
- A new version keeps the `file_references` id; the old object stays in
  storage and is listed in `metadata.versions` + the `new_version` event.
  Replace is optimistic (`.eq('provider_file_id', old)`) → 409 on a race.
- Public upload cap is counted from `file_share_events` (60/link/hour), not the
  in-memory limiter. Folder renames on the canvas call
  `/api/file-share-links/repoint` so links follow.
- Uploads go straight to Storage — see §"Uploads — straight to Storage".

### Uploads — straight to Storage (Nov 2026, Adam)

- **No upload passes through a Vercel function** (they refuse bodies over
  ~4.5 MB). Three steps: the server checks and issues a one-time signed upload
  for a path IT chooses (`issueGrant`, recorded in `storage_upload_grants`,
  migration 282) → the browser sends the bytes with `uploadDirect()`
  (`src/lib/uploads/directUpload.ts`: one request ≤ 6 MB, resumable TUS above,
  retries resume after a drop) → a finish call (`completeGrant`) accepts only a
  path granted to that workspace (and link), reads size/type from Storage, and
  claims the grant exactly once.
- Files: `/api/files/upload-url` + `/api/files/complete` (the multipart POST is
  gone). Share links: `/api/public/file-link/[token]/upload-url` + `/complete`;
  their hourly cap counts ISSUED grants. Advance packs use `uploadDirect` too.
- One limit: `MAX_UPLOAD_BYTES` (100 MB) in `src/lib/uploads/limits.ts`; the
  bucket is set to match. The Supabase project's global limit must be ≥ it.
- `/api/cron/upload-sweep` (daily) deletes objects whose grant never completed
  in 24 h. Never add a new multipart upload route into tour-files.

### Files linked to shows, venues and crew (Nov 2026, Adam)

- `file_entity_links` (migration 283): a tour file "also shows here" on a show
  (routing.id), a venue (canonical_venues.id) or a person (persons.id). The file
  still lives in tour Files; unlinking never deletes it; deleting the file
  removes its links.
- A **venue** link shows on every show at that venue across the workspace's
  tours (labelled with its source tour). `canonical_venues` is GLOBAL — every
  query filters `workspace_id` (tested: a foreign link row pointing at your file
  is ignored). Venues are named via `resolveVenue()`, never routing.venue_*.
- Server: `src/server/files/entityLinks.ts`; API `/api/file-links` (+ `/targets`).
  UI: `<LinkedFilesPanel>` (advance show page card, Schedule's show panel, venue
  editor, person panel) and **Link to…** on a tour file's ⋯ menu.

### Tour Overview — a to-do list, not a dashboard (Nov 2026, Adam)

- `/operations/[id]/overview`, where every tour opens: next show, "Needs you"
  (each line a count + the link that fixes it), one line each for Advance,
  Budget, Production. Rules pure in `src/lib/tour/overview.ts`; facts in
  `src/server/tour/overview.ts`, read from the SAME loaders the linked pages
  use (`loadAdvanceBoard`, `countReceiptsNeedingDetails`, `loadTourPnl` with
  `reconcile:false` — a page load writes nothing). Parts the viewer can't
  open (P-1 visible resources) are neither read nor shown.
- **Look** (redrawn Nov 2026, Adam): full width like the other pages, one
  panel style (`overview.css`, rows split by hairlines), "TODAY" headline on a
  show day, Needs-you rows = large count + `what` + grey chevron (the whole row
  links), ONE orange button (Open advance). Needs you · This tour sit side by
  side via a CONTAINER query (the content area, not the window, decides).
- No charts, no activity feed, no stat cards: two card dashboards were built
  and deleted before (budget Summary, the tour Summary page — deleted with
  `OperationsSummaryClient`, the `/edit` page and `TourEditForm`). A new line
  here must be something to DO, with a link.

### Parking maps — overhead plan, true size (Nov 2026, Adam — migration 287)

- **A Production tool, per show** (Adam: "a separate tool"): rail Production ›
  **Parking** → `/operations/[tourId]/parking` (every show day + its map,
  `loadParkingIndex`) → `/operations/[tourId]/parking/[routingId]` (the editor;
  its tool panel folds the app rail via `hasOwnRail`). The show's advance only
  LINKS to it — a Parking line in "From elsewhere in Lowpass"
  (`linked.parking`), shown there, edited here. API:
  `/api/tours/[id]/parking/[routingId]`. Phase 1 of the scope doc ("Parking
  maps — scope"): Google satellite pinned to the venue, vehicles / markers /
  routes / areas / measurements, autosave, A4 PDF into tour Files › Parking
  maps, linked to the show. Phase 2 (3D page) reuses the same items.
- **Everything is metres east / north of the map's anchor** (`src/lib/parking/geo.ts`).
  Never store or compute sizes in pixels. `parseMapBody()` is the only way into
  `parking_maps.items`; `<ParkingScene>` is the ONE renderer — the PDF rasterises
  the same component, so the editor and paper can't disagree.
- Saves are optimistic on `version` (409 → "Load theirs / Keep mine"); opening
  writes nothing.
- **The panel** (Nov 2026, Adam): header (venue, date, save, Export PDF) then
  tabs **Add · Drawings · Share**; a selection's edit view replaces the tabs
  (Done returns). Add's vehicles are `VEHICLE_TILES[region]` (catalogue.ts) —
  a UK / EU | US switch, `regionFor()` the default; every vehicle type must be
  on one side (tested). Sizes are typical figures, noted at each spec (Bandwagon from
  BandWagon RV Rentals: 38 ft, 59 ft with trailer, allow 66 ft kerb for the ramp). Ramps / tail lifts / van doors get a red HATCHED
  keep-clear box behind the tail (`VehicleSpec.rear` → `rearClearCorners`, model.ts;
  per vehicle `rearClear: false` turns it off, the toggle sits under Colour). Plan,
  PDF (fit pages frame it, names avoid it, key line) and driver map — not 3D. Trucks
  have none (doors open flush — Adam). Cab-only / trailer-only on BOTH sides
  (tractor_eu/us, trailer_eu/us). A fifth wheel is part kind `plate` on the plan. 3D controls stay on the map. Right-click on the plan =
  `<MapContextMenu>` (never the browser's; it only lays out the editor's own
  actions); Draw › **Flatten 3D** draws an area born `flat3d`.
- **Selection is a list of ids** (Nov 2026, Adam): ⌘/Ctrl- or Shift-click
  toggles, Shift-drag boxes (`itemsInBox`), ⌘A takes all. Several move, nudge,
  delete, duplicate and colour together; they TURN AS ONE BLOCK (`turnItems`,
  about `groupCentre` — the mean of item centres, so repeated turns don't
  creep). One vehicle still turns about itself; the knob shows for one only.
  Rules are pure in `edit.ts`.
- **The anchor is degrees — keep it to 1e-7 (`deg()` in model.ts), never
  `num()`** (0.001 = a millimetre in metres, ~111 m in degrees). The anchor was
  saved rounded to 3 dp, so every drawing jumped up to ~55 m on reload (fixed
  Nov 2026). Maps saved before the fix keep their rounded pin — Adam chose
  to re-place by hand rather than run a repair.
- Imagery: `NEXT_PUBLIC_GOOGLE_MAP_TILES_KEY`, a BROWSER key restricted to the
  Map Tiles API + the app's domains — never the server key. Tiles are fetched
  for the view and never stored (Google's terms); "Google Maps · <credit>" stays
  visible on screen and on the PDF. No key → a true-scale grid, no imagery.
- Overlay colours are `--lp-map-*` (fixed, not themed — they sit on a photo). A vehicle's colour is `vehicleColour()` (palette.ts): its chosen paint (`PAINTS`, `--lp-map-paint-*`) else its type's role colour — the plan, 3D and the PDF key all call it.
- **3D (phase 2):** the editor's Plan | 3D switch → `<Parking3D>`; the PDF's
  page 2. ONE builder, `scene3d.ts` (`populate`), for both: Google
  Photorealistic 3D Tiles (same browser key) rendered by **CesiumJS loaded at
  runtime from `/cesium`** — copied from `node_modules` by
  `scripts/copy-cesium.mjs` (postinstall + prebuild; `public/cesium` is
  gitignored, excluded from the auth proxy matcher and from lint). Never
  import Cesium as a value in app code — `import type` only. **Vehicles are
  MODELS** (Nov 2026, Adam: "recognisable at a glance"): `vehicleMesh()`
  (`src/lib/parking/models3d.ts`) builds each type from its real schematic
  (Skyliner, Prevost H3-45, cab-over / long-hood tractors, 53 ft + 13.6 m
  semis, Sprinter L4, Vito, Luton, rental box truck, BandWagon, …) with the
  kit in `mesh3d.ts` (lofted hulls, wheels, decals), always at the item's TRUE
  L × W × H (tested: bounds = size, tyres on the ground, nothing above a
  tractor's 1.2 m fifth wheel, `FIFTH_WHEEL_M`). Pure — no Cesium. scene3d
  uploads ALL vehicles as ONE `Primitive` with per-corner colours baked by
  `bakeColours` (UNLIT, like the walls: the same at any time of day); part
  colours are `--lp-map-glass/-tyre/-metal/-trim/-lamp/-tail/-amber`, the rest
  the vehicle's colour (`shade` / `pale` tints; box and trailer ROOFS are pale
  so a cab reads apart from its box from above). A new vehicle type needs a
  builder there, or it falls back to a plain true-size box. The plan still
  draws `silhouettes.ts`. Vehicles stand at the LOWEST mesh height under the
  vehicle (so a tree doesn't lift a bus) — unless that is > 2.5 m above a ring
  round it, i.e. a canopy: then the ring's lowest (`standingHeight`). Camera: right-drag / Ctrl-drag turn + tilt (Cesium's default had right-drag zoom); touch: two fingers twist / slide to turn / tilt — PINCH must stay in `tiltEventTypes` as well as zoom (once missing: phones were zoom-only); labels are name only and laid out per frame by `placeLabels` (labels3d.ts, nearest first, none touching); plus ↺ ↻ ⌃ ⌄ and a north compass that `orbit()` around the screen-centre ground point. 3D is look-only; a 3D PDF page
  keeps its camera (validated by `parseCamera3d`; see PDF pages below). No sky
  atmosphere — with the globe off it painted over the vehicles.
- **PDF pages** (`src/lib/parking/pages.ts`, on `view.pages`, checked by
  `parsePages`): any number (≤ 12) of plan and 3D pages, named and ordered in
  the editor's "PDF pages" list. Plan *fit* pages frame the PARKING (routes
  are left out unless they're all there is) at Fit or a chosen 1:N; plan
  *fixed* pages keep their own centre / rotation / 1:N ("This plan view");
  3D pages keep a camera ("Add this view as a page"). Every plan page carries
  the key + notes; the editor outlines each plan page's area. On plan pages and
  the driver map NAMES COME FIRST (Adam): every vehicle is named — inside it when
  big enough (`insideName`), else a tag past its END, BESIDE it (open side only) or
  a CALLOUT with a leader line (`layoutNames` in print.ts — never on a vehicle,
  badge or tag); small numbered badges stay for the key / list (`vehicleNumbers`,
  one numbering per PDF; `badgeRadii`).
  Selection → "Close-up PDF page" (`addCloseUpPage`). Flat-in-3D areas are never
  titled and never printed (`forPrint`). 3D pages are full width (`FRAME_3D`), the
  note once. The driver link's plan + Vehicles list use the same numbers, and the
  link carries the latest export (`pdf`, signed 1 h); tapping a vehicle in its
  list flies the map to it and flashes it (`focus` / `flashId`). The editor keeps names. No pages saved =
  `defaultPages()` (Plan + Street map + 3D). A plan page with `base: 'street'`
  prints Google's ROADMAP tiles (its own session, `getTileSession('roadmap')`,
  credit from the viewport call) instead of the photo, without venue drawings —
  "+ Street map" adds one at 1:1,000 (`STREET_SCALE`; was 1:2,500 — Adam: "way tighter"; pages saved before keep their scale). **Every label on paper is laid out together** (Nov 2026, Adam): vehicle names first (`layoutNames`), then area names (spots INSIDE the area, `areaLabelSpots`) and marker names (any side of the icon, `markerLabelSpots`) through `layoutExtras` — none may cross a vehicle, badge, name tag, marker icon or another label; one with no clear spot is left off (the key lists it). Paper / driver map only (`numbers`); the editor draws labels in place. In 3D an area's name is PAINTED ON THE GROUND (`floorText.ts`: along its long side, sized to fit, reading west → east; a flat decal at the lowest sampled height + 0.12 m), never a floating chip. One off-screen Cesium viewer renders all 3D
  pages; a 3D failure drops only the 3D pages, with a warning.
- **Venue drawings** (Nov 2026, Adam — migration 288, `parking_maps.drawings`):
  a venue's PDF / JPG from tour Files (or linked to the venue), laid on the map
  at true scale — for parking the satellite can't see (trucks inside the
  Velodrom, a basement dock). Rules pure in `src/lib/parking/drawings.ts`;
  `parseDrawings` is the gate. Source units = PDF points / image px (u right,
  v DOWN); `toGround`/`svgMatrix` place them; only numbers are stored.
  Setup (`DrawingSetup`): crop → scale from a PRINTED dimension + a second one
  checked against it → pin by two points (the drawing keeps ITS scale; the
  satellite's disagreement is `pinCheck`, > 3 % = maybe out of date) or place
  by hand. Look: over the satellite the paper is multiplied away (lines on
  the photo); satellite off = the clear copy (`seeThroughCopy`: lightness
  inverted, hues kept, paper transparent). **Inside drawings are inside only
  over `insideArea`** (an outline in drawing units, "Outline the inside";
  null = the whole crop) — `insideFootprint()` is the one rule for
  everything inside (roof cut, floor, items on it, door headroom); never
  `footprint()` for that. The INSIDE floor is always solid — `opacity` fades only
  the sheet outside the building (plan, PDF, driver map; 3D already did). A HIDDEN drawing cuts no roof and lays no floor in 3D (`drawingsIn3d`), but items inside it still stand at its street height (under the roof). The cut edge gets WALLS (`walls3d.ts`): floor up to the roof height sampled on the edge (before the clip), `--lp-map-wall` toned by facing, UNLIT and see-through (most at the top); tops are `smoothTops` (a mast or cable over the edge mustn't pull a wall up it); none where the edge is open street. A thin `--lp-map-rim` line runs along the wall tops (`rimRuns`). There: `--lp-map-floor` under the clear lines (plan
  + 3D); the rest of the sheet is drawn like an outside drawing. 3D: the
  mesh is clipped to the inside area (`ClippingPolygonCollection`) and the
  floor sits at the street height around it + `floor`; vehicles on it stand
  there. The PDF still draws inside drawings as the solid dark copy.
  Routes in 3D are split where they cross onto an inside floor or a flat
  area (`splitRoute`, routes3d.ts): those runs lie at that floor's height,
  only open-street runs drape on the mesh (draped over a cut-away, a line
  climbs the walls), one arrowhead on the last run.
  **"Flat in 3D"** on an area (`flat3d`, Nov 2026): Google's mesh has whatever
  was parked when it was photographed baked in — it can't be picked off, so
  the area is clipped like an inside drawing and the 2D satellite photo
  (`addSatellitePatch`, `tilesCovering`, ≤ 36 tiles, never stored) laid flat
  at the street height round it; items on it stand there. Levels: an item's `floor` ?? the inside drawing it's on ??
  0 (`itemFloor`); picking a level fades the rest and new items go on it; a
  plan PDF page can print one level. Headroom (`headroomWarnings`): a
  drawing's clear height, height-limit markers (`clear`, or read from the
  detail) at a door / over a vehicle / on a route. `/drawings` lists drawable
  files and offers the latest other map's drawings at this venue (shifted by
  the anchor difference). `view.satellite === false` = no imagery. The code
  reads/saves without the column until 288 is pasted (`withDrawings`).
- **"Read it for me"** (AI-assisted setup, Nov 2026): `/drawings/read` (Sonnet
  5.5, `DRAWING_READ_MODEL`, through `withAiUsage`). OVERVIEW: the whole page →
  crop, printed dimensions + rough ends, north. REFINE: per dimension, two
  1,200 px close-ups round its ends (`endBox`; `renderRegion(…, fill)` — NOT
  capped at 4 px/pt) → the exact arrow tips. Rules + parsing pure in
  `src/lib/parking/drawingRead.ts` (nothing the model says is trusted
  unparsed). It only PROPOSES: it fills crop / dimensions / north and stops on
  the Scale step, where the two dimensions must agree and are drawn on the
  page; pinning stays two human clicks. ~3 calls, ~5 ¢ a drawing.
- **Driver links** (Nov 2026, Adam — migration 289, `parking_share_links`):
  editor "Send to drivers" → `/p/<token>` (public via publicRoutes `/p/`), one
  show's map for a driver, phone first. The token is shown ONCE; only its
  sha-256 is stored. Every link expires (48 h default, ≤ 14 days) and can be
  turned off. The page opens on the PLAN (2D tiles, free at tour scale); "Look
  around in 3D" first POSTs `/api/public/parking/[token]/3d`, which TAKES one
  of the link's capped 3D opens (each = a billed Google 3D session, ~0.6 ¢ after
  the free 1,000 / month; the button shows no count — grey "3D expired" when
  used up) through `parking_share_touch()` — atomic, service
  role only. `driverMapPayload` returns only that map, venue and the drawing
  files it uses (signed 10 min). "Get there" hands gates to Google Maps / Waze
  / Apple Maps (`navigateUrls`). Read-only viewer: `<ParkingViewer>`; tiles via
  the shared `useMapTiles`. The map's notes go with it — the editor says so.
- Known: each export is a new file (share the Parking maps folder for a link
  that stays current).

### Flight search (Nov 2026, Adam — migration 299)

- Travel › New flight › **Find flight**: flight number + date → airline,
  from / to, local departure date + time (`POST /api/flights/lookup`, Logistics
  edit on the tour). Provider: Aviationstack, behind ONE adapter
  (`src/server/flights/lookup.ts`; rules pure in `src/lib/flights/lookup.ts`).
  NO alerts / change watching (Adam: "remove the notifs").
- **Never burn the 100 / month**: only on a click; bad numbers refused before
  any call; free plan (`AVIATIONSTACK_PLAN=free`, default) only asks for dates
  within a day of today (`inPlanWindow` — the free plan can't look ahead,
  FRAGILE, from the plan notes); answers cached in `flight_lookups` (`cacheFresh`:
  flown = forever, found 6 h, miss 3 h); every provider call is RESERVED first
  by `flight_lookup_reserve()` (atomic, counted in the DB): 90 / month in all
  (`FLIGHT_LOOKUP_MONTHLY_CAP`), 30 per workspace (`FLIGHT_LOOKUP_WORKSPACE_CAP`).
  Never call the provider anywhere else, and never on typing.
- Env: `AVIATIONSTACK_KEY` (server only; no key → the button isn't shown),
  `AVIATIONSTACK_BASE` (default https). If the free plan refuses HTTPS the
  error says so — switching to http sends the key unencrypted; Adam's call.
- `flight_lookups` has RLS on and no policies: service role only.

### Riders — two documents, numbered versions, one live link per show (Nov 2026, Adam — migration 301)

Adam: "it is a document… legally binding… make requests and demands really
clearly… one link… a version number and edit date… things change as a tour
goes on". The old builder (rider_packs kind 'rider') is DELETED — don't
rebuild sections / cover pages / variables.

- **Where**: Production › Riders, `/operations/[tourId]/riders` (`?doc=tech|
  hospitality`, `?panel=outline|changes|shows|replies`). UI
  `src/components/riders/`, rules pure in `src/lib/riders/`, server
  `src/server/riders/`. API `/api/tours/[id]/riders` (GET + POST `action`),
  `/riders/blocks` (POST / PATCH `ifVersion` / DELETE), `/riders/pdf`;
  `/api/rider-templates(/[id])`; `/api/riders/bring-over`. Artist library:
  `/artists/[id]/riders` (each tour's documents + templates).
- **Model**: `riders` (one per tour × Tech / Hospitality) → `rider_blocks`
  (heading, text (Tiptap, `cleanDoc`), request, table, contacts, summary,
  files, break, input_list, stage_plot — the last two since 302). `parseContent` is THE gate for block content. Order is a
  fractional `position` (`COLLATE "C"`, lib/riders/position.ts). A block can
  be DATED (`applies_from` / `applies_until`) — that's how a mid-tour change
  works ("Change from a show…" ends the old block the day before and starts a
  copy); `inForce(block, date)` decides, never per-show copies.
- **ONE look**: `docModel` + `RIDER_DOC_CSS` (lib/riders/render.ts) feed the
  editor's preview, the promoter page, the PDF (`riderPdfHtml`) and the
  legacy show link. Never fork the rendering — a second stylesheet is how a
  PDF ends up disagreeing with the page.
- **Versions**: Publish freezes both documents into `rider_versions`
  (`snapshot`, major.minor, `changes` from `diffSnapshots`). The trigger
  refuses every UPDATE and any DELETE that isn't a cascade. Promoters only
  ever see the latest PUBLISHED version — never the draft. Publishing an
  unchanged rider → 409 UNCHANGED.
- **Live editing**: each block saves on its own, 700 ms after typing, with
  its `version` (`ifVersion`); a stale save → 409 STALE + the current block →
  a theirs / mine banner. Realtime `postgres_changes` on rider_blocks (+
  replies, acks, versions); presence + broadcast on `riders:${tourId}`
  (deletes are broadcast — Realtime can't filter DELETE). Database triggers
  copy workspace / tour from the rider — don't send them from the client.
- **Links**: `rider_links.token` IS the grant (one live link per show +
  an optional whole-tour link). `/r/<token>` and `/api/public/riders/[token]`
  (+ `/pdf`, `/file`) use the service role, scoped to the link's tour, its
  show's date and the latest version (server/riders/public.ts). Acknowledge
  + reply on a request line; caps 20 acks / 60 replies per link per hour.
  **Lowpass never emails**: Send writes the email (Gmail / Mail app / Copy)
  and records `rider_sends`. Per-show line states (confirmed / substitute /
  cut) live on `rider_line_states`.
- **To-do rules are ONE function each** (lib/riders/status.ts):
  `showsToSend` (link's newest send ≠ latest version) and `repliesToAnswer`
  (promoter spoke last, unresolved). The Riders page's tabs and the tour
  Overview's "Needs you" both call them — never re-derive.
- **The old builder's leftovers**: `rider_packs` kind 'rider' rows stay
  (read only by bring-over, `rider_legacy_imports` ledger, never deleted).
  `/api/rider-packs` refuses kind 'rider' (410); `/rider-packs/[id]` and
  `/operations/[id]/riders/[packId]` redirect a rider (or stage-plot) pack;
  `/r/<old token>` keeps the OLD reader for channel-list share links
  (PackEditor still makes them), forwards an old rider link to the tour-wide
  link only when it had no password, else "This rider has moved";
  `/api/public/rider/[token]` answers 410 for rider packs.
  `getPacketManifest` drops old rider packs once the tour has published a
  rider; the legacy show link's Rider tab renders the new one
  (`loadShowRider`). PackEditor still carries rider-era section types
  (cover page, rich text, PDF import) — channel lists only now.
- **Permissions**: tour tables are area `production` in
  `scripts/permissions/rules.mjs` (`since: 301`); `rider_templates` is 'ref'
  (library editors write); `rider_legacy_imports` manager. 301's rules block
  is GENERATED between its markers by `gen293.mjs` — never hand-edit it.
  DB tests: `database/tests/301_riders.test.mjs`. Smoke: RID-07…31.
- **Input list + stage plot IN the tech rider** (Nov 2026, Adam: "standalone
  tools but ALSO need to integrate into the tech rider" — migration 302): the
  `input_list` / `stage_plot` blocks SHOW the documents; they are edited only
  in their own tools — clicking the block goes there (same tab; the plot to
  its own editor, `embedLinks`), and coming back (Back restores the page from
  the router cache) or refocusing re-reads just the copies
  (`GET /riders?part=embeds` → `refreshEmbeds`). Which
  document: a show's own attachment → the tour's → the newest on the tour —
  `buildEmbeds` (src/server/riders/embeds.ts) reads with the SERVICE ROLE,
  pinned to the tour (show attachments are manager-only rows under RLS), so
  every caller checks Production VIEW first (the page, GET route, publish,
  PDF). Publish freezes copies into `snapshot.embeds` — only what the blocks
  show (`embedsInUse` / `pickEmbeds`), through the gate `parseEmbeds`, maps
  key-sorted: JSONB reorders keys, so compare with `sameEmbeds` /
  `embedKey`, NEVER `JSON.stringify` of embeds (and never stringify a plot
  per keystroke — it can be megabytes). The plot is ONLY ever an `<img>`
  data URI (custom icons are uploaded SVG — inline it and it can run
  script). "What changed" names channels (`diffEmbeds`). Attachments-block
  items `channel_list` / `stage_plot` (riders made before 302) are PDFs of the
  LIVE documents — kept, "Show it in the rider" moves one into its block; new
  ones can't be added.
- **The exact item** (request lines, Nov 2026): `link` (`cleanLink`;
  typed → `typedLink`) and `photo` — a path `rider-photos/<ws>/<tour>/<uuid>.<ext>`
  in tour-files, signed only after `photoBelongs` (the promoter routes are
  service role). Uploads: `/riders/photos` upload-url → `uploadDirect` →
  complete (sniffs the bytes; the stored content-type must equal them). "Use
  the shop's photo": `safeFetch` (src/server/net/safeFetch.ts — THE only
  server fetch of a user-typed URL: public addresses only, DNS pinned,
  every redirect re-checked, size capped after unzip; never use `fetch` for
  one) + `productFromHtml` (lib/riders/linkPreview.ts), and a COPY is stored
  (shop images move). Promoter page: tap the item → photo, "See the exact
  item ↗", reply. PDF: the item name links; no photos. Known: a photo taken
  off a line stays in storage (a published version may still show it).
  DB test: `302_rider_embed_blocks.test.mjs`. Smoke: RID-32…40.
- **If possible on any line; per person only where it means something**
  (Nov 2026, Adam: "can be on tech. per person only on relevant things"):
  `perPersonFits(item, section)` (src/lib/riders/perPerson.ts) — food, drink,
  towels, buyouts, passes, beds…, by the item's words or the heading it sits
  under (`sectionAbove`); a ticked box always shows. The line's details toggle
  is a chevron, never dots. **The block's ⋮ menu is in the LEFT gutter** with
  + and the drag handle (`.rdx-gmenu`) — on the right it sat on the line's
  star / chevron and caught clicks meant for them. Keep the right edge for the
  line's own controls.
- **The PDF is dressed like Adam's own riders** (Nov 2026: "a refined version
  of my rider with logo"): per document a COVER (the artist's logo — Edit
  profile → Logo, `loadRiderLogo`, src/server/riders/logo.ts: our own upload
  read from Storage, anything else only through `safeFetch`; no logo → the
  name set as a wordmark — title, tour, show, the version stamp in the accent,
  the prose before the first heading as the opening statement, a contents
  list linking to the sections), then the body inside `.rp-frame`, a table
  whose `<thead>` repeats the logo at the head of EVERY page after the cover;
  centred capital headings; request lines as a checklist "☐ (24) …"; footer
  "Page x of y · Version 1.3 · Updated 26 Nov 2026" (`riderFooterTemplate`,
  via `ExportDoc.page` — the rider brings its own page furniture + PDF
  bookmarks). The dress is `RIDER_PRINT_CSS`, scoped to `body.rp`: same
  items as the page, only the print differs. Fonts are Inter + Montserrat
  latin variable woff2 in public/fonts (OFL), embedded by
  `documentFontCss()` — listed in next.config's `outputFileTracingIncludes`.
  A section with nothing in it (`dropEmptySections`) is never printed,
  listed or shown to a promoter. **The contents carries page numbers**
  (Adam: "a lot of folk will print this PDF"): `ExportDoc.page.withPageNumbers`
  renders TWICE — `anchorPages` (src/lib/export/pdfAnchors.ts) reads the page
  each `#h-<id>` landed on from Chromium's named destinations, the second pass
  fills them into a fixed-width cell (so pagination can't move); any failure
  keeps the first render. Footer centre: "Generated with Lowpass"
  (`LOWPASS_CREDIT`, small, grey — also under the promoter page).
- **The artist's logo heads the rider EVERYWHERE** (Nov 2026, Adam): PDF cover
  + every page, promoter page (paper + top bar), show link, editor. Screens
  load it from a same-origin route — `/api/public/riders/[token]/logo` (show
  link: via its live rider link) and `/api/tours/[id]/riders/logo` (Production
  VIEW) — both `loadRiderLogo` + `logoResponse`, so the screen shows exactly
  what prints and no outside host sees a page whose URL is a grant. Never put
  `branding.logo_url` in a public page's `<img>`. No logo → the artist's name
  (`<DocBrand>`), and in the editor an "Add the artist's logo" prompt →
  `/artists/[id]?edit=profile` (opens Edit profile). **Logo / banner uploads
  write Storage AS THE SERVER** (`/api/artists/[id]/image/[kind]`): admin /
  manager of the artist's OWN workspace, bytes sniffed (JPEG / PNG / WebP,
  ≤ 4 MB), the path fixed by the server — the bucket's user write rule (278)
  checks the caller's current workspace and refused real uploads ("new row
  violates row-level security policy").
- **Exports never touch the network from user strings** (Nov 2026): the shared
  `fetchLogoDataUri` goes through `safeFetch` + `logoBytesDataUri` (bytes must
  sniff as PNG / JPEG / WebP / GIF; SVG refused), and every PDF page is
  `newRenderPage` (src/lib/rider-packs/puppeteer.ts): Chromium loads data: /
  about: / blob: only — the advance packet also our Storage object URLs
  (`storageObjectPrefix`). Inline assets as data URIs; a new export that needs
  the network is a design smell.

### A city is not a venue (Nov 2026, Adam)

- Days off / travel days have a city, never a venue. `venueIsCity()` /
  `isCityPlace()` (`src/lib/venues/notAVenue.ts`) are the rule; applied in the
  Schedule save (PUT), the row PATCH, the import apply and the AI import's
  `normaliseExtraction` — and a Google pick of a town in the Venue box fills the
  city instead (no place id → no library venue).
- Migration 284 holds the same rule as a trigger on `routing` (backstop for
  every writer) and cleaned the rows already saved that way. The shared
  `canonical_venues` table was NOT cleaned — "venues" named after a city may
  remain there; the migration ends with a read-only query listing them.

### Advance — board, show, templates (rebuild, Oct 2026, Adam)

- **Three pages**: the board (`AdvanceBoard`, every show × question group,
  search, packs drop), the show (`AdvanceShowPage`, answers + review + crew
  calls + linked cards), Templates (`TemplatesPage`). Loaders live in
  `src/server/advance/` (`board.ts`, `show.ts`); rules are pure in
  `src/lib/advance/board.ts` / `packs.ts`. **Page loads write nothing** —
  `ensureAdvance` runs on the first write only.
- **Answers** are written ONLY through the `advance_merge_answers` RPC
  (migration 276) via `mergeAnswers` — an atomic merge of answers + their
  `field_sources`. Don't read-modify-write `advance_instances.data` in a route.
- **Templates**: workspace `advance_layout_templates` + day type → template
  (`advance_day_type_templates`). A template change reaches only days that are
  neither `customised` nor sent (`applyTemplateToDays`).
- **Hotel, Flights, Deal** are shown read-only from their home pages, never
  asked on the advance (`isLinkedSection`). Old stored answers stay in the JSON.
- **Asking the venue**: Lowpass makes a link (`ask_fields` limits the venue
  form) and an email the TM sends from their own inbox. The app never emails
  venues.
- **Info packs**: stored in `tour-files/advance-packs/<ws>/<tour>/…`, recorded in
  `advance_documents`; every suggested answer carries a quote + page, verified
  by `findQuote` before it is offered, and the viewer boxes it or outlines the
  page — never a box in the wrong place.
- **Pack reads run in the background** (Nov 2026, Adam: "SLOW … doesnt
  encourage you to close the window and come back" — migration 300,
  `advance_pack_reads`, service role only). POST `packs/read` {mode:'extract',
  reads:[{routingId, paths}]} starts one read per show and answers at once;
  the read runs after the response (`after` from next/server) and writes
  `parts_done / parts_total`, then its result. `<PackFlow>` polls, shows
  "About N s left" (median of recent reads, `packWait.ts`) and **Close — I'll
  come back**; `<PackReadsBanner>` (show page + board) is where a read waits.
  Speed comes from PARTS: text in ~24k-character parts, scans in 12-page parts
  (pdf-lib, `scanParts`), all side by side (≤ 6 at once per read) — a call is
  slow because of what it WRITES, so never send a whole pack as one call. A
  failed part keeps the others (`failedParts`, said in the notice). Model
  `PACK_MODEL` (Sonnet 5.5; `LP_IMPORT_MODEL` overrides). Identify still runs
  in the request (Haiku, a scan's first 3 pages).
- **Day sheets are RETIRED** (pages, `/m/day` crew links — now a static "no
  longer active" page — tour roles, the Day Sheet PDF, the tour Labor page).
  Local crew calls live on each show's advance (`#crew-calls`). The
  `tour_roles` / `tour_role_links` tables are left in place, unread. Don't
  rebuild a per-day page beside the advance.


### Advance catalogue — one of everything (Nov 2026, Adam — migrations 303 + 304)

Adam: "useful and curated… dressing rooms appears twice which is bad". Lean;
expand where needed.

- **ONE list**: `ADVANCE_CATALOG` (`src/lib/templates/advanceCatalog.ts`) — 15
  sections with FIXED ids (`30300000-…-0000000000NN`), each subject asked once.
  Migration 303 is GENERATED from it (`npx tsx scripts/templates/gen303.ts`,
  parity-tested — never hand-edit 303). A section can take over an old row
  (`from`) so kept questions keep their answers (answers live at
  `data[section row id][field id]`). Retired: Venue Info, Settlement, Deal
  Info, Hotel, Flights, Driver and Hotels, Venue Amenities, Airport and Local
  Distances, Personal Vehicle Parking (`RETIRED_ADVANCE_SECTIONS`). 303 deletes
  workspace forks of catalogue sections and rebuilds the starter layouts
  (affects everything — Adam: "site isn't being used yet").
- **Contact questions only in Key Contacts** (076). Settlement is just a
  contact there (Adam). "Send guest list to" is an email question.
- **Conditional sections**: `show_when {field, in}` on the section (column
  added by 303). `sectionShown` / `shownSections` (`src/lib/advance/
  sectionVisibility.ts`) is THE rule — the show page, the venue form, the
  counts (`questionSections(sections, data)`) and the PDF all use it. Weather &
  Outdoor shows only when Show › Indoor / outdoor is Outdoor or Covered; a
  starter can force a section on (`always` — Festival day always shows it).
- **Upload questions** (type `file`, e.g. Production › Lighting patch): files
  at `advance-files/<ws>/<tour>/<routing>/<uuid>.<ext>` in tour-files, through
  storage grants (282) — never through a function. Sniffed on complete (PDF or
  image), 25 MB, 5 per question. `fileBelongs` gates signing; `cleanFileChanges`
  cleans the value on BOTH the TM save and the venue submit (a path outside
  this show is dropped). Routes: `/api/tours/[id]/advance/[routingId]/files`
  (Advance VIEW to open, EDIT to upload) and
  `/api/public/advance-intake/[token]/files` (token grant; signs only paths in
  that link's submitted answers; 40 uploads / link / hour).
- **Starters** (`tourTemplates.ts`): Headline, Support (incl. Arrival &
  Parking — Adam), Festival (+ Festival section, Weather always), Day off
  (Local Info). Rider starters (`src/lib/riders/starters.ts`): Headline
  Hospitality is by room; Festival Tech / Hospitality exist.
- **Budget templates** gained an Admin section (visas, passes, phones, bank
  fees) on every touring scale, Rehearsals on Support / Club; migration 304 is
  generated (`gen304.ts`) and additive.
### Auth + RLS

- Site admin gating: `getUserAndAdminStatus()` from `@/lib/site-admin`. Mirror the pattern used in `src/app/(app)/bugs/page.tsx` for any admin-only page.
- Workspace scoping in SQL: always use `public.get_my_workspace_id()` and `public.is_workspace_admin()`. Don't inline `SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()`.

### Hex+alpha for orange tints

Right: `'#FF45001a'` or `'color-mix(in srgb, var(--lp-orange) 5.1%, transparent)'`
Wrong: `'var(--lp-orange)' + '1a'` (concatenation doesn't resolve the var)

### Tour-internal navigation — the shell layouts handle it

Everything under `/operations/[tourId]/`, `/budget/[tourId]/`, `/advance/[tourId]/` gets its navigation from the layout's `<ShellV3Mount>` (top bar + rail from ia.ts) — no per-page breadcrumb or chrome mount is needed. The redirects in `next.config.ts` send every `/tours/[id]/*` URL to its product-prefixed equivalent, so the old `<TourBreadcrumb>` component was unreachable and has been **deleted** (P8 hygiene). Don't reintroduce it; a tour-internal surface that needs chrome just lives under the right layout.

## Active project — pipeline complete

The four-product split (Home / Operations / Budget / Advance) is the app's architecture, and the multi-stage build pipeline that hardened it is **done**: the **MASTER PASS** (rates convergence, FX unify, income-actuals provenance, salvage/nav fixpacks) and the **DESIGN PASS** (surface-by-surface visual redesign across all products) are both COMPLETE and merged to `main`. `main` is the single line of development post the 2026-07-03 consolidation (see `docs/handover/CONSOLIDATION_2026-07-03.md`). P7 (Intake Upgrade) and P8 (this hygiene pass) closed the pipeline.

Nav / IA as it now stands:

- `/artists/[id]` — Home (artist-scoped overview). The artist's riders / channel lists / stage plots / files are the **Library** tab (route group `(home)/production` keeps its old URL name). "Production" means the TOUR's riders / plots / gear (tour menu group) — one word, one thing (Nov 2026).
- `/operations/[tourId]/*` — Operations. **The Overview is the tour landing** (`/operations/[id]` → `tourHomeHref()`); the old Schedule is Tour settings › Dates & routing.
- `/budget/[tourId]/*` — Budget (live).
- `/advance/[tourId]` (board) · `/advance/[tourId]/[routingId]` (show) · `/advance/[tourId]/templates` — Advance (rebuilt Oct 2026, see §"Advance — board, show, templates"). Day sheets are retired.

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
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
- The standalone rider editor /rider-packs/[id] is ARTIST scope —
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

- `/budget/[tourId]?tab=budget` is THE budget: `<BudgetSheetTop>` (totals per
  section + overhead % typed in place + commissions table) above the grid.
  The Summary card dashboard is DELETED; `?tab=summary|reports` resolve to
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
- Selection → rows goes through `viewRows()` (`src/components/grid/gridModel.ts`),
  never `flat()`: grouped by phase / status, `flat()[i]` is a different row from
  the one on screen. `groupedBuckets()` is the one place grouped order is decided
  (the renderer reads it too). Other selection ops (clear, copy, paste, fill)
  still use `flat()` — known wrong when grouped; not yet fixed.
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
- Known, unchanged: the income POST still pre-fills `actual_guarantee` from the
  deal on first save (#4), so the budget's ACTUAL income counts a show's
  guarantee before it's played. The page ignores that for status.

### Getting started — welcome + "Get set up" (Nov 2026, Adam)

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
  import Cesium as a value in app code — `import type` only. Vehicles are
  `vehicleBlocks()` (`src/lib/parking/blocks3d.ts`): the plan's silhouette
  parts lifted to true heights, standing at the LOWEST mesh height under the
  vehicle (so a tree doesn't lift a bus). Camera: right-drag / Ctrl-drag turn + tilt (Cesium's default had right-drag zoom), plus ↺ ↻ ⌃ ⌄ and a north compass that `orbit()` around the screen-centre ground point. 3D is look-only; a 3D PDF page
  keeps its camera (validated by `parseCamera3d`; see PDF pages below). No sky
  atmosphere — with the globe off it painted over the vehicles.
- **PDF pages** (`src/lib/parking/pages.ts`, on `view.pages`, checked by
  `parsePages`): any number (≤ 12) of plan and 3D pages, named and ordered in
  the editor's "PDF pages" list. Plan *fit* pages frame the PARKING (routes
  are left out unless they're all there is) at Fit or a chosen 1:N; plan
  *fixed* pages keep their own centre / rotation / 1:N ("This plan view");
  3D pages keep a camera ("Add this view as a page"). Every plan page carries
  the key + notes; the editor outlines each plan page's area. No pages saved =
  `defaultPages()` (Plan + 3D). One off-screen Cesium viewer renders all 3D
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
  the photo); inside / satellite off = the dark copy (`darkCopy`, lightness
  inverted, hues kept) so white selection lines stay visible. 3D: an INSIDE
  drawing clips the Google mesh (`ClippingPolygonCollection` — the roof comes
  off) and is the floor at the street height around it + `floor`; vehicles on
  it stand there. Levels: an item's `floor` ?? the inside drawing it's on ??
  0 (`itemFloor`); picking a level fades the rest and new items go on it; a
  plan PDF page can print one level. Headroom (`headroomWarnings`): a
  drawing's clear height, height-limit markers (`clear`, or read from the
  detail) at a door / over a vehicle / on a route. `/drawings` lists drawable
  files and offers the latest other map's drawings at this venue (shifted by
  the anchor difference). `view.satellite === false` = no imagery. The code
  reads/saves without the column until 288 is pasted (`withDrawings`).
- Known: each export is a new file (share the Parking maps folder for a link
  that stays current).

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
- **Day sheets are RETIRED** (pages, `/m/day` crew links — now a static "no
  longer active" page — tour roles, the Day Sheet PDF, the tour Labor page).
  Local crew calls live on each show's advance (`#crew-calls`). The
  `tour_roles` / `tour_role_links` tables are left in place, unread. Don't
  rebuild a per-day page beside the advance.

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
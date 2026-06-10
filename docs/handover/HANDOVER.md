# Lowpass — master handover (last ~4 weeks)

Supersedes the shorter `HANDOVER_FOR_BEN.md`. Two halves: **Part A** re-onboards
Ben (away ~a month); **Part B** is the deeper technical + method handover for CC
(Claude Code) and the next Cowork Claude. Read A for orientation, B for the work.

---

# PART A — for Ben (orientation)

## What Lowpass is
A tour-management web app for the Good Neighbours / Charlotte Sands world —
replacing the spreadsheets a tour manager lives in (budgets, rooming lists,
payroll, channel lists / riders, advance/day-sheets). Stack: **Next 16 · React 19
· TypeScript strict · Supabase (Postgres + RLS + Storage) · Tailwind v4**. Build
**only** via `next build --webpack` (Turbopack hangs on the Drive filesystem).

## The architecture you'd recognise (and what's settled since)
- **Product Split** — the app is four URL-prefixed products: **Home**
  (`/artists/[id]`), **Operations** (`/operations/[tourId]/*` — personnel, routing,
  rooming, payroll, channel list, stage plot, files, riders), **Budget**
  (`/budget/[tourId]/*`), **Advance** (`/advance/[tourId]/[routingId]`).
- **Two-tier chrome** — workspace tier (Artists/Personnel/Equipment) uses
  `(workspace)` group chrome; artist + tour tiers use **shell-v2**
  (`ProductRail` + `ProductHeader` + `ProductShell`). shell-v1 (`PageShell`) is
  legacy/auth-only.
- **Canonical entities** — person · flight · room · gear · show, each with a
  registry descriptor in `src/lib/entities/`. Go through the registry, don't query
  their tables raw from UI.

## What happened in the 4 weeks you were away (the big strokes)
1. **Security audit cleanup** — CSRF/origin protection consolidated into
   `src/proxy.ts` (a stray `src/middleware.ts` was breaking the Vercel build; the
   logic was merged into proxy, matcher broadened, `/api/` short-circuit). Done.
2. **Personnel unification** — the "keystone" bug: Payroll, Rooming and Personnel
   showed *different people* because Payroll/Rooming were reading from
   `personnel_rates` (rate cards) instead of `tour_personnel` (the roster). Now
   `tour_personnel` is the single row source everywhere; the others LEFT JOIN
   rates/rooms. (Migrations in the 204 area.) Several OPS-* follow-ups still open
   (see Part B).
3. **Budget redesign** — templates + sections model (migration **200 block**:
   `budget_sections`, section `kind`, templates), receipts, commissions, the burn
   bar, the two-band budget header.
4. **The grid overhaul** (the bulk of recent work) — see Part B §Grid. One
   canonical grid for every tabular surface; budget + rooming rebuilt on it; the
   shared routing rail; payroll/channel/export designed.

## Where it stands right now
Budget (on the new grid, default view), the shared routing rail, and rooming are
**built + verified**. Payroll and the channel-list re-skin are **designed +
prompted, not built**. Export is designed + parked. Live status:
**`docs/handover/GRID_OVERHAUL_STATUS.md`**.

---

# PART B — for CC + the next Cowork Claude (method + technical)

## The team + the loop
- **Adam** — product owner. Runs git + Claude Code, makes product calls, does the
  **final manual smoke**, holds the true UI state.
- **CC (Claude Code)** — the coder. Edits app code, runs `tsc`/`eslint`/`build`.
  **Cannot click-test** the auth-gated running app.
- **Cowork Claude** — designs surfaces, writes CC's build prompts, and
  **live-verifies in a real browser** (Claude-in-Chrome) — the runtime conscience.
- **Ben** — assistant.

**Cycle per surface:** design (chat + mockups → `GRID_SURFACES_DESIGN.md`) → gated
CC prompt (`docs/handover/CC_*.md`) → CC Stage A maps the real schema (no code) →
we answer decisions → CC Stage B builds + self-checks (`tsc 0 · eslint 0 ·
next build --webpack green`) + pushes → **Cowork Chrome-verifies** on the Vercel
preview → Adam manually smokes the rest (`SMOKE_QUEUE.md`) → merge to `main`.

## Branches / git
Almost everything lives on **`feat/personnel-unify`** (personnel + security +
budget grid + rail + rooming all accreted here). `main` is periodically merged
from it (PR recommended — the branch is large). The Drive sandbox sometimes can't
remove `.git/index.lock`; Adam runs git himself.

## What's canonical (read before assuming)
- **`docs/handover/GRID_OVERHAUL_STATUS.md`** — live status audit. START HERE.
- **`docs/handover/GRID_SURFACES_DESIGN.md`** — design spec for every surface +
  the **EVERYTHING-RELATES** principle (routing is the anchor; surfaces are
  bridges; add-a-week ripples to budget; surface the ripple).
- **`docs/prototypes/GRID_SPEC.md`** + `grid-playbox.html` — canonical grid spec +
  drive-able reference.
- **`docs/handover/CC_*.md`** — build prompts. **`*_MAP.md`** — CC's Stage-A maps.
- **`docs/smoke-tests/`** — per-surface smokes + `SMOKE_QUEUE.md` (Adam's manual).
- **`CLAUDE.md`** (repo root) — hard conventions.

**Canonical code:** `src/components/grid/*` (`Grid`, `GridSlideOver`, `types`,
`gridModel`) · `src/components/routing/RoutingRail.tsx` ·
`src/lib/grid/budgetAdapter.ts` (pure DB↔grid mapping — the adapter pattern every
surface follows) · `src/components/budget/BudgetGridView.tsx` ·
`src/components/rooming/RoomingView.tsx` (+ `useRoomingGrid`).

## The mentality
- **Everything relates.** `routing` (the day model) is the anchor; budget, rooming,
  payroll, advance are bridges. Design the day model (incl. per-person day
  overrides + budget-line generation) before piling on features.
- **Map both sides of a bridge before crossing.** Hence gated, Stage-A-first
  prompts — never write code against an unmapped schema.
- **Restructure > rebuild.** Rooming, payroll, channel list already exist as mature
  surfaces; re-skin/restructure them onto the canonical grid + rail. Don't rebuild
  and lose the smart features.
- **Structure is persistence.** Right topology + canonical components → each surface
  becomes "the grid + a config + an adapter".

## How we keep errors out (hard-won)
- **Gated map-first prompts.** Caught the `source_entity_type` CHECK drift that was
  the real cause of OPS-17 (payroll lines silently never reaching the budget,
  because the live CHECK rejected `'payroll'` and reconcile swallowed the error).
- **Verify before claiming.** CC names exact files/lines + marks build-verified vs
  needs-live. Never trust a bare "done".
- **Chrome live-verification is non-negotiable** (CC reads code, can't see
  runtime). It caught, among others: the dead **`--lp-orange`** token (real token
  is `--color-lp-orange`; the undefined var silently killed the selection ring +
  the drag insertion line — invisible in code); the **status filter** defaulting to
  4 statuses and hiding every `draft` budget row; the **currency totals** rendering
  USD while cells were GBP; a **stale Vercel preview** that wasted a cycle (always
  confirm the deploy commit is fresh).
- **CC over-claiming guard** — it has reported structural work "done" that wasn't.
  Open the diff / verify live before merge.
- **Don't dirty Adam's real data** — clean up test edits (delete test transactions,
  reset values).
- **Migration discipline** (`CLAUDE.md`): new migrations start at the **200 block**,
  sequential across `main` AND active branches, idempotent, RLS via existing
  helpers, down-block. ⚠ `npm run db:migrate` currently **can't auth**
  (`DATABASE_URL` password) — migration 208 was applied by hand in the Supabase
  SQL editor. Fix the runner or keep using the SQL editor.
- **Token + build rules:** all visual values via `var(--lp-…)`; build only via
  `next build --webpack`; never import from `_legacy/`; orange tints via hex+alpha
  or `color-mix`, never JS string-concat of CSS vars.

## Chrome access (the verification bridge)
Cowork Claude has **Claude-in-Chrome** paired to Adam's browser. On the Vercel
preview (Adam's logged-in session) it can navigate, screenshot, click, type, **run
JavaScript in the page** (resolve CSS vars, read `getComputedStyle`, fetch the
served CSS, inspect the DOM) and drive real interactions. That's how the runtime
bugs above were caught when CC's code-read couldn't.

## Workstream detail

### Security / proxy
CSRF + allowed-origin logic lives in `src/proxy.ts` (`isAllowedOrigin`, a
`MUTATING` method set, `/api/` short-circuit returning `NextResponse.next`,
broadened matcher). The stray `src/middleware.ts` is gone. `.mcp.json` Google key
was confirmed never exposed.

### Personnel unification (Operations)
`tour_personnel` = the single roster source. Payroll/Rooming list ALL roster
members, LEFT JOIN rate cards / room assignments. Components:
`AddPersonnelSlideOver`, `PersonnelManageSlideOver`, `SwapPersonnelModal`. Smokes
in `docs/smoke-tests/operations.md` (OPS-*). **Still open:** OPS-16 (swap keeps the
OLD name), OPS-04 (rooming→budget lines had no hotel name/cost — partly addressed
by the rooming rebuild; re-check), OPS-03/14 (off-roster person lingers). OPS-17's
**salary-population** half is FIXED (migration 208); its **fee-math** half lands in
the payroll build.

### Grid overhaul
- **Canonical `<Grid>` + `<GridSlideOver>`** (`src/components/grid/`) — Phases 1–2,
  keyboard nav / range / copy-paste / undo / reorder / 4 slide variants. Smokes
  GRID-/SLIDE-* in `docs/smoke-tests/grid.md`.
- **Budget** mounted on it (Phase 3) — `budgetAdapter.ts` (DB↔grid), real-data
  mount, currency binds to the `?display=` DISPLAY selector, reorder persists, slide
  Transactions/Documents CRUD against `budget_line_item_transactions` /
  `_attachments`, receipts count + delete affordance, **Grid is now the default
  view** (Classic still on the toggle). BUD-41…49.
- **Shared `<RoutingRail>`** — extracted `RailNightCell`; Advance retrofitted;
  days-on-left everywhere; `--lp-day-*` token aliases added. RAIL-01…06.
- **Rooming** restructured onto the rail — `RoomingView` (3 views: Matrix nights×
  people with shared-letter room codes / Nights per-hotel-stay / Cards rail+pickers),
  `useRoomingGrid`, the derived budget Accommodation feed unchanged (ROOM-06).
  Old `RoomingMasterGrid` removed.
- **Migration 208** — widened `budget_line_items.source_entity_type` CHECK to
  `hotel_booking·flight_booking·flight·payroll·payroll_per_diem·gear`. Applied via
  SQL editor.

## Open / next (full list in GRID_OVERHAUL_STATUS.md)
1. **Payroll** (`CC_PAYROLL.md`) — restructure existing payroll
   (`PayrollWeekSheet`/`RatesSpreadsheet`/`Summary`, `fees.ts`) onto grid + rail +
   the **OPS-17 fee-math fix**. Verify fees against Adam's sheet (Richie $4,611 ·
   Duncan $1,607 · Jake $2,250 · Adam PD $167). Keep `internal_rate` admin-gating +
   the branded PDF.
2. **Channel-list re-skin** (`CC_CHANNEL_LIST.md`, Option A) — re-skin the rider-pack
   editor; **preserve EVERY feature** (mic/DI search + library, the 5 inventory
   counters incl. cable "hot shot" options, outputs sub-grid, stage-box/sub-snake
   mgmt + Patch modal, drag-reorder, the stage-plot link). Hard-gated full inventory.
3. **Section-gutter** — section labels in a left gutter, not band rows (grid-wide).
4. **Budget loose end** (`CC_BUDGET_LOOSE_ENDS.md`) — BUD-49 delete affordance is
   DONE/verified; BUD-48 receipt-number-on-reload is in Adam's smoke queue.
5. **`<GridExport>`** — v7 design signed off, PARKED until all grids built +
   Adam-smoked; build on channel list first. Budget **Reports** tool is separate.
6. **Migrate-runner auth**, the **everything-relates day-model** (per-person day
   overrides → budget), the open **OPS-*** personnel items.

## Cowork handover (next Claude, start here)
You continue the grid overhaul in Cowork. You have: repo file tools, a bash
sandbox, Claude-in-Chrome on Adam's browser, the Vercel preview.
- Read `GRID_OVERHAUL_STATUS.md` → `GRID_SURFACES_DESIGN.md` → `CLAUDE.md` first.
- Write **gated** prompts (Stage A map → review → Stage B build). Never let CC guess
  schema.
- Demand verify-before-claiming, then **Chrome-verify yourself** — the failure mode
  is runtime bugs invisible to code-read.
- Keep `GRID_OVERHAUL_STATUS.md` + `SMOKE_QUEUE.md` current; don't dirty real data.
- **Next:** Payroll → Channel-list re-skin → section-gutter → Adam's full smoke →
  un-park `<GridExport>`.
- **Never break:** `routing` = the anchor; `<RoutingRail>` days-on-left everywhere;
  `var(--lp-orange)` resolves; migrations 200+; build via `next build --webpack`;
  restructure existing surfaces, don't rebuild.

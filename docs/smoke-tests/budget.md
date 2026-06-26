# Budget smoke tests

> **Last run**: 2026-06-05 on `feat/budget-grid-usable` preview — full
> Phases B–E. ID prefix `BUD`; IDs never recycled.

Reference tour: "Warning Support". Templates picker needs a NEW empty tour.

## Status snapshot (2026-06-05)

| ID | Result | Note |
|----|--------|------|
| BUD-01/02/06/07/09 | PASS | inline edit, persistence, title-only open, totals |
| BUD-10/11 | PASS | migration 200 applies; existing budgets load |
| BUD-13 | PASS | picker works; **make modal + prettier**; default to Budget tab (DONE) |
| BUD-14 | PASS | fixed: no longer flags template lines as duplicates (DONE) |
| BUD-15 | FIXED | optimistic section/line CRUD + `.maybeSingle()`; multi-select + delete work (Fix-pack A) |
| BUD-16 | FIXED | grouping now keyed on `section_id`; Category retired from UI (Fix-pack A/C) |
| BUD-17 | PASS→see BUD-26 | column resize now has visible handles |
| BUD-18 | PASS | phase strip hides with toggle (no reload) |
| BUD-19 | FIXED | click-to-rename templates + consistent picker (Fix-pack C) |
| BUD-20 | FIXED | summary reads live from `section_id`; no phantom sections (Fix-pack A) |

## Income redesign — Phase 1: Settlement (feat/income-settlement-phase1)

> Migration **215** (`budget_income.actual_deductions`, additive nullable). Run
> `npm run db:migrate`. tsc 0, eslint 0, build green. Actuals are unversioned —
> no `budget_version_income`/lock change.

- **INC-DED-01 — settlement upserts income (data-loss fix).** Settle a show that
  has **no** income row → a `budget_income` row is **created** for that
  `routing_id` with `actual_guarantee/overage/merch/deductions` (settlement POST
  upserts, was update-if-exists). The Income → **Actual** view shows it.
- **INC-DED-02 — deductions reach income + reduce NET.** Settle a show **with**
  deductions → `budget_income.actual_deductions` populated; the Summary P&L's
  **actual** income (and NET) drops by exactly that amount (no longer overstated).
  `computeBudgetPnl` subtracts it from both actual sums.
- **INC-DED-03 — VIP stays manual.** Settling does **not** touch `actual_vip`
  (settlement has no VIP source); an existing manual VIP survives a re-settle.
- **INC-DED-04 — Actual view shows Deductions (read-only).** The income Actual
  view has a read-only **Deductions** column; the row Total = guarantee + overage
  + merch + vip − deductions. Projected view + the versioning lock unchanged.

## Income redesign — Phase 2: Per-show currency (feat/income-currency-phase2)

> Migration **216** (`budget_income.currency` + `budget_version_income.currency`
> mirror, additive nullable; new `budget_fx_rates` table — per-tour, **unversioned**,
> RLS via `get_my_workspace_id()`). Run `npm run db:migrate`. tsc 0, eslint 0,
> build green. Currency is **proposed structure** → it follows the versioning lock.

- **INC-CUR-01 — per-show currency picker.** Income grid has a **Ccy** dropdown per
  show; options = the tour currency + every currency with an FX rate (Settings).
  Picking the tour currency stores `null`; any other stores the upper-cased code on
  `budget_income.currency`. Both Projected + Actual views show the same picker.
- **INC-CUR-02 — native-currency amounts.** A show set to a non-tour currency renders
  its money cells in that currency (e.g. €1000 with a red ≈ tour-currency note), via
  the row's `cur`. Tour-currency shows are unchanged.
- **INC-CUR-03 — FX-rate editor (Settings).** Budget → **Settings** → **FX rates**:
  add `EUR 1.17`, see `1 EUR = 1.17 <tour ccy>`; remove it (confirm dialog) →
  GET/POST/DELETE `/api/budget/fx-rates`. Adding the tour currency or a non-positive
  rate is rejected with a toast. Unversioned — editable on an approved budget.
- **INC-CUR-04 — P&L converts to tour currency.** A foreign-currency show **with** an
  FX rate → its gross/merch/pre-tax convert to the tour currency in the Summary P&L
  (`computeBudgetPnl` × `toTourCurrency`); a foreign show with **no** rate converts
  1:1. Totals stay in the single tour currency.
- **INC-CUR-05 — currency follows the version lock.** Approve a version → the **Ccy**
  cell goes read-only (projected view) and editing income 423s; the projected
  `currency` is snapshotted into `budget_version_income` and re-overlaid on the
  approved view. Unlock → editable again. Actuals + Phase-1 deductions unaffected.

## Income redesign — Phase 3: Deal-aware projection engine (feat/income-projection-p3-stageb)

> Migration **217** (per-show projection inputs on `budget_income` + the
> `budget_version_income` mirror; tour config on `budget_settings` — all additive
> nullable). Run `npm run db:migrate`. Engine `src/lib/budget/incomeProjection.ts`
> (pure, unit-tested: `node --experimental-strip-types src/lib/budget/incomeProjection.test.ts`,
> 20 checks). tsc 0, eslint 0, build green. Decisions LOCKED 2026-06-25.

- **INC-PROJ-01 — VS tiered overage (marginal).** Projected view: set a show
  `Deal=VS`, `Cap`, `Sell %`, `Face`, `Deal %` 55, `@ Tix` 275, `↑ %` 65,
  `Guarantee`. The **Overage** cell fills from the engine: marginal share =
  `perTicketNBOR × (55%×275 + 65%×(tickets−275))`, overage = `max(0, share −
  guarantee) × haircut`. Hand-calc matches (worked example in the engine test:
  Cap 500 × 80% = 400 tix, Face 30, tax 8% → overage pre-WH **2871.05**).
- **INC-PROJ-02 — non-tiered VS.** Clear `@ Tix` → flat `Deal %` on all tickets
  (`Deal % × tickets × perTicketNBOR`), overage recomputes.
- **INC-PROJ-03 — overage floored at 0.** A guarantee that beats the % → Overage
  fills **0** (never negative).
- **INC-PROJ-04 — PLUS / FLAT no auto-overage.** `Deal=PLUS` or `FLAT` → the
  engine writes **no** overage; the cell stays user-entered (PLUS is manual).
- **INC-PROJ-05 — merch + VIP project.** `$/Head` × `Fee %` × `Cap` × `Sell %` →
  **Merch** fills; `VIP Tix` × `VIP £` → **VIP** fills. Independent of deal type.
- **INC-PROJ-06 — tour-default fallback.** Leave a show's `Sell %` / `$/Head` /
  `Fee %` blank, set them in **Settings → Projection defaults** → the engine uses
  the tour default. A per-show value overrides it.
- **INC-PROJ-07 — overage config.** Settings → Projection defaults → `Overage
  haircut` (0.65) + `Box-office tax` (0.08) change the projected overage for every
  VS show on the next input edit.
- **INC-PROJ-08 — user override.** Type directly into Overage / Merch / VIP → the
  manual value is kept (a direct edit wins); it stays until a relevant input is
  re-edited (which re-runs the engine).
- **INC-PROJ-09 — P&L parity.** `computeBudgetPnl` total is unchanged from the
  materialised values — the engine writes a **pre-withholding** overage into
  `pre_tax_overage`; the P&L applies WH once (`postTaxOver`), no double-count.
- **INC-PROJ-10 — versioning lock.** Approve a version → every projection input
  cell (Cap/Sell/Face/Deal/Deal%/@Tix/↑%/$Head/Fee/VIP Tix/VIP£) goes read-only;
  a write 423s; the inputs snapshot into `budget_version_income` and re-overlay on
  the approved view. Unlock → editable. (Tour config in Settings stays editable —
  unversioned.)

## Budget Versioning Phase 1 — B2 (UI, feat/budget-versioning-b2)

> Wires the live B1 contract. tsc 0, eslint 0, build green. Chrome-verify on the
> preview.

- **BUD-VER-07 — version selector + Current pill.** The budget sub-bar shows
  `vN · status ▾` (beside the tour identity). Dropdown lists every version
  (number + status); the approved one carries the orange **Current** pill (in the
  dropdown AND as a persistent chip). Selecting a non-active version views it via
  `?version=` (read-only).
- **BUD-VER-08 — read-only-when-locked proposed.** On an approved version the
  Expenses **est** cells render locked (🔒, mirror the derived-lock); **act**
  stays editable. Income **projected** columns are read-only; the **actuals** view
  stays editable. (Grid `versionLocked` prop, default off → drafts unchanged.)
- **BUD-VER-09 — Unlock-or-New-Version modal.** Editing a locked est cell (click
  or keypress) raises the modal *"This budget is approved & locked — Unlock &
  re-approve / Create a new version"* — **not a toast**. A `423 VERSION_LOCKED`
  API response raises the same modal. A non-approver sees the explanation only
  (no unlock/amend).
- **BUD-VER-10 — Settings approval controls.** Settings tab → "Versions &
  approval" card: **Approve & lock** (draft + approver, optional note) / **Unlock
  & re-approve** / **New version from approved** (amend). Hidden for
  non-approvers (server also enforces).
- **BUD-VER-11 — amend switches version.** Amend → new draft v(n+1) clones v1 +
  v1→superseded; the selector updates and the page switches to the new draft
  (`?version=`).
- **BUD-VER-12 — income proposed from version_income.** Income projected values
  come from the active version's `budget_version_income` (B1 overlay); actuals
  stay on `budget_income.actual_*`; P&L variance reads approved-version income.

> **AI "Add it"** is still a TODO — when built it must surface `423` as the
> BUD-VER-09 modal (noted, not built).

## Budget Versioning Phase 1 — B1 (data + state, feat/budget-versioning-b1)

> Migration **212**. Run `npm run db:migrate` (backfills a DRAFT **v1** per
> existing tour from current proposed). Code: tsc 0, eslint 0, build green,
> reconcile-lock unit test 10/10. **DB-dependent items are Adam's to verify after
> migrating** (the integrity layer can only be exercised against a live DB).

- **BUD-VER-01 — approve atomic + one-Current.** Approve a draft → it becomes
  `approved` (Current); any prior approved flips to `superseded` in one txn. A
  concurrent second approve fails on the `one approved per tour` partial unique
  index (409).
- **BUD-VER-02 — route lock guard (423).** On a tour whose active version is
  approved: a **proposed** write to `/api/budget/line-items` (PATCH or POST add)
  or `/api/budget/income` (pre_tax_*) → **423 `VERSION_LOCKED`**; an **actual**
  write (actual_cost / actual_* / receipts) → **200**; a **mixed** write → 423
  (wholesale, no partial apply). Same guard = the AI "Add it" intercept.
- **BUD-VER-03 — DB-level immutability.** A direct `UPDATE/INSERT/DELETE` on
  `budget_version_lines/_sections/_income` whose parent version isn't `draft` is
  **denied by the trigger** (not just the route) — a locked version is
  uncorruptable even by a buggy server path.
- **BUD-VER-04 — reconcile post-lock → actual only.** Lock a version → change a
  `personnel_rates` rate → the locked **proposed snapshot is UNCHANGED** and
  `budget_line_items.actual_cost` moved. (Logic locked by the unit test;
  end-to-end is Adam's DB verify.)
- **BUD-VER-05 — amend.** Amend → v2 clones v1's lines+income into a new draft
  (`parent_version_id` set); v1 → `superseded`; v2 becomes Current on approval.
- **BUD-VER-06 — approver gate.** approve/unlock/amend require
  `is_budget_approver()` (admin OR a `budget_approver_grants` row) — server + the
  status-change trigger; a non-approver → 403.

## P0 — budget SSR crash hardening (fix/budget-ssr-hardening)

#### BUD-58 — a bad/edge-date tour renders instead of 500-ing
**Do**: Open the budget for the **Good Neighbours / South Africa Aug'26** tour
(the one that crashed the whole page with "Refresh, something went wrong").
**Expect**: the budget grid renders (it may degrade — no phase strip / empty
burn panel if that tour's data is the edge case), and the **real cause is logged
to the Vercel function logs** (`[lp] …`), not shown as a crash.
**Why it crashed**: the page awaited a top-level `Promise.all` of the server data
fns **unwrapped**, and `computeTourPhases.shiftDate` did `new Date(bad).toISOString()`
which **throws `RangeError: Invalid time value`** on a malformed date → the whole
SSR 500'd. **Fix**: guard the date helpers (`shiftDate`, `isoWeekKey`) so an
invalid date logs + falls back instead of throwing; self-guard `computeTourPhases`
/ `getBudgetPanelData` / `loadTourIncome` (degrade to empty + log); `.catch` the
two enrich awaits; `generateMetadata` `.single()`→`.maybeSingle()`. New
`logServerError` helper (console.error → Vercel; no swallowing — Sentry-ready).
**Still wanted**: the actual Good Neighbours trace/URL to confirm the exact
thrower (the hardening is safe either way).
**Last verified**: tsc 0, eslint 0, build green; Adam live.

## Fixed this pass (retest on next deploy)

- **Budget is the landing tab** (BUD-13) — `resolveBudgetTab` defaults to `budget`.
- **No duplicate warning on $0 lines** (BUD-14/15) — `detectDuplicates` skips zero-cost pairs.
- **Phase strip hides when tracking off** (BUD-18) — gated on `track_phases` in `page.tsx`.

## Open — correctness (the real failures)

- **Section CRUD has no optimistic updates + a `.single()` bug.** Create
  /rename/delete sections (and lines) are slow, revert until refresh,
  and throw "Cannot coerce the result to a single JSON object" (a
  `.single()` on a row RLS/returns 0). Same disease the line grid had —
  apply optimistic updates to section ops; swap `.single()` →
  `.maybeSingle()` / return the written row. (BUD-15, BUD-18, BUD-20.)
- **Section model is half-migrated** (`category` vs `section_id`).
  Renaming a line's category doesn't move it between sections; you can
  add lines to categories that aren't real sections; the summary shows
  sections that aren't in the grid. `section_id` must be the single
  grouping source: move a line = pick an existing section (dropdown), no
  free-text orphan categories. (BUD-16, BUD-20.)
- **Delete line is broken** (paused, didn't delete). (BUD-15.)
- **No multi-select** — need shift-click + select-all so bulk ops are
  usable. (BUD-15.)

## Open — UX / polish

- Empty-state picker should be a **modal over the screen**, not an inline
  menu; make it prettier (UX/UI + 21st). (BUD-13.)
- Visible **drag handles** for resizable columns + rows. (BUD-17.)
- **Click-to-rename templates**; the template-contents dropdown should
  match the Advance section style for consistency. (BUD-19.)
- Unclear **add-line / delete-section** buttons. (BUD-15.)
- Slide-over still doesn't match the grid design language. (BUD-04, prior.)
- IA: "too many ways to find things" — consolidate toward a single
  spreadsheet surface.

## Open — Stage 3 (income + spreadsheet maths) — newly requested

- **Income as its own tab**: guarantees, predicted merch sales, VIP.
- **Formula rows**: cost-of-goods % deduction; management commission +
  agent commission (one net, one gross); contingency %. Net P&L bottom
  line. DB already has `budget_income` / `budget_commissions` /
  `budget_settings` (insurance/contingency/accountancy %).
- Goal: spreadsheet-level calculation, not hand-typed totals.

## Templates

- BUD-13 presets are "okay, not quite right." Adam will build the correct
  ones; then persist them site-wide as system/workspace templates
  (template-authoring + save flow needed).

## Grid + nav overhaul (current)

Reference: "Warning Support" (populated) + a fresh empty tour for the picker.

#### BUD-21 — Burn bar
Open `/budget/[tour]`. One burn bar at the top: big **Remaining** + "of $X
budget"; a spent/budget **meter** ("$X spent · NN% used") with a thin
**Committed marker** on the same scale; the fill turns **red** past 100%;
a **Variance** read (arrow + colour, red over / green under) on the right.
No KPI cards.

#### BUD-22 — Quiet section headers
Every section group header reads **NAME · count** only — no
`est… · act… · var…` triplet; the filter bar shows just the row count. The
est/act/var summary lives only in the burn bar.

#### BUD-23 — Raised panel
The grid reads as a **raised panel** lifted off the page (lighter surface
bg than the page + border + visible shadow), not flat. Header + section
rows sit a step higher (`--lp-panel`). Channel-list + payroll grids are
raised the same way.

#### BUD-24 — Fills the width (name column flexes)
The grid fills the container; the **Item/description column stretches** to
absorb the leftover width — no dead band on the right. Numbers stay fixed
+ right-aligned. On ultra-wide the panel caps ~1600px and centres.
Horizontal scroll appears only when columns exceed the container.

#### BUD-25 — Density (app-wide, 3 levels)
Toggle = Compact / Comfortable / Spacious, **default Comfortable**.
Changing it resizes rows + text on the budget grid, the **Income tab**,
AND other grids (channel-list, payroll, a list like Personnel). Persists
on reload. (Shared with UI-05.)

#### BUD-26 — Column resize
Hover a column's right edge → handle appears (grab cursor); drag resizes
that column live; can't drag to zero; dragging the flex (name) column
starts from its **rendered** width (no jump). Widths **persist** on
reload; "Reset widths" restores defaults. Works on channel-list + payroll
too. (Shared with UI-07.)

#### BUD-27 — Two-band budget top
Budget top is **two bands** then content: product bar (Home · Operations ·
Budget · Advance, active = solid orange) → **one context band** (tour
identity + Summary · Expenses · Income tabs + Display/Export/Settings) →
burn bar → grid. Not four stacked layers. The tabs read as tabs and
switch correctly.

#### NAV-01 — Two-bar app nav
No left sidebar anywhere. The top product bar shows on every product;
hover a product → dropdown of its sub-pages → click lands directly (one
load). Each product, the workspace tabs (Artists/Personnel/Equipment), and
Settings/Venues/Bugs all load.

> These supersede the earlier BUD-15/16/20 failures (section CRUD,
> category-vs-section, summary refresh) — all resolved in Fix-pack A.

## Quick-fixes (feat/budget-quick-fixes — retest)

#### BUD-28 — Commissions add/remove in Settings

**Do**: Budget → Settings. Add a commission line, edit its % and basis,
delete one (confirm dialog).

**Expect**: Add/remove are optimistic (no full reload); the Summary P&L
recomputes to match (commission feeds `computeBudgetPnl`).

**Last verified**: 2026-06-07 (Adam, preview) — ✅ PASS after the `main`
merge brought `BudgetSettingsTab` in. Follow-up (redesign): move commissions
out of Settings into a budget tab so it's not buried.

#### BUD-29 — Density toggle present + app-wide

**Do**: On the budget grid, use the density control in the context band:
Compact / Comfortable / Spacious.

**Expect**: Rows + text resize; the choice persists on reload; the same
control resizes the other grids (channel-list, payroll).

**Last verified**: 2026-06-07 (Adam, preview) — ✅ PASS once the merge
conflict in `BudgetContextBand` was resolved. Follow-up (redesign): the grid
now has two toolbars split by the summary bar — too cluttered; consolidate.

#### BUD-30 — Receipts as a compact top button

**Do**: On the budget grid toolbar, click **"Receipts"**; drop a file on it
or open the popover.

**Expect**: A compact button + popover near the top of the grid (the old
bottom drop-zone is gone); upload/link works.

**Last verified**: 2026-06-07 (Adam, preview) — works, but the `main` merge
left TWO Receipts buttons (inline mount + page `receiptSlot`). Fixed by
removing the inline mount in `BudgetSpreadsheetView` (kept the page-driven
slot). Re-verify there's now exactly one on the next build.

## Phase 3 — canonical `<Grid>` on Expenses (in progress)

Mounting the canonical `<Grid>` + `<GridSlideOver>` (see `grid.md`) on
`/budget/[tourId]` Expenses, replacing `BudgetSpreadsheetView`. **Stage A** map:
`docs/handover/PHASE3_BUDGET_MAP.md`. **Stage B floor (landed, this PR):**

#### BUD-31 — `source_entity_type` CHECK drift fixed (migration 208)
**Do**: `npm run db:migrate` (applies `208_widen_source_entity_type_check.sql`).
**Expect**: the live `budget_line_items.source_entity_type` CHECK now matches
what reconcile writes (`hotel_booking·flight_booking·flight·payroll·
payroll_per_diem·gear`). Migration 026 only allowed two; the live DB had
drifted — a fresh clone would have silently dropped the Salary/Per-Diem/gear
derived sections. **Read-safe**; records the drift.
**Last verified**:

#### BUD-32 — budget↔grid adapter (pure, unit-tested)
`src/lib/grid/budgetAdapter.ts` maps `budget_line_items`/`budget_sections` →
grid `Section[]`/`Row` and grid edits → DB patches (both directions tested:
`node --experimental-strip-types src/lib/grid/budgetAdapter.test.ts` → 7 checks).
Formula sections excluded; derived sections classified + sourced; `est`→
`proposed_cost`, `act`→`actual_cost`(+override), no `vendor` column.

#### BUD-33 — Grid (beta) renders on real budget data
**Do**: Budget → Expenses tab → click **Grid (beta)** (default is Classic).
**Expect**: The canonical `<Grid>` renders the live sections + lines (same
data as Classic); the production view is untouched on the **Classic** toggle.
**Last verified**:

#### BUD-34 — Cell edits persist (survive reload)
**Do**: In Grid (beta), edit an Item / Estimate / Actual / Status on a normal
line; reload.
**Expect**: The edit persisted (PATCH `/api/budget/line-items`, optimistic, no
flash). A rejected write toasts + refreshes.
**Last verified**:

#### BUD-35 — Derived sections locked (est + act)
**Do**: Look at the Salary / Accommodation sections.
**Expect**: They show the 🔗 source pill; **both** Estimate and Actual are
read-only with a 🔒 (the reconcile owns them — GRID_SPEC §6).
**Last verified**:

#### BUD-36 — Currency uses the tour FX
**Do**: A foreign-currency line (e.g. EUR on a GBP tour).
**Expect**: The cell shows the SOURCE figure in its currency + a red ≈
conversion in the tour currency (via `src/lib/budget/fx.ts`, not the demo
table); the tour's own symbol (£/$/€) is used throughout.
**Last verified**:

#### BUD-37 — Slide opens (LINE variant, DB statuses)
**Do**: Click the orange **Open** chip on a line.
**Expect**: The slide opens as the LINE variant (no person/hotel/settlement);
the Status menu lists the DB set (`draft·quoted·approved·paid·disputed`); slide
edits to item/est/act/status/notes persist.
**Last verified**:

#### BUD-38 — Line + section CRUD persists
**Do**: In Grid (beta): **＋ Add line** in a section; **🗑 Delete line** (deletes
the active line) from the toolbar; **＋ Add section**; double-click a section
name to rename.
**Expect**: Add line / section + delete line POST/DELETE then re-fetch; rename
PATCHes (no flash). All survive reload. (Derived sections can't be added to /
their lines are reconcile-owned.)
**Last verified**:

#### BUD-39 — Grid (beta) shows all rows (status filter = surface status set)
**Do**: Budget → Expenses → **Grid (beta)** on a populated tour (e.g. "Simple
Plan Support | Fall'26").
**Expect**: Every section renders its lines (Classic and Grid (beta) show the
same row count — e.g. 10 rows: 4 Accommodation + 5 Salary + 1 Uncategorised),
each with its DB status pill (`draft` etc.). The "SHOW STATUSES" filter lists
the surface's status set (`draft·quoted·approved·paid·disputed` for budget),
all checked by default.
**Root cause (fixed)**: the grid's status filter + its default-all-checked init
were hardcoded to the canonical 4 (`budgeted·paid·reconciled·refunded`). Every
budget line's status is `draft` (DB default), so all rows were filtered out →
0 rows. Now driven by `statusUniverse(columns, sections)` — the union of the
status column's `options` and every status actually present in the data — so
the filter defaults to all of the surface's statuses and never silently hides a
row whose status isn't in the canonical set. `/grid-demo` (no status config)
still defaults to the canonical 4. (Grid.tsx: `statusUniverse`, `filterRef`
init, `FilterPop` `statusList`, status-group view.)
**Last verified**: code/build green; Adam to re-confirm live via Chrome DOM.

#### BUD-40 — Totals/KPIs use the display currency + tour FX (not USD)
**Do**: Budget → Expenses → **Grid (beta)** on a GBP-display tour. Read the
toolbar total, every section header `est/act`, and the burn bar together. Then
flip the **Display** selector £→$ and re-read.
**Expect**: With Display = £, the toolbar total, section-header `est/act`, and
group totals all read **£…** and the SALARY total matches the burn bar
(`£11,550`), not `$14,669`. Switching Display to $ converts **cells AND totals
together** consistently.
**Root cause (fixed)**: decision 5 (grid takes FX + display currency as props)
was applied to the cell-render path but missed the total/section-header/KPI
maths, which still used `gridModel.disp`/`fmt` (the demo USD-pivot table, GBP→USD
1.27). Grid.tsx now derives `dispC`/`fmtC` from the injected `fx` and routes the
section totals, grand totals, and calc/formula cell formatting through them; the
unused `disp`/`fmt` imports are dropped. `/grid-demo` (no `fx` prop → `demoFx`)
is unchanged.
**Last verified**: code/build green; Adam to re-confirm live (totals in £
matching the burn bar; a Display switch converting cells + totals together).

#### BUD-41 — Grid binds to the DISPLAY selector
**Do**: Budget → Expenses → **Grid (beta)** on a GBP tour. Flip the **Display**
selector £→$.
**Expect**: grid **cells AND totals** convert to US$ together with the burn bar
(previously the grid ignored the selector and stayed £). A line whose currency
≠ display renders the red ≈ converted note (GRID_SPEC §4). Currency-less lines
fall back to the **native** tour currency, not the display one.
**Last verified**: code/build green; Adam to re-confirm live (DISPLAY flip moves
cells + totals + burn bar in lockstep).

#### BUD-42 — Row + section reorder persists
**Do**: In Grid (beta), drag a line within its section; drag a section. Reload.
**Expect**: the new order survives reload (optimistic; PATCHes `sort_order` on
`budget_line_items` / `budget_sections` — both routes already accept it). A
failed write toasts + refreshes to the true order. Derived rows are reorderable
and persist (reconcile's update path doesn't reset `sort_order`); a brand-new
derived row starts at top until reordered.
**Last verified**: code/build green; Adam to re-confirm live.

#### BUD-43 — Slide Transactions CRUD (real table)
**Do**: In Grid (beta), open a non-derived line's slide → Transactions. Add a
transaction; edit its name/date/amount; attach a receipt; delete it. Reload.
**Expect**: writes hit `budget_line_item_transactions` via the real routes
(POST/PATCH/DELETE) and survive reload. The line's **Actual** auto-syncs to the
Σ transactions server-side **unless** `actual_cost_override` (no double-write —
decision 6); the synced Actual shows on next reload. "Attach receipt" creates +
links an `expense_receipts` row (sets `receipt_id`) and the chip shows the
receipt label. (Demo `/grid-demo` keeps its in-memory transactions.)
**Last verified**: code/build green; Adam live.

#### BUD-44 — Slide Documents CRUD (attachments)
**Do**: In the slide → Documents. **Add** (OS file picker → upload), **rename**
(inline), **delete**. Reload.
**Expect**: writes hit `budget_line_item_attachments` via the route (POST
upload, new **GET** list-on-open, new **PATCH** rename, DELETE). The type chip
shows the file extension (no category column on the table). Survives reload.
**Last verified**: code/build green; Adam live.

#### BUD-45 — 📎 Receipts cell shows a real count
**Do**: Look at the Receipts column; click the 📎 on a line with transactions /
documents.
**Expect**: the badge counts documents + transactions from server-supplied
`attachment_count` + `transaction_count` (no per-row fetch on render); clicking
lazy-loads the lists and the toaster lists them (docs as `Type: name`, txns as
`Txn: vendor 📎`) with **Open line ↗**.
**Last verified**: code/build green; Adam live.

#### BUD-46 — Grid is the default Expenses view
**Do**: Open Budget → Expenses (fresh load).
**Expect**: the **Grid** view renders by default (was Classic). The toggle still
offers **Classic** (one click) and **Grid**. (`BudgetGridToggle` default = `grid`.)
**Last verified**: code/build green; Adam live.

#### BUD-47 — slide Actual live-updates on a transaction edit
**Do**: Open a non-derived line's slide. Add a transaction / edit its amount /
delete it — watch the **Actual** field and the grid's Actual cell **without
reloading**.
**Expect**: Actual tracks Σ transactions immediately (no page reload), matching
the server's auto-sync — **unless** the line has a manual override (typed Actual)
or is derived/locked. Removing the last transaction leaves Actual as-is (the
server preserves it). Done on commit, not per-keystroke.
**Last verified**: code/build green; Adam live.

#### BUD-48 — loaded receipts show their number
**Do**: Attach a receipt to a transaction, reload, reopen the slide.
**Expect**: the receipt chip shows the real **receipt number** (e.g. `R-001`),
not a generic "Receipt". The transactions GET joins `expense_receipts`
(`receipt_number`).
**Last verified**: code/build green; Adam live.

#### BUD-55 — receipt numbers are UNIQUE per tour (+ vendor on chip)
**Do**: Attach **two** receipts (to two transactions); reload; reopen the slides.
**Expect**: each chip shows its **own** number (`R-001`, `R-002`) — no shared
"R-001". When a receipt has a vendor, the chip reads `R-00n · Vendor`.
**Why it was broken**: the receipts POST swallowed its max-query error and was
non-atomic → every receipt stored `R-001`; no UNIQUE guard let it persist
(BUD-01). **Fix**: migration `209` renumbers existing dups per tour + adds
`UNIQUE (tour_id, receipt_number)`; the POST no longer swallows the read error,
computes max defensively, and **retries on `23505`**; the txn GET also embeds
`vendor`. Format unchanged (`R-00n`).
**Migration**: run `npm run db:migrate` (209) before this passes on a tour that
already has dup `R-001`s.
**Last verified**: tsc 0, eslint 0, build green; Adam live.

#### BUD-56 — Phase 0 tab bar (SUMMARY | EXPENSES | INCOME | SETTINGS)
**Do**: Open `/budget/[tourId]`. Read the context-band tabs. Then hit a stale
`?tab=reports`.
**Expect**: exactly **Summary · Expenses · Income · Settings** as four equal
tabs (Settings moved out of the corner, plain — no gear icon; Reports gone).
`?tab=reports` lands on **Summary** (no 404). Grid/Classic toggle + every tab
body still render. (`BudgetContextBand` items; `resolveBudgetTab` maps
`reports → summary`.)
**Last verified**: tsc 0, eslint 0, build green; Adam live.

#### BUD-57 — "Add transaction" is obvious
**Do**: Open a line's slide-over → Transactions.
**Expect**: a clear **"＋ Add transaction"** control — the section-header button
is relabelled (was "＋ Add") AND a full-width dashed **"＋ Add transaction"**
button sits at the **bottom** of the list (where you expect to add a row).
Clicking either adds a transaction via the real route (`addTxn` → `lineApi
.addTransaction`); the trailing-row path still works.
**Last verified**: tsc 0, eslint 0, build green; Adam live.

#### INC-01 — income grid shows routing context columns
**Do**: Budget → Income.
**Expect**: read-only **Date · Type · Venue · City** columns (replacing the
combined "Show" column), from the routing each income row carries (Type =
Show/Travel/Off via `labelForDayType`). Money columns + totals/P&L unchanged
(field names + `/api/budget/income` write path byte-identical; the new columns
are `ro`). (`IncomeRow.day_type` added; `BudgetIncomeGrid` routingCols.)
**Last verified**: tsc 0, eslint 0, build green; Adam live.

#### BUD-49 — transaction row has a discoverable delete
**Do**: Open a line's slide → Transactions. Look at a transaction row.
**Expect**: a clear **trash button** (lucide `Trash2`, bordered, hover turns red)
sits at the end of the row next to the amount — not a faint `✕` buried beside
"🔗 Link". Clicking it deletes the transaction (real route); the line's Actual
re-syncs per BUD-47 (last-txn removal preserves Actual). (`.txn-del` in grid.css.)
**Last verified**: code/build green; Adam live.

> **Phase 3 budget = complete** once BUD-46…49 live-verify (BUD-41…45 already
> green). Then merge `feat/personnel-unify` → main and start Rooming.
> Still out of scope (Phase 4): the txn **🔗 Link** (`transaction_links`),
> settlement / projections.

## Income tab → canonical `<Grid>` (BUD-50…54) — 2026-06-11

> Migrated `BudgetIncomeTab` onto the same `<Grid>` as Expenses. Map:
> `docs/handover/BUDGET_INCOME_MAP.md`. **The P&L bridge is preserved** — same
> income field names, same `post_tax = pre_tax × (1 − wh/100)` rule, same
> `/api/budget/income` upsert, so `computeBudgetPnl`'s `income_gross` is
> unchanged. New file `BudgetIncomeGrid.tsx`; legacy `BudgetIncomeTab.tsx` kept
> **unmounted** as a fallback until the P&L parity is live-verified.
> Two additive `<Grid>` props (default-safe): `allowAddRows` (Income=false) +
> Column `ro` (Show read-only). `tsc` 0 · `eslint` 0 · build green · adapter 7/7.

#### BUD-50 — Income renders on `<Grid>`
> **Preview FAIL → FIXED.** First cut self-fetched on the client and got stuck on
> "Loading income…" (the client fetch never committed after a 200 — a runtime
> lifecycle bug tsc/eslint/build can't catch). **Fix:** Income is now **prop-fed**
> like Expenses — `page.tsx` server-fetches via the shared `loadTourIncome` +
> `toIncomeRows` (`src/lib/budget/income.ts`, the SAME merge the GET route now
> calls) and passes `initialRows`; `BudgetIncomeGrid` renders the `<Grid>`
> synchronously from props with **no loading gate**. The client GET stays only
> for the post-save failure resync. Bridge unchanged (same fields/upsert/P&L).
**Do**: Budget → **Income** tab.
**Expect**: rows = the tour's **shows** (one per routing date; the income +
routing_only merge — a new routing date appears automatically; **no add/delete**,
no Group/Add-section chips). Projected columns: Show (read-only) · Guarantee ·
WH% · Post-tax · Overage · Merch · VIP · Total. **Renders immediately (no
spinner).**

#### BUD-51 — Edit recomputes + persists (no reload)
**Do**: Edit Guarantee / WH% / Overage / Merch / VIP on a show.
**Expect**: **Post-tax + Total recompute live** (calc columns); the value
persists via `POST /api/budget/income` (single field, merge-safe), optimistic,
no reload. WH% clamps 0–100 on save.

#### BUD-52 — Projected ↔ Actual toggle
**Do**: Flip the segmented toggle above the grid.
**Expect**: the **column set swaps** (Actual = Guarantee/Overage/Merch/VIP/Total,
no WH%/Post-tax — actuals are net); actual cells edit + persist to the `actual_*`
fields.

#### BUD-53 — P&L bridge (the must-not-move check)  ⟵ Adam, Chrome
**Do**: Note the Summary P&L **income** for a set of inputs, then re-enter the
same inputs via the new grid.
**Expect**: `computeBudgetPnl`'s **`income_gross` is identical** to pre-migration
for identical inputs (field names + post-tax rule + upsert unchanged).

#### BUD-54 — Currency follows DISPLAY
**Do**: Flip the **Display** selector.
**Expect**: income cells + totals convert via the same `fx` as Expenses (source
figure + red ≈ note when display ≠ tour currency).

> Default-safety proof (BUD-46 invariant): no existing `<Grid>` consumer sets
> `allowAddRows`/`ro` (grep clean) — Expenses (`BudgetGridView`), `/grid-demo`,
> and `gridModel` are byte-for-byte unchanged.

> **Still deferred to the grid-default flip (called out):** row/section
> **reorder** persistence (`sort_order`), and the slide's Transactions/
> Documents CRUD (budget rows don't carry them yet — they live in
> `budget_line_item_transactions` / `_attachments`, a follow-up). The
> **Classic** view keeps those until wired — which is why the toggle stays.

> Cross-ref `docs/smoke-tests/grid.md` for the grid component's GRID-/SLIDE- IDs.

## Known later

- Actual-vs-transactions override math (gates a `transactions.ts` refactor).
- Deliberate gaps: per-artist template override UI; drag-reorder;
  top-level "Line item"/Quick-Add still create section-less lines.

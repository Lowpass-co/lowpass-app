# Phase 3 — Budget (Expenses) ↔ canonical `<Grid>` topology map

> **Stage A deliverable. No code changed.** This maps the live budget data
> layer against the `<Grid>` contract so the Stage-B adapter doesn't guess
> schema. Every table/column/path below was verified in the migration files
> and source (file:line cited), not assumed. **Decisions for Adam at the end —
> Stage B is gated on those.**

Scope reminder: **Expenses only.** Income / settlement / projections /
`transaction_links` are Phase 4 (called out, not built).

---

## 1. Budget data layer (tables + columns)

All budget tables **have** `CREATE TABLE` migrations — **none are hand-made**
(the CLAUDE.md hand-made list is `rental_*`, `workspace_members`; no budget
table is on it).

### `budget_line_items` — the expense lines
`017_budget_system.sql:68` (created), then ALTERed by 024/026/049/051/052/054/055/064/105/**200**.
Columns the Expenses grid needs:

| Grid concern | Column | Type / default | Added by |
|---|---|---|---|
| line id | `id` | uuid PK | 017 |
| tour / ws scope | `tour_id`, `workspace_id` | uuid FK NOT NULL | 017 |
| **label** | `label` | text NOT NULL | 017 |
| **estimate** | `proposed_cost` | numeric DEFAULT 0 | 017 |
| **actual** | `actual_cost` | numeric DEFAULT 0 | 017 |
| actual override | `actual_cost_override` | bool DEFAULT false | 105 |
| **status** | `status` | text DEFAULT `'draft'` **CHECK(draft\|quoted\|approved\|paid\|disputed)** | 024 |
| **currency** | `currency` | text NULL (→ inherit tour) | 017 |
| **notes** | `notes` | text | 017 |
| quantity | `quantity` | int DEFAULT 1 | 017 |
| legacy group | `category` | text NOT NULL | 017 |
| **section** | `section_id` | uuid FK→`budget_sections` ON DELETE SET NULL | **200** |
| legacy section | `section` (text) + `sort_order` | text / int | 054 |
| ordering | `order_index` | int DEFAULT 0 | 017 |
| derived source | `source_entity_type` | text CHECK(`hotel_booking`\|`flight_booking`\|`flight`) **+ used: `payroll`,`payroll_per_diem`*** | 026 |
| derived source id | `source_entity_id` | uuid | 026 |
| canonical FKs | `flight_id`,`hotel_id`,`room_id`,`gear_id`,`tour_gear_id`,`expense_id`,`routing_id` | uuid FK | 049/051/052/055 |
| phase | `phase_tag` | text CHECK(pre_prod\|rehearsals\|show_days\|wrap) | 064 |
| legacy receipt | `receipt_id` | uuid | 017 |
| **no `vendor` column** | — | — | — |

\* ⚠ The `source_entity_type` CHECK in migration 026 lists only
`hotel_booking/flight_booking/flight`, but `reconcileDerivedLines.ts` writes
`'payroll'` and `'payroll_per_diem'` (and `'hotel_booking'`). Either the CHECK
was widened in a later migration or the inserts rely on it being permissive —
**Stage B must confirm the live CHECK allows the payroll values** before relying
on them (flagging, not assuming).

### `budget_sections`
`200_budget_sections_templates.sql:36`, ALTERed by `203_budget_section_kind.sql`.
`id, tour_id, workspace_id, name, sort_order, created_at, kind`.
**`kind` text NOT NULL DEFAULT `'custom'` CHECK(custom\|commission\|insurance\|contingency\|cogs)** (203). Partial unique index: one formula-kind section per tour.

### `budget_settings` (`017:13`, +200)
`currency_home` (GBP), `currency_tour` (USD), `exchange_rate`(+`_updated_at`),
`insurance_pct`(.03), `contingency_pct`(.02), `accountancy_pct`(0), `track_phases`, `notes`.

### `budget_commissions` (`017:30`)
`id, tour_id, workspace_id, label, percentage, basis (DEFAULT 'gross'), notes, order_index`. **This is where the formula %/basis live — NOT on the line.**

### `budget_line_item_transactions` (`104:19`)
`id, workspace_id, line_item_id FK, vendor_name, amount numeric(12,2), currency, paid_at date, receipt_id FK→expense_receipts, notes, sort_order`. **Vendor + per-vendor amounts live here**, not on the line. Their sum = the line's actual unless `actual_cost_override`.

### `budget_line_item_attachments` (`024:10`)
`line_item_id FK, file_url, file_name, file_type, file_size_bytes, uploaded_by, uploaded_at, notes` — quotes/invoices/photos.

### `expense_receipts` (`017:194`)
`receipt_number, date, vendor, cost_tour_currency, cost_home_currency, receipt_file_url, in_budget, linked_line_item_id FK→budget_line_items, …`.

### `budget_income` (`017:39`) — **Phase 4**, not this phase.

---

## 2. Current read / write path

**Load — `src/app/(app)/budget/[tourId]/page.tsx` (server component):**
- `tours` fetched with **`.maybeSingle()`** (hotfix; `.single()` throws on RLS-filtered rows).
- **`await reconcileDerivedBudgetLines(supabase, tourId, workspaceId)` BEFORE reading** (~line 118) — derived rows/sections are materialised into `budget_line_items` on every load.
- Parallel direct-Supabase reads: `budget_line_items.select('*')` (ordered section→sort_order→category→order_index), `budget_sections.select('*')`, `budget_settings`, `routing`, plus (summary/budget tabs) `budget_income` + `budget_commissions`.
- `enrichLinesWithTransactionAggregates(supabase, rawLines)` adds `transaction_sum`/`count`/`effective_actual_cost`.
- Passes immutable props to `<BudgetSpreadsheetView lines sections … income commissions settings receiptSlot/>`.

**Persist — `src/components/budget/BudgetSpreadsheetView.tsx` (client):**
- **Direct `fetch()` to API routes** (NOT `useAutoSave`). Optimistic overlay (`optimistic` state map) + **no `router.refresh()` on success**; rollback + refresh on failure (`commitLineEdit`, ~984–1024).
- `POST/PATCH/DELETE /api/budget/line-items`; `POST/PATCH/DELETE /api/budget/sections`.
- Bulk status / delete = parallel PATCH/DELETE.

**API routes** (`src/app/api/budget/`):
- `line-items/route.ts`: GET (calls `reconcileDerivedBudgetLines` on full load; also gear-hire sync), POST (**`.select().single()`** ~294 ⚠), PATCH (**`.maybeSingle()`**; **blocks edits to label/cost/currency/status when the row is derived** — `flight_id/hotel_id/room_id/gear_id` or `source_entity_type='payroll'`, ~375–407), DELETE (`?id=` or body).
- `sections/route.ts`: GET, POST (**`.single()`** ~127 ⚠; `normalizeSectionKind`, graceful fallback if `kind` column missing), PATCH (`.maybeSingle()`), DELETE.
- `STATUS_VALUES = ['draft','quoted','approved','paid','disputed']` (`line-items/route.ts:320`).

> **Reuse target:** the Stage-B adapter should persist through these **same two
> routes** (they already enforce the derived-line locks + workspace RLS). ⚠ The
> two **POST** handlers use `.single()` — Stage B should keep edits on PATCH or
> switch POST to `.maybeSingle()` (BUD-15 disease).

**Chrome (the mount point to swap), `page.tsx` ~286–301:**
```
<ProductShell> … <BudgetDensityProvider><BudgetTrackPhasesProvider>
  <BudgetContextBand …/>            ← two-band header + tabs (BUD-27)
  <BudgetBurnBar lines tourCurrency/>  ← burn bar (BUD-21)
  <BudgetPhaseStripGate>…
  {tab==='budget' && <BudgetSpreadsheetView …/>}   ← REPLACE ONLY THIS
```
Auto-save infra exists (`src/lib/forms/useAutoSave.ts` + `<SaveStatus>`) if we prefer it over the bespoke optimistic pattern.

---

## 3. The `<Grid>` data contract (`src/components/grid/types.ts`) ↔ DB

**Section** `{ name, kind: 'normal'|'derived'|'formula', source?, rows, accent? }`
**Row** `{ _uid?, item?, vendor?, est?, act?, status?, cur?, notes?, pct?, basis?, custom?, transactions?, docs?, links?, memos?, [colId]: unknown }`

| Grid field | DB source | Notes / mismatch |
|---|---|---|
| `Section.name` | `budget_sections.name` | ✓ |
| `Section.kind='normal'` | `budget_sections.kind='custom'` | ✓ (rename in adapter) |
| `Section.kind='formula'` | `budget_sections.kind ∈ commission/insurance/contingency/cogs` | ✓ but **rows are computed** (see ⚠ below) |
| `Section.kind='derived'` + `Section.source` | **NO DB column** — inferred | ⚠ derived sections are `kind='custom'`, named *Accommodation/Salary/Per Diem*; derived-ness lives on the **lines** (`source_entity_type`/FKs). Adapter must infer kind+source. |
| `Section.accent` | — | assigned by index in grid (fine) |
| `Row._uid` | `budget_line_items.id` | ✓ stable id |
| `Row.item` | `label` | ✓ |
| `Row.est` | `proposed_cost` | ✓ |
| `Row.act` | `actual_cost` / `effective_actual_cost` | ✓ (override-aware) |
| `Row.status` | `status` | ❌ **ENUM MISMATCH** (§4) |
| `Row.cur` | `currency` (null→tour) | ✓ |
| `Row.notes` | `notes` | ✓ |
| `Row.vendor` | **NONE on the line** | ❌ vendor lives on `budget_line_item_transactions.vendor_name`. Grid's vendor column has no 1:1 line column. |
| `Row.pct`/`basis`/`custom` | `budget_commissions.percentage/basis` (+`computeBudgetPnl`) | ⚠ **formula rows are computed, not stored as line_items**. Grid formula section ≠ DB rows. |
| `Row.transactions[]` (name·date·amount·receipt) | `budget_line_item_transactions` (vendor_name·paid_at·amount·receipt_id) | ✓ mappable (field renames) |
| `Row.docs[]` (type·name·id) | `budget_line_item_attachments` (file_type·file_name·id) and/or `expense_receipts` | ✓ mappable |
| `Row.icon` | — | cosmetic; drop or derive |
| `Row.links[]` | — | ❌ `transaction_links` is **Phase 4** |
| `Row.memos[]` | — | ❌ deal memos = Income = **Phase 4** |

**Column set (Expenses):** idx · item(text→label) · vendor(text→**no col**) · est(money→proposed_cost) · act(money→actual_cost) · variance · status · receipts(→txn/receipt count) · notes. Quantity (`quantity`) exists in DB if we want it. Numbers right-aligned/fixed; item flexes (GRID-24).

**Net mismatches:** (a) status enum, (b) vendor has no line column, (c) formula rows computed not stored, (d) derived section kind/source inferred not stored, (e) links/memos = Phase 4.

---

## 4. Status enum — **MISMATCH, decision required**

| | values |
|---|---|
| **DB** (`budget_line_items.status` CHECK, 024) | `draft` · `quoted` · `approved` · `paid` · `disputed` |
| **Grid canonical** (`gridModel.STATUSES`, slide hardcodes it) | `budgeted` · `paid` · `reconciled` · `refunded` |

Only `paid` overlaps. **Do not silently coerce** — that corrupts the CHECK or loses meaning. Two clean options:

- **(A) Keep the DB's 5.** Configure the Expenses **column** `options` to the DB set, and make the **slide** status menu surface-configurable (today `GridSlideOver` hardcodes `STATUSES`). No migration. Grid's canonical 4 then only applies to the demo / future surfaces.
- **(B) Migrate to the canonical 4.** New `208_*.sql`: widen/replace the CHECK + backfill (`draft→budgeted`, `paid→paid`, and a **lossy** decision for `quoted/approved/disputed→?`). Mirror `208` in the header; idempotent; RLS via existing helpers; down-migration block. Per `database/migrations/README.md` next sequential is **208** (highest on main = 207).

My recommendation: **(A)** for Phase 3 (no lossy data migration; the grid column/slide are meant to be per-surface configurable) — but it needs the slide's status list to become a prop. **Adam's call.**

---

## 5. Derived sections (Payroll / Rooming)

`reconcileDerivedLines.ts` materialises three sections by **name** (all
`kind='custom'` in `budget_sections`):

| Section | `source_entity_type` | est **and** act | lock |
|---|---|---|---|
| **Accommodation** | `hotel_booking` (`hotel_id` set) | `Σ room.cost_amount × nights` per hotel | locked |
| **Salary** | `payroll` | `Σ computeTotalFee(rate, dayCounts)` per rate card | locked |
| **Per Diem** | `payroll_per_diem` | `Σ computeTotalPerDiem` | locked |

- **Write-back rule (§GRID_SPEC §6):** both `proposed_cost` AND `actual_cost`
  are **recomputed every reconcile pass** and overwritten — the source module
  (Payroll/Rooming) owns them. `line-items` PATCH **blocks** label/cost/
  currency/status edits on these rows (`~375–407`); `notes` stays editable.
  Canonical lock predicate: `isUx14DerivedBudgetLine(row)` +
  `isUx14DerivedLockedCell(row, col)` in `src/lib/budget/budgetUx14Derived.ts`.
  → ⚠ This is **stricter than GRID_SPEC** (spec says "estimate locked, **actual
  editable**"; the live budget locks BOTH and regenerates them). **Decision
  below.**
- **Adapter detection:** a line is derived if `source_entity_type ∈
  {hotel_booking, payroll, payroll_per_diem}` OR it has `hotel_id/room_id/
  flight_id/gear_id/tour_gear_id`. Section→derived+source inferred by grouping
  those lines (Accommodation→Rooming, Salary/Per Diem→Payroll).
- **Formula sections** (`kind` ∈ commission/insurance/contingency/cogs): rows
  are **computed by `computeBudgetPnl()` at render**, from `budget_commissions`
  + `budget_settings` — they are **not** `budget_line_items`. The grid's
  formula section must be fed these computed rows (read-only), not DB lines.

---

## 6. Currency + receipts

- **Per-line currency:** `budget_line_items.currency` (nullable → tour's
  `budget_settings.currency_tour`). ✓ maps to `Row.cur`.
- **FX:** `src/lib/budget/fx.ts` — **static `RATES_VS_GBP` (GBP pivot)**:
  GBP 1, USD .79, EUR .85, CAD .58, AUD .52, JPY .0051; `convertToCurrency()`;
  "hardcoded; admin overrides later". ⚠ **The grid's own `gridModel.FX` is a
  DIFFERENT table** (USD pivot: USD 1, GBP 1.27, EUR 1.08…). **Two FX sources
  disagree.** The adapter must use the budget `fx.ts` (the live P&L uses it),
  not the grid demo's. Decision below.
- **Transactions:** `budget_line_item_transactions` ↔ `Row.transactions[]`
  (`vendor_name→name`, `paid_at→date`, `amount`, `receipt_id→receipt`). ✓
- **Documents:** `budget_line_item_attachments` ↔ `Row.docs[]`
  (`file_type→type`, `file_name→name`, `id`). Receipts also via
  `expense_receipts` (the `ReceiptInbox`/BUD-30 inbox + `/api/budget/receipts*`).
- **Actual-cost sync:** `transactions.ts syncActualCostIfNoOverride` — editing
  transactions updates `actual_cost` unless `actual_cost_override`. The grid's
  slide editing `act` directly must respect this (set override, or write txns).
- **Gap (Phase 4):** no per-line non-receipt doc types beyond attachments; no
  `transaction_links` relational graph; no admin FX override.

---

## Decisions needed from Adam (Stage B is gated on these)

1. **Status (§4): (A) keep DB's `draft/quoted/approved/paid/disputed`** and make
   the Expenses column + slide status list surface-configurable (no migration),
   **or (B) migrate to `budgeted/paid/reconciled/refunded`** (new `208_*.sql`,
   lossy backfill for quoted/approved/disputed)? *(I recommend A.)*
2. **Derived actuals (§5):** the live budget **locks both est AND act** on
   derived lines (regenerated each reconcile); GRID_SPEC §6 says **actual
   editable**. Keep the stricter live behaviour (both locked), or honour the
   spec (unlock actual — which then fights the reconcile overwrite)? *(I
   recommend: keep both locked for Phase 3 — matches the live truth.)*
3. **Vendor column (§3b):** the Expenses grid has a `vendor` column but
   `budget_line_items` has no vendor. Drop the vendor column for the budget
   surface, or surface the **first transaction's `vendor_name`** read-only, or
   add a `vendor` column (migration)? *(I recommend: drop it from the Expenses
   column set for Phase 3; vendor lives in the slide's Transactions.)*
4. **Formula sections (§5):** render the computed `commission/insurance/
   contingency/cogs` rows as the grid's read-only **formula** section (fed from
   `computeBudgetPnl`), or leave the P&L formula block to the Summary tab and
   keep the Expenses grid to real `budget_line_items` only for Phase 3? *(I
   recommend: Expenses grid = real lines + derived sections only; formula P&L
   stays on Summary, port to a grid formula section in a follow-up.)*
5. **FX (§6):** confirm the adapter uses `src/lib/budget/fx.ts` (GBP pivot) as
   the single FX source and the grid demo's `gridModel.FX` is demo-only. Any
   plan for the admin-override FX, or static for now?
6. **Persistence:** reuse `/api/budget/line-items` + `/api/budget/sections`
   (they already enforce derived locks + RLS) with the grid's optimistic
   model — agreed? And fix the two **POST `.single()`** calls to `.maybeSingle()`
   while there?
7. **Adapter test:** OK to add a unit test for the DB↔grid mapping (both
   directions) as Stage B step 1 before any UI?

**Stopping here per the gate. Awaiting approval before Stage B.**

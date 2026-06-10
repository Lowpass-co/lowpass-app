# CC — Phase 3 Stage B: GO (decisions answered)

Stage-A map (`PHASE3_BUDGET_MAP.md`, `ce85b3a`) reviewed and **spot-verified
against source** (status CHECK `024:5`; `source_entity_type` CHECK `026:10`;
the `.single()`/`.maybeSingle()` split). The map is accurate. Decisions below;
Stage B is authorised. Still **Expenses only** — Income/settlement/projections/
`transaction_links` remain Phase 4.

## Decisions

1. **Status → (A) keep the DB's 5** (`draft·quoted·approved·paid·disputed`). **No
   migration.** Make the grid's status set **surface-configurable** instead of
   hardcoded: the Expenses status **column `options`/`optColors`** and the
   **`GridSlideOver` status menu** must take the allowed values as a **prop**
   (today `GridSlideOver` hardcodes `gridModel.STATUSES`). The canonical 4 stay
   the demo default. Rationale: migrating is lossy (`quoted/approved/disputed`
   have no clean target) and would touch live data for no Phase-3 benefit. The
   status *taxonomy* is a separate product decision we can revisit deliberately
   later.
2. **Derived actuals → keep BOTH est + act locked** (the live truth). The
   reconcile pass regenerates both every load, so an "editable" actual would be
   silently overwritten — worse than an honest lock. Keep the live behaviour;
   reuse `isUx14DerivedBudgetLine` / `isUx14DerivedLockedCell`. **Update
   `GRID_SPEC.md §6`** to say derived actuals are locked-until-write-back (the
   spec's "actual editable" was aspirational; reconcile owns both).
3. **Vendor → drop the vendor column** from the Expenses column set. There is no
   `vendor` column on `budget_line_items`; vendor lives on
   `budget_line_item_transactions.vendor_name`. Adam has also said the vendor
   column "isn't useful." Surface vendor only in the slide's **Transactions**
   (read the txn `vendor_name`); no migration.
4. **Formula sections → leave on the Summary tab** for Phase 3. The Expenses
   grid renders **real `budget_line_items` + the derived sections only**. The
   computed commission/insurance/contingency/cogs P&L (from `computeBudgetPnl`
   + `budget_commissions`/`budget_settings`) is NOT line-item data — porting it
   into a grid read-only **formula** section is a clean follow-up, not this
   phase.
5. **FX → use `src/lib/budget/fx.ts`** (GBP pivot) as the single source. The
   grid's `gridModel.FX` (USD pivot) is **demo-only** — the grid component must
   accept the FX table / converter as a **prop/injection**, not import the demo
   one. Static rates for now; admin-override is later.
6. **Persistence → reuse `/api/budget/line-items` + `/api/budget/sections`**
   (they already enforce the derived locks + workspace RLS) with the grid's
   optimistic model. **Fix the two POST `.single()` → `.maybeSingle()`**
   (`line-items/route.ts:~294`, `sections/route.ts:~127`) while you're there —
   the BUD-15 disease. Keep destructive/edits on PATCH where they already are.
7. **Adapter unit test → yes.** Stage B step 1: a pure DB-row ↔ grid
   `Section[]`/`Row` mapping module with a test covering **both directions**
   before any UI.

## ⛔ REQUIRED migration 208 — the `source_entity_type` CHECK rejects payroll (also fixes OPS-17)

**Confirmed against the LIVE DB + code (not assumed):**
- Live constraint (Adam's Supabase query):
  `budget_line_items_source_entity_type_check` =
  `IN ('hotel_booking','flight_booking','flight')` (+ NULL). **No `payroll` /
  `payroll_per_diem`.**
- `src/server/budget/reconcileDerivedLines.ts:304` inserts
  `source_entity_type: sourceType` with `sourceType='payroll'` (Salary) /
  `'payroll_per_diem'` (Per-Diem). Those inserts **violate the CHECK and throw**,
  and the wrapping `try/catch` (`:373-376`) **silently swallows** the error.
- ⇒ **Payroll & Per-Diem derived lines never persist.** Accommodation
  (`hotel_booking`) persists because it's allowed. **This is the root cause of
  OPS-17** ("payroll does NOT flow to the budget SALARY section (empty)") — an
  open Operations smoke fail.

**So migration `208` is REQUIRED (not optional):** widen the CHECK to match what
reconcile writes —
`('hotel_booking','flight_booking','flight','payroll','payroll_per_diem')`.
Idempotent (drop + re-add the named constraint), header-numbered, down-block,
RLS untouched (it's a CHECK). Confirm `208` is free per
`database/migrations/README.md` (highest on main + active branches) before using
it. **Land 208 BEFORE the derived step** — until it lands there are no payroll
lines to detect, and the adapter's `source_entity_type='payroll'` detection is
correct only once it does. Note in `operations.md` that 208 fixes OPS-17's
"empty salary section" half (the fee-math half is separate).

## Build order (from the Phase 3 prompt — unchanged)

1. Adapter module + bidirectional unit test (no UI).
2. **Migration `208` (REQUIRED)** — widen the `source_entity_type` CHECK (above);
   this unblocks payroll/per-diem derived lines AND fixes OPS-17. (No status
   migration — decision 1A.)
3. Mount `<Grid>` + `<GridSlideOver>` on `/budget/[tourId]`, Expenses column set,
   **inside the existing chrome** — keep `BudgetContextBand` + `BudgetBurnBar` +
   `ProductShell`; replace **only** the `{tab==='budget' && <BudgetSpreadsheetView/>}`
   body (`page.tsx ~109`). No shell-v1.
4. Persistence via the two routes + optimistic; survives reload; `.maybeSingle()`.
5. Derived sections: infer kind/source from `source_entity_type`/FKs per the map
   §5; both cells locked.
6. Currency (per-line `currency`, `fx.ts`) + transactions/documents wired to the
   real tables; respect `syncActualCostIfNoOverride` when the slide edits `act`.

## Steps 3–6 (the mount) — GO

Floor (adapter + test + 208 + route hardening) reviewed and verified correct.
Proceed with the UI mount. Two notes folded in:

- **Display parity:** the adapter returns `actual_cost`. Confirm the old
  `BudgetSpreadsheetView` didn't display `effective_actual_cost` (the
  txn-sum/override-aware enriched value); if it did, surface that instead so
  numbers don't change for the user on lines where the two diverge.
- **Per-row derived lock:** lock derived rows using the carried `_derived` flag
  (not only `Section.kind==='derived'`), so a derived line in a mixed/ungrouped
  section still shows the lock. Server already blocks the edit; keep the UI
  consistent.

After you push, the grid mount will be **live-verified on the preview via Chrome
DOM** (adapter render, persistence-survives-reload, the now-populated Salary
section once 208 is applied, derived locks, currency) before Adam smokes.

## Hard rules
- Tokens (`var(--lp-orange)` resolves now). Build `next build --webpack`; tsc 0;
  eslint 0. Don't regress the personnel/security/grid work on this branch.
- **Verify before claiming**: name files/lines; say what's build/code-verified
  vs needs a live smoke. The preview is now inspectable via Chrome DOM — land it
  and I'll verify the mount on the running page.
- Land smoke IDs in `docs/smoke-tests/budget.md` (cross-ref `grid.md`).

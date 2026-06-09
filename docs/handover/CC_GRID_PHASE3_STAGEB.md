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

## ⚠ Pre-req for the derived step (do NOT skip)

Before wiring derived sections, **confirm the live DB's `source_entity_type`
CHECK actually permits `'payroll'` and `'payroll_per_diem'`.** The committed
migration `026` only allows `hotel_booking|flight_booking`, and nothing widens
it — yet reconcile writes payroll values and the live budget shows Salary/Per
Diem sections, so the live constraint must have drifted from the migrations.
Either (a) run a quick `\d budget_line_items` / `information_schema` check
(Adam can run it in Supabase), or (b) inspect the constraint, and if the
migrations don't match the live DB, write a small **`208_*.sql`** that widens
the CHECK to match what reconcile actually writes
(`hotel_booking, flight_booking, flight, payroll, payroll_per_diem`) — idempotent,
header-numbered, down-block. This is read-safe for Phase 3 (we only READ derived
lines), but the drift must be recorded + fixed so a fresh clone reconciles.

## Build order (from the Phase 3 prompt — unchanged)

1. Adapter module + bidirectional unit test (no UI).
2. (No status migration — decision 1A.) Verify the `source_entity_type` CHECK
   drift (above); write `208` only if needed.
3. Mount `<Grid>` + `<GridSlideOver>` on `/budget/[tourId]`, Expenses column set,
   **inside the existing chrome** — keep `BudgetContextBand` + `BudgetBurnBar` +
   `ProductShell`; replace **only** the `{tab==='budget' && <BudgetSpreadsheetView/>}`
   body (`page.tsx ~109`). No shell-v1.
4. Persistence via the two routes + optimistic; survives reload; `.maybeSingle()`.
5. Derived sections: infer kind/source from `source_entity_type`/FKs per the map
   §5; both cells locked.
6. Currency (per-line `currency`, `fx.ts`) + transactions/documents wired to the
   real tables; respect `syncActualCostIfNoOverride` when the slide edits `act`.

## Hard rules
- Tokens (`var(--lp-orange)` resolves now). Build `next build --webpack`; tsc 0;
  eslint 0. Don't regress the personnel/security/grid work on this branch.
- **Verify before claiming**: name files/lines; say what's build/code-verified
  vs needs a live smoke. The preview is now inspectable via Chrome DOM — land it
  and I'll verify the mount on the running page.
- Land smoke IDs in `docs/smoke-tests/budget.md` (cross-ref `grid.md`).

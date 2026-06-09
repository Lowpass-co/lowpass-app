# CC — Phase 3: wire the canonical `<Grid>` to the real Budget (Expenses)

Phases 1+2 built and verified the canonical `<Grid>` + `<GridSlideOver>` against
static data at `/grid-demo`. Phase 3 mounts that grid on the **real**
`/budget/[tourId]` Expenses surface, backed by the live Supabase budget tables,
replacing the bespoke `src/components/budget/BudgetSpreadsheetView.tsx`.

Income / settlement / projections are **Phase 4** — NOT this phase. Expenses
only.

## ⛔ This prompt is GATED. Do Stage A and STOP. Do not write wiring code yet.

The grid meets the real data layer here. Guessing table names, the status
enum, the derived-line mechanism, or the receipts linkage will silently corrupt
the budget. So Stage A is **mapping + questions only — zero code changes**.
After Adam/the reviewer approves your Stage-A plan, you get Stage B.

---

## Stage A — map the territory, then stop (NO code)

Produce a short written topology doc (`docs/handover/PHASE3_BUDGET_MAP.md`)
covering exactly these, with real file paths + table/column names you verified
(not assumed):

1. **Budget data layer.** Every table the budget Expenses surface reads/writes:
   sections, lines, their columns. For each line: where do `estimate`,
   `actual`, `status`, `currency`, `vendor`, `section_id`, notes live? Quote the
   `CREATE TABLE` (or the migration) for each. Flag any table that has **no**
   migration file (CLAUDE.md lists `rental_*`, `workspace_members` as hand-made
   — note if budget has any like that).
2. **Current read/write path.** How does `BudgetSpreadsheetView.tsx` +
   `budget/[tourId]/page.tsx` load and persist today — direct Supabase client,
   or `src/app/api/` routes? Name the functions. This is the path the grid
   adapter must reuse or replace.
3. **The `<Grid>` data contract.** From `src/components/grid/types.ts`: the
   `Section` / `Row` / `Column` shapes the grid expects. Map each grid field to
   its DB source, and list every **mismatch** (grid field with no DB column, DB
   column with no grid field).
4. **Status enum.** What status values does the DB store today vs the grid's
   canonical `budgeted · paid · reconciled · refunded`? If they differ, a
   migration is needed — say so; don't silently coerce.
5. **Derived sections.** How do Payroll- and Rooming-derived budget lines work
   today (the personnel-unify work on THIS branch)? Where do their
   estimate/actual come from, and what's the write-back rule (est locked,
   actual editable — per `GRID_SPEC.md §6`)?
6. **Currency + receipts.** Is there a per-row currency column + an FX source?
   How do transactions/receipts link to a line today (the `ReceiptInbox` /
   BUD-30 system)? The grid's slide has Transactions/Documents — map them to the
   real linkage or flag the gap.

Then list **the decisions you need from Adam** before building — e.g. status
migration yes/no + which migration number (200 block, next sequential per
`database/migrations/README.md`), whether Income column reuse vs relabel,
FX source, how derived actuals write back. **Stop there.**

---

## Stage B — build (ONLY after the Stage-A map is approved)

Scope, in order (each step verifiable before the next — build the floor before
the ceiling):

1. **Adapter layer** (`src/lib/grid/budgetAdapter.ts` or similar): pure
   functions DB rows → grid `Section[]`, and grid edits → DB writes. No UI yet;
   unit-test the mapping both directions.
2. **Status migration** (if Stage A found a mismatch): new `2NN_*.sql` in the
   200 block, idempotent, RLS via existing helpers, down-migration block. Mirror
   the number in the header. Read `database/migrations/README.md` first.
3. **Mount `<Grid>` + `<GridSlideOver>`** on `/budget/[tourId]`, Expenses column
   set, **inside the existing budget chrome** — keep the burn bar (BUD-21), the
   two-band context header + tabs (BUD-27), `<ProductShell>`. Replace only the
   `BudgetSpreadsheetView` body. Do NOT introduce shell-v1.
4. **Persistence**: optimistic updates + debounced persist, reusing the existing
   budget write path from Stage A (or the `useAutoSave` pattern). Edits must
   survive reload. `.maybeSingle()` not `.single()` (the BUD-15 disease).
5. **Derived sections** wired to real Payroll/Rooming data: estimate locked
   (🔒), actual editable, write-back per the Stage-A rule.
6. **Currency + receipts** wired to the real columns/linkage from Stage A.

Defer to Phase 4 (state explicitly, don't build): Income column set, settlement
slide, projections, `transaction_links` relational graph.

## Hard rules
- **Map both sides before writing** — Stage A gates Stage B. Don't guess schema;
  surface questions (CLAUDE.md: "When uncertain, ask the user").
- Migrations: 200 block, next sequential across `main` AND active branches;
  idempotent; read the migrations README. Don't add a hand-made table.
- Tokens only (`var(--lp-…)`); `var(--lp-orange)` now resolves (fix-pass 3).
- Build via `next build --webpack`; `tsc --noEmit` 0; `eslint` 0.
- This branch also carries the personnel-unify + security + grid work — don't
  regress it; confirm the branch builds green as a whole.
- Land smoke IDs in `docs/smoke-tests/budget.md` (+ cross-ref `grid.md`).
- **Verify before claiming**: name the exact files/lines changed; the app is
  auth-gated so you can't click-test — say what's build/code-verified vs needs a
  live smoke. (We now verify the live preview via Chrome DOM inspection.)

## Done (Stage A) =
`PHASE3_BUDGET_MAP.md` committed with the six maps + the decision list, no code
changed. Wait for approval before Stage B.

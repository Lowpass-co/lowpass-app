# Grid overhaul — status audit (2026-06-10)

Honest state of the whole grid overhaul. **Correction:** rooming + payroll are
designed + prompted, **not built**. Only budget + the routing rail are
built/verified.

## ✅ BUILT + live-verified (via Chrome)
- **Canonical `<Grid>` + `<GridSlideOver>`** core — Phases 1–2 (keyboard nav,
  range select, copy/paste, undo, reorder, slide variants). GRID/SLIDE smokes.
- **Budget (Expenses) on the canonical grid** — Phase 3 complete: real-data
  mount, currency-binds-to-DISPLAY, reorder persist, slide Transactions/Documents
  CRUD, receipts count, **Grid is the default view**. BUD-41…47 verified;
  **BUD-48 = your manual smoke** (receipt-number on reload, needs a file upload).
- **Shared `<RoutingRail>`** — Advance retrofit, RAIL-05 verified pixel-identical.
- Migration **208** (source_entity_type CHECK) applied → payroll/rooming derived
  budget lines persist; **OPS-17 salary-population half fixed + verified**.

## 🟡 DESIGNED + PROMPTED — NOT BUILT YET
- **Rooming** — 3-view design locked; `CC_ROOMING.md` written; CC did the
  **Stage-A map** (`ROOMING_MAP.md`). **Stage B (the build) has NOT run** — gated
  behind the budget merge. It's a *restructure* of the existing `RoomingMasterGrid`
  onto the rail (nights-left) + nights + cards views.
- **Payroll** — 3-view design + verified formulas locked; `CC_PAYROLL.md` written.
  **Nothing built.** It's a restructure of the existing payroll
  (`PayrollWeekSheet`/`RatesSpreadsheet`/`Summary`) onto the grid + rail, **plus
  the OPS-17 fee-math fix** (show-vs-travel split, per-person travel rate, advance,
  no-tour-unpaid).
- **Channel list re-skin** — Option A decided (re-skin existing rider-pack editor,
  keep smart cells). **Prompt not written yet** (next to draft).
- **Section-gutter** (section labels in a left gutter, not band rows) — designed;
  grid-wide change; folds into the rooming/grid work. Not built.
- **`<GridExport>`** — v7 design signed off. **PARKED** until all grids built +
  Adam-smoked.
- **Budget Reports tool** (P&L/variance — separate from GridExport) — flagged,
  not designed/built.

## ⚠ Open follow-ups / loose ends (don't lose these)
- **Budget:** BUD-48 manual smoke; **transaction DELETE affordance** — no
  discoverable delete on the txn row (hover showed none) → possible BUD-43
  follow-up; one **leftover empty "New transaction" row on Freight** (test
  residue, £0) to delete.
- **Personnel/Ops (same branch, partly addressed by the grid builds):** OPS-16
  (swap keeps OLD name), OPS-04 (rooming→budget lines had no hotel name/cost),
  OPS-03/14 (off-roster person lingers). Confirm which survive after rooming/
  payroll builds.
- **Rooming rail filter:** rooming shows **all nights-away** (not Advance's
  show-days-only) — caller pre-filters the rail entries; confirm in the build.
- **Migration runner:** `npm run db:migrate` still can't auth (`DATABASE_URL`
  password) — 208 was applied via the SQL editor. Future migrations need the
  runner fixed OR the SQL-editor route.
- **"Everything relates" architecture** (add-a-week → routing; per-person day
  overrides → budget; surface the ripple) — captured as the core principle, NOT
  built; informs the day-model before piling on features.

## Remaining sequence
merge `feat/personnel-unify` → main → **Rooming** (`CC_ROOMING.md`, Stage B) →
**Payroll** (`CC_PAYROLL.md`) → **Channel re-skin** (draft prompt) →
**section-gutter** → **Adam manually smokes every grid** → un-park `<GridExport>`.

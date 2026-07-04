# Data-integrity & persistence pass — stop silent data loss + wrong money numbers

> A full manual walkthrough surfaced ~40 issues. This prompt fixes the **Tier-1** cluster: the ones that silently lose work or produce wrong financial numbers. They are the highest-value fixes in the app right now. Five independent phases, each with its own root-cause diagnosis (already traced to file:line), acceptance, and a single **major smoke checklist** at the end (§V) matching the "big smoke after the work" workflow.
>
> **This is a bug-fix + guard-rail pass, not a redesign.** Don't restructure the grids or the rates model here — the deep rates-SSOT refactor (retiring legacy columns, migration/backfill) is a **separate** follow-up prompt. Here you make edits persist and numbers correct.
>
> **Phase P leads — it is the priority.** The Payroll grid silently dropping typed edits (Phase P) is the confirmed root cause of a production money bug: day-rate crew whose rates never saved to the SSOT, leaving budgets under-counting them. A separate migration is already repairing the *existing* bad data; **Phase P stops the recurrence** and is the tool needed to hand-fix two remaining edge-case crew afterwards. Ship P first (own commit) so it can land even if later phases run long.

---

## 0. Required reading
1. `CLAUDE.md` (esp. save conventions, migration numbering ≥ next free across branches, "verify before claiming — name the files/lines you changed").
2. This whole prompt — the diagnoses below are from a code audit; **confirm each at the file:line before changing it**, don't take my word.
3. Per phase, the files named in that phase.

## 1. Hard rules
1. No new dependencies. No `any`/`@ts-ignore`. All visual values via `var(--lp-…)` tokens.
2. Lint clean (no new warnings above baseline), `tsc --noEmit` zero, build `next build --webpack` only.
3. Any migration: next free number ≥ highest across **main + all active branches** (the repo has had 3 collisions — verify). Idempotent, down-block, RLS via `get_my_workspace_id()`.
4. **Preserve existing behaviour that works.** These are additive fixes; don't regress the good paths (e.g. Rooming's per-cell autosave, the budget P&L).
5. **No silent data paths.** Where you add autosave, surface save state (a subtle pill/toast is fine) so the user knows it saved — don't hide it.
6. Commit one phase per commit, in order **P → R → G → D → S → V** (Phase P first — it's the priority). If a phase turns out bigger than expected, ship the ones that are done and flag the rest — don't half-do all five.

> **REMOVED — phase X (Add-person rate field).** Originally this pass included a sixth phase removing the Add-person "Rate (optional)" field. Discovery (`RATES_SSOT_DISCOVERY_2026-07-03.md`) proved that field's `tour_personnel.rate_amount` write has a **live money reader** — `my-schedule/route.ts:191` computes crew pay as `rate_amount × days`. Removing the field standalone would zero every new crew member's self-service pay. Phase X is therefore **folded into the rates-SSOT cutover (A-W in `CC_RATES_SSOT_AND_RIDER_FEATURES`)**, which re-points `my-schedule` at the SSOT in the same seam. Do NOT touch the Add-person rate field in this pass.

---

## Phase P — Payroll "can't tab" (SpreadsheetGrid)  *(PRIORITY — do first; root cause of lost rates)*
**Why first:** this is the confirmed mechanism behind day-rate crew rates never reaching the SSOT (budgets under-counted them). A data migration repairs the existing damage; **this stops it recurring** and is the tool needed to hand-fix the two residual edge-case crew (a mis-classified split person + one flatten) in the grid afterward. Ship it as commit #1.

**Diagnosis (confirmed):** In `src/components/spreadsheet-grid/SpreadsheetGrid.tsx`, Tab/Shift+Tab are handled **only inside `if (edit.mode === 'edit')`** (~L246-271); there is **no Tab handler in `navigate` mode**. And `nextCellId` (`src/components/spreadsheet-grid/utils/nav.ts:9-22`) walks **all** columns with no read-only skipping. The Payroll Rates grid has trailing **read-only computed** columns (`show_days/off_days/total_fee/total_pd`). So after committing the last editable cell, Tab lands on a computed cell and exits edit mode; the next Tab falls through to the browser and focus leaves the grid. Users think they entered a value but the commit never fired → the "nothing persists" perception in the Rates grid is largely this.

**Fix:**
- Handle **Tab in navigate mode** in `SpreadsheetGrid` (commit-if-editing already works; add navigate-mode Tab that moves selection and `preventDefault`s so focus never leaves the grid).
- Make `nextCellId`/`prevCellId` **skip read-only/computed columns** (there's an `isReadOnly`/`type.kind === 'computed'` signal on columns — use it) so Tab walks only editable cells and wraps to the next row's first editable cell.

**P acceptance:**
- [ ] In the Payroll Rates grid, type a value → Tab → moves to the next **editable** cell (skips totals) every time, wrapping across rows; focus never escapes the grid.
- [ ] Values entered by Tab-then-type actually persist on refresh.
- [ ] A `split_rate` person's Show/Off-Travel/Rehearsal cells each accept and persist distinct values (needed to hand-fix the residual crew).
- [ ] Same grid primitive is used elsewhere (Channel List, Routing?) — confirm no regression there.

---

## Phase R — Routing autosave + navigation guard  *(the #1 data-loss fix)*
**Diagnosis (confirmed):** Routing has **no autosave**. `RoutingEditor.tsx` `updateRow` (~L183-207) only mutates React state; the *only* persist path is the "Save routing" button → `handleSave` (~L266-306) → `POST /api/tours/[id]/routing` which does **delete-all-then-reinsert** (`src/app/api/tours/[id]/routing/route.ts:101-165`). Row delete (`onDeleteRow`, ~L507-511) is a client-only array splice. And the row-menu "Open advance" does a **hard** `window.location.assign(...)` (`RoutingGrid.tsx:330`) with no unsaved-guard. Net: any edit or delete is lost on refresh/navigate unless the user clicks Save first. A single-row `PATCH /api/tours/[id]/routing/[routingId]` **already exists** but the grid never calls it.

**Fix — make routing persist without a manual Save, and never lose edits on navigate.** Discovery-informed, pick the cleaner:
- **Preferred:** debounced **per-row autosave** — on cell edit, debounced `PATCH /api/tours/[id]/routing/[routingId]` (endpoint exists); on row delete, a per-row `DELETE` (verify it exists on that route; **add it** if missing, workspace-gated like its siblings); on add-row, `POST` a single row (or the existing bulk create for a new row). Retire reliance on delete-all-reinsert for normal editing. Keep a manual "Save"/"Saved ✓" indicator.
- **Acceptable fallback if per-row is too invasive:** keep the bulk save but (a) call it debounced on any change (autosave), and (b) add a `beforeunload` + client-route-change guard, and (c) intercept the "Open advance" row action to flush a save before the `window.location.assign`.
- Either way: **fix the "Open advance" hard-nav** (`RoutingGrid.tsx:330`) so it can't discard unsaved edits.
- Watch the realtime echo: `useRealtimeRows` refetches on `routing` changes guarded by `hasUserEditedRef` — make sure autosave writes don't trigger a refetch that clobbers an in-flight edit.

**R acceptance:**
- [ ] Edit a routing cell → refresh → change persisted (no manual Save click).
- [ ] Delete a day → refresh → it stays deleted.
- [ ] Edit routing → open Advance from the row menu → the edit is saved (not lost).
- [ ] No regression to the map/calendar or the venue-autocomplete auto-fill.

---

## Phase G — Budget guarantee carries Projected → Actual
**Diagnosis (confirmed):** `POST /api/budget/income` correctly seeds `actual_guarantee` from `pre_tax_guarantee` once, merge-safely (`src/lib/budget/seedActualGuarantee.ts`). But `POST /api/budget/settlement` (`src/app/api/budget/settlement/route.ts:254,308-324`) **unconditionally upserts** `actual_guarantee: settlement?.reconciled_guarantee ?? settlement?.day_of_guarantee ?? null` into `budget_income` — **not** a read-merge-write. So saving a settlement (even touching an unrelated field) before its guarantee is filled writes `null` and stomps the carried value. Note the same route *already* does the right thing for `actual_vip` (comment "omitted → preserved") — apply that pattern to guarantee (and check overage/merch/deductions for the same class of bug).

**Fix:** In the settlement route, **omit** `actual_guarantee` (and any similarly-derived income key) from the upsert payload when its source is `null`, so the existing value is preserved — mirror the `actual_vip` handling already in that file. Do not write `null` over a populated financial field.

**G acceptance:**
- [ ] Set a projected guarantee → it appears as actual → save a settlement with no guarantee field → the actual guarantee is **still there** (not blanked).
- [ ] Overage/merch/deductions verified against the same overwrite pattern; fix any that share it.
- [ ] P&L / versioning snapshot still reconcile (this write path feeds `computeBudgetPnl`).

---

## Phase D — Per-diems pull through to Budget
**Diagnosis (confirmed):** `src/server/budget/reconcileDerivedLines.ts` pushes salary **unconditionally** (~L225: even £0 rows) but gates per-diem behind `if (pd > 0)` (~L227), and the whole Per-Diem **section** is only created when `payroll.perDiem.length > 0` (~L416). So a tour with salary set but per-diem rates unset shows Salary and **no** Per-Diem section at all → "salary pulls thru but PD doesnt."

**Fix:** Make per-diem symmetric with salary — create the Per-Diem section and per-person lines whenever there are rostered people (or whenever per-diem is *configured*, matching salary's rule), so a £0 per-diem still shows a line rather than vanishing. Confirm the intended rule with how salary behaves and mirror it. Don't double-count against `computeTotals`.

**D acceptance:**
- [ ] A tour with people rostered shows a Per-Diem section in Budget → Expenses, mirroring Salary, even when a person's per-diem is 0.
- [ ] Totals still match Payroll (no double-count).

---

## Phase S — Kill the duplicate "Salary" section
**Diagnosis (confirmed):** `reconcileDerivedLines.ts:47` hardcodes `SECTION_SALARY = 'Salary'` (singular) and `ensureSection()` (~L234-259) find-or-creates by exact case-insensitive name. But the seeded templates name it **"Salaries"** (plural) — `200_budget_sections_templates.sql:246,256,311`. So applying a template creates "Salaries", then the reconcile pass creates a second "Salary" for the derived lines. Same class of mismatch for Per Diem ("Per Diems" vs "Per Diem") in some templates.

**Fix:** Make the two agree. Preferred: `ensureSection` matches against a small **alias list** (`['Salary','Salaries']`, `['Per Diem','Per Diems']`) so it adopts the template's existing section instead of creating a twin. Also add a **one-time migration/backfill** to merge any already-duplicated pair on existing tours (move derived lines into the template section, delete the empty twin) — flag the backfill for Adam to run. Don't just rename the constant and leave existing tours broken.

**S acceptance:**
- [ ] Apply a template to a fresh tour → payroll reconcile attaches derived salary lines to the **existing** "Salaries" section — no second section.
- [ ] Backfill collapses existing duplicate pairs (verify on a tour that currently shows two).

---

## V — Major smoke (run at the end; this is the checklist Adam walks)
Add these as stable IDs in `docs/smoke-tests/` (routing/payroll/budget files, INT-01..):
- [ ] **INT-01 Routing persist:** edit a cell + delete a day → refresh → both stuck. (Phase R)
- [ ] **INT-02 Routing→Advance:** edit routing → Open Advance from the row menu → edit saved. (R)
- [ ] **INT-03 Payroll tab:** type + Tab across a rates row → skips totals, never leaves the grid, values persist on refresh. (P)
- [ ] **INT-04 Guarantee carry:** projected guarantee → actual → save a settlement without a guarantee → actual still populated. (G)
- [ ] **INT-05 Per-diem section:** roster people, no per-diem rate → Per-Diem section still appears in Expenses. (D)
- [ ] **INT-06 One salary section:** apply a template → only one Salary/Salaries section after reconcile; backfill fixed the existing duplicate. (S)
- [ ] `tsc`/lint/build clean; Rooming per-cell autosave + budget P&L unregressed.

## When done
```
Data-integrity pass done. Commits P→R→G→D→S→V.
- P: SpreadsheetGrid Tab works in navigate mode + skips read-only cols (nav.ts). Fixes payroll rates entry (root cause of the day-rate SSOT loss). Split-rate cells accept distinct values.
- R: routing autosaves (per-row PATCH/DELETE) + nav guard on "Open advance"; edits/deletes persist without manual Save. Files: <list>.
- G: settlement route no longer null-stomps actual_guarantee (+overage/merch/deductions); merge-safe like actual_vip.
- D: per-diem section/lines created symmetrically with salary.
- S: ensureSection alias-matches Salary/Salaries + migration NNN backfill merges existing duplicate sections.
- (Add-person rate field NOT touched here — folded into rates-SSOT A-W; see CC_RATES_SSOT_AND_RIDER_FEATURES.)
- Smoke INT-01..06 added.
- Adam: apply migration NNN (salary-section backfill); walk INT-01..06.
- After P ships: reclassify Dillon R.F. Jordan's 200-card to split_rate (Show 200 / Off-Travel 0 / Rehearsal 100) in the Payroll grid, and flatten check any other residual rate edge cases.
```
If any diagnosis doesn't match what you find at the file:line (code may have moved), **stop and report** rather than guessing — per CLAUDE.md. And flag anything where a fix would need to cross into the deferred rates-SSOT refactor.

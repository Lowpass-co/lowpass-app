# Rates SSOT consolidation + blocked rider/budget features (Tier-2 pass)

> Second hour-long pass after `CC_DATA_INTEGRITY_PASS.md`. Two parts in one prompt:
>
> - **Part A — Rates SSOT refactor (risky, data-model + money).** A pay rate can be entered/stored in ~6 places; clicking a person shows conflicting rates. `CC_DATA_INTEGRITY_PASS` phase X already removed the *Add-person* duplicate input; this part collapses the remaining stores to **one canonical per-tour rate SSOT** with a migration + backfill, and retires the legacy/dead ones. **Discovery-gated: CC produces a report and Adam approves it before any destructive migration.**
> - **Part B — Blocked features (additive, low risk).** Three things the walkthrough found half-built: channel-list has no create path, stage-plot/channel-list can't be linked to a rider (schema+read exist, no write/UI), and budget section-collapse is dead code.
>
> **Execution order (so the human gate doesn't stall the hour): A-Discovery (read-only, produces report) → Part B (all three features) → A-Migration/Backfill/Cutover (only after Adam approves the discovery report) → V (combined smoke).** If Adam hasn't approved discovery by the time B is done, stop and hand back — do NOT run the destructive migration unapproved.
>
> **Prereq:** `CC_DATA_INTEGRITY_PASS` must be merged first (phase X removed `tour_personnel.rate_amount` from the Add-person flow; this part assumes that's gone). If it isn't, stop and say so.

---

## 0. Required reading
1. `CLAUDE.md` — migration numbering (next free ≥ highest across main + all active branches; the repo has had 3 real collisions), RLS helpers, "ask when uncertain / verify before claiming".
2. `docs/handover/CC_DATA_INTEGRITY_PASS.md` — what phase X already changed (don't redo it).
3. Part A: the six rate surfaces (grep each, confirm live vs dead before touching):
   - `personnel.standard_rates` JSONB — library default rates (`PersonnelDetailSlideOver`).
   - `personnel_rates` — per-person-per-tour (`PersonnelRatesSection`, `PayrollRatesSpreadsheet`; `PATCH /api/budget/personnel-rates`).
   - `personnel_rate_lines` — per-line rates (`PATCH /api/budget/rate-lines`; migrations ~228/229).
   - `tour_personnel.rate_amount` — **should already be gone from write** (phase X); confirm no readers remain.
   - seed path `src/app/api/tours/[id]/personnel/route.ts:340-354`.
   - dead: `personnel_tour_assignments.rate_overrides`, `TourPersonnelDetailSlideOver.tsx` — confirm zero importers.
4. Part B:
   - `src/app/(app)/operations/[tourId]/channel-list/page.tsx:91-98` — read-only proxy over rider packs, no create path.
   - `POST /api/rider-packs/[id]/sections` — already accepts `section_type:'channel_list'` (the create target).
   - `linked_rider_pack_id` schema + read path `.../stage-plot/server.ts:181-222`; the working personnel-link pattern (`FieldContact`) to mirror for the write/UI.
   - `src/components/budget/BudgetSpreadsheetView.tsx:650-658,1820-1910` (renders section headers, no collapsed state) vs unused `GridSectionHeader.tsx` + `collapseFilter.ts`.
5. `database/migrations/README.md` — numbering + idempotency + down-block.

## 1. Hard rules
1. No new deps. No `any`/`@ts-ignore`. Visual values via `var(--lp-…)` tokens. Lint clean (no new warnings), `tsc --noEmit` zero, build **`next build --webpack`** only.
2. Migrations: next free number verified across branches; mirror in header; **idempotent** (DROP IF EXISTS / ADD COLUMN IF NOT EXISTS / ON CONFLICT); down-block; RLS via `get_my_workspace_id()` / `is_workspace_admin()`.
3. **Part A is money-critical.** Never drop a legacy rate column in the same migration that backfills from it. Sequence: additive migration → backfill → cutover reads/writes → *separate* later migration to drop legacy (leave the drop as a written-but-not-applied migration for Adam, or a documented follow-up — do NOT drop in this pass unless discovery proves the column is already empty everywhere).
4. **Don't guess the canonical store.** Discovery decides which of `personnel_rates` vs `personnel_rate_lines` is the SSOT. If the evidence is ambiguous, STOP and ask Adam — per CLAUDE.md.
5. Additive + reversible for Part B — new write paths / UI only; don't repurpose existing rider-pack section schema.
6. Commits, in the execution order above, one logical change per commit.

---

# PART A — Rates SSOT

## A-D — Discovery (read-only; Adam approves before A-M)
Produce `docs/handover/RATES_SSOT_DISCOVERY_<date>.md` answering:
- **The truth table.** For each of the six surfaces: is it read? written? by which files/endpoints? Is it live or dead (importer count)? Which one does the **Payroll math / budget derived lines actually consume** as the source of truth today? (Trace `reconcileDerivedLines.ts` and `PayrollDaysMatrix`/`usePayrollGrid` back to the column they read.)
- **Proposed SSOT.** Which single per-tour store becomes canonical (`personnel_rates` OR `personnel_rate_lines`), and why. What `personnel.standard_rates` keeps doing (library default that *seeds* the per-tour SSOT, not a competing runtime value).
- **The seam.** Exactly which read/write paths must be re-pointed at the SSOT, and which become dead.
- **Data risk.** Rough row counts: how many tours have rates in the *losing* store that the winning store lacks (the rows the backfill must carry). Provide SQL for Adam to run if you can't query.
- **Drop plan.** Which columns/tables become droppable (`rate_overrides`, the losing store's rate columns, `tour_personnel.rate_amount` if fully dead) — as a *future* migration, listed, not applied here.
- This report is the contract for A-M. **Wait for Adam's approval before writing the migration.**

## A-M — Migration (only after approval)
- Additive: whatever the SSOT needs (e.g. a column, an index, a constraint) to be the single source. No drops.
- If the SSOT is `personnel_rate_lines` and `personnel_rates` is legacy (or vice-versa), add nothing that duplicates — just what's needed to carry the backfilled data.

## A-B — Backfill
- Copy rate data from the losing store into the SSOT for every tour that needs it. Idempotent, re-runnable, **never overwrite a populated SSOT value with a legacy one** (SSOT wins on conflict). Produce a diff/count report for Adam.

## A-W — Cutover reads + writes
- Re-point every live read/write (`PayrollRatesSpreadsheet`, `PersonnelRatesSection`, `reconcileDerivedLines`, the personnel-rates/rate-lines endpoints, the seed path) at the SSOT. After this, clicking a person shows **one** rate, and the Payroll grid + budget derived lines agree.
- Seed rule: adding a person to a tour seeds the SSOT from `personnel.standard_rates`; editing the tour rate writes only the SSOT; the library default is untouched.
- Delete confirmed-dead code: `TourPersonnelDetailSlideOver.tsx`, `personnel_tour_assignments.rate_overrides` readers (if any).
- Write the **drop migration** for the legacy columns as a numbered file but leave it for Adam to apply after he's satisfied (per rule 3).

## A acceptance
- [ ] One person → one tour rate, shown identically in the person slide-over and the Payroll Rates grid.
- [ ] Editing the rate in Payroll flows to budget derived salary/PD lines (same number, no second value anywhere).
- [ ] Library `standard_rates` still seeds a new tour assignment and is otherwise independent.
- [ ] Backfill carried every legacy-only rate; report shows zero rows lost.
- [ ] No live reader of the retired store remains (grep proves it); drop migration written but unapplied.

---

# PART B — Blocked features (additive)

## B1 — Channel-list create path
**Diagnosis:** the tour channel-list tab (`operations/[tourId]/channel-list/page.tsx:91-98`) only *proxies* rider-pack channel-list sections read-only — there's no way to create one from the tour. But `POST /api/rider-packs/[id]/sections` already accepts `section_type:'channel_list'`.
**Fix:** add a create action on the tour channel-list tab (empty-state "Create channel list" + add-row/section), POSTing to that endpoint against the tour's rider pack. Reuse `SpreadsheetGrid` for editing (don't roll a `<table>`). Handle the no-rider-pack-yet case (create/attach one, or prompt).
**B1 acceptance:** from a tour with no channel list, create one, add channels, refresh → persists and shows in the rider pack too.

## B2 — Link stage-plot / channel-list to a rider
**Diagnosis:** `linked_rider_pack_id` + a read path exist (`stage-plot/server.ts:181-222`) but there is **no write/UI** to set the link for stage-plots or channel lists. Personnel linking already works via `FieldContact` — mirror it.
**Fix:** add the write path (PATCH setting `linked_rider_pack_id`) + a link/unlink control on the stage-plot and channel-list surfaces, following the `FieldContact` pattern. Respect workspace RLS.
**B2 acceptance:** link a stage-plot to a rider pack → it appears in the pack; unlink → removed; second workspace can't link across tenants.

## B3 — Budget section collapse
**Diagnosis:** `GridSectionHeader.tsx` + `collapseFilter.ts` exist but are **unused**; `BudgetSpreadsheetView.tsx:650-658,1820-1910` renders headers with no collapsed state, so sections can't collapse.
**Fix:** wire collapse into `BudgetSpreadsheetView` — collapsed-state (persist per-user, e.g. localStorage or a prefs row — match how other view prefs persist here; check first), header toggle, filter rows via the existing `collapseFilter.ts`. If that dead code doesn't fit the current grid model, say so and implement minimally rather than forcing it. Don't break totals or the versioning snapshot.
**B3 acceptance:** collapse a budget section → its rows hide, its subtotal still shows, state survives reload; totals unchanged.

---

## V — Combined smoke (run at end; add stable IDs under `docs/smoke-tests/`)
- [ ] **RATE-01** person shows one tour rate across slide-over + Payroll grid. (A)
- [ ] **RATE-02** edit rate in Payroll → budget salary/PD lines update to the same figure. (A)
- [ ] **RATE-03** new person seeds from library `standard_rates`; editing tour rate leaves the library default alone. (A)
- [ ] **RATE-04** backfill report: zero legacy-only rates lost. (A)
- [ ] **CHAN-01** create a channel list on a tour with none → persists + shows in rider pack. (B1)
- [ ] **RIDER-01** link + unlink a stage-plot and a channel-list to a rider pack; cross-workspace isolation holds. (B2)
- [ ] **BUD-COLLAPSE-01** collapse/expand a budget section; subtotal intact, state persists, totals unchanged. (B3)
- [ ] `tsc`/lint/`next build --webpack` clean; no regression to Payroll days matrix, budget P&L, or rider-pack reads.

## When done
```
Rates SSOT + rider/budget features done.
PART A (gated on discovery approval):
- Canonical per-tour rate SSOT = <store> (discovery report at docs/handover/RATES_SSOT_DISCOVERY_<date>.md).
- Migration NNN (additive) + backfill (report: <n> rows carried, 0 lost).
- Reads/writes cut over: <files>. Dead code deleted: TourPersonnelDetailSlideOver, rate_overrides readers.
- Drop migration MMM WRITTEN BUT NOT APPLIED (legacy columns) — Adam applies after sign-off.
PART B:
- B1 channel-list create wired to POST /api/rider-packs/[id]/sections.
- B2 linked_rider_pack_id write+UI for stage-plot & channel-list (FieldContact pattern).
- B3 budget section collapse wired (GridSectionHeader + collapseFilter), state persisted per-user.
- Smoke RATE-01..04, CHAN-01, RIDER-01, BUD-COLLAPSE-01 added.
Adam: approve discovery before A-M ran? [yes/no]; apply migration NNN; run backfill; review drop migration MMM.
```
If discovery can't cleanly pick a single SSOT (both stores carry rates no other holds), STOP and surface it — a wrong pick silently corrupts pay. If B3's dead code doesn't match the current grid, implement minimally and note it. Verify before claiming: name the exact files/lines you changed.

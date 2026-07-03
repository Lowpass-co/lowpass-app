# Rates SSOT — Discovery report (2026-07-03)

**Status: READ-ONLY discovery. No code changed. This report is the contract for A-M
(migration/backfill/cutover). Do not run A-M until Adam approves this.**

> Produced by the "Rates SSOT consolidation" pass (`CC_RATES_SSOT_AND_RIDER_FEATURES`).
> Part B (rider/budget features) was executed in the same pass; Part A stops here.

---

## 🚩 BLOCKER 0 — the stated prereq is NOT met

The prompt's prereq: *"CC_DATA_INTEGRITY_PASS must be merged first (phase X removed
`tour_personnel.rate_amount` from the Add-person flow). If it isn't, stop and say so."*

**It is not merged.** Evidence:
- `docs/handover/CC_DATA_INTEGRITY_PASS.md` exists as a spec, but its work is on **no branch**
  (`git log --all` shows no R/P/G/D/S/X phase commits; no `INT-0x` smoke IDs exist).
- The Add-person duplicate rate field is still live:
  - [`AddPersonnelSlideOver.tsx:97`](../../src/components/operations/personnel/AddPersonnelSlideOver.tsx) `rateAmount` state, `:927` "Rate (optional)" field, `:262` writes `rate_amount: parsedRate`.
  - [`api/tours/[id]/personnel/route.ts:350`](../../src/app/api/tours/[id]/personnel/route.ts) still seeds `personnel_rates.show_rate` from the typed `body.rate_amount` (NOT from `standard_rates`).

**Consequence for Part A:** phase X was supposed to reduce the write surfaces to one home
before this refactor. It didn't run, so the cutover (A-W) must *also* do phase X's job
(re-point the Add-person seed) — it's folded into the seam below, but Adam should know the
scope is larger than the prompt assumed.

## 🚩 BLOCKER 1 — a fourth money surface the prompt underweighted

The prompt lists `tour_personnel.rate_amount` as *"should already be gone from write (phase X);
confirm no readers remain."* **Readers very much remain, and one computes pay:**
- [`api/tours/[id]/personnel/my-schedule/route.ts:191-192`](../../src/app/api/tours/[id]/personnel/my-schedule/route.ts) — `pay = rate_amount * days` (the crew self-service "my schedule" pay figure).
- [`CrewMyScheduleClient.tsx:305`](../../src/components/operations/personnel/CrewMyScheduleClient.tsx) — renders that pay.
- [`PersonSlideOver.tsx:70,98`](../../src/components/entity/person/PersonSlideOver.tsx) — reads/writes `rate_amount`.
- Plus CRUD in `[memberId]/route.ts:101`, `tour-personnel/[id]/route.ts:52`, `persons/[id]/route.ts:17`.

So `rate_amount` is a **parallel per-tour rate with its own live money reader** that today can
show a *different* number than the Payroll grid. Collapsing it into the SSOT is real money work
(re-point `my-schedule`), not a dead-column drop. This is the strongest reason to treat A-M as
gated — a careless drop of `rate_amount` would silently zero every crew member's "my schedule" pay.

---

## 1. The truth table (six surfaces)

| # | Surface | Read? | Written? | By | Live/Dead | Role |
|---|---------|-------|----------|-----|-----------|------|
| 1 | `personnel.standard_rates` (JSONB) | ✅ | ✅ | `api/personnel[/id]`, `PersonnelDetailSlideOver`, `personnel-rates` POST seed (`:206`) | **LIVE** | **Library default** (workspace-level, per-person). Not a per-tour runtime value. |
| 2 | `personnel_rates.{show,off,rehearsal_rate,per_diem,advance_fee}` | ✅ (fallback) | ✅ | add-person seed (`:350`), `personnel-rates` PATCH, `swap`, `PersonnelRatesSection` | **LIVE — frozen for money reads (b2)** | Per-tour rate **card** (identity + legacy columns). Now the **seed/fallback** source for surface 3, not the authoritative money read. |
| 3 | `personnel_rate_lines` (per type × person × tour) | ✅ **(authoritative)** | ✅ | `rate-lines` PATCH, `rate-types` seed, mig 228/229 backfill; read via `loadRateLines.rateLinesFor` → `fees.computeTotals` | **LIVE — the b2 SSOT** | The money source for Payroll grid, budget derived lines, PDF, artist-summary. |
| 4 | `tour_personnel.rate_amount` | ✅ **(computes pay)** | ✅ | add-person (`:280`), `[memberId]` PATCH, `PersonSlideOver`; **read for pay by `my-schedule:191`** | **LIVE (NOT dead)** | Parallel single-day-rate for crew self-service. Divergent from surface 3. |
| 5 | `personnel_tour_assignments.rate_overrides` | ❌ | ❌ | type-only (`types/index.ts:315`) | **DEAD** | Zero runtime readers/writers. Droppable. |
| 6 | `TourPersonnelDetailSlideOver.tsx` | — | — | **zero importers** (only self-match) | **DEAD** | Deletable component. |

### Who is the source of truth for money *today*?
- **Payroll grid + budget derived Salary/Per-Diem + payroll PDF + artist-summary** →
  `personnel_rate_lines` via `rateLinesFor(ctx, personnelRateId, legacy, advance)`
  ([`loadRateLines.ts:69`](../../src/lib/payroll/loadRateLines.ts)). **Important nuance:** `rateLinesFor`
  **falls back to `ratesToLines(personnel_rates.*)`** when a person has *no* line rows. Migration 228
  backfilled existing rows, but **newly-added people have no lines** until a type is added or a cell is
  edited — so for them the effective source is still surface 2 (`personnel_rates` columns). This is why
  surface 2 cannot be dropped yet.
- **Crew "my schedule" pay** → `tour_personnel.rate_amount` directly (surface 4). **Divergent path.**
- Trace refs: [`reconcileDerivedLines.ts:205-219`](../../src/server/budget/reconcileDerivedLines.ts) (rateLinesFor→computeTotals), [`PayrollDaysMatrix.tsx` totalCalc](../../src/components/payroll/PayrollDaysMatrix.tsx) (personTotals over amountMap), [`usePayrollGrid.ts`](../../src/components/payroll/usePayrollGrid.ts) (day-status only, no rate read).

---

## 2. Proposed SSOT

**Canonical per-tour runtime rate store = `personnel_rate_lines` (surface 3).**

Why, not `personnel_rates` columns:
- It is already the authoritative money read for every Payroll/budget/export path (b2 work,
  reconciliation-gated by `reconcile.harness.ts` — 52 checks proving it reproduces legacy exactly).
- It is extensible (custom rate types); the legacy columns are a fixed quartet.
- `personnel_rates` stays as the **rate card row** (identity: `person_name`, `role`, `person_type`,
  `rate_type`, `tour_personnel_id`, `roster_personnel_id`) — we are **not** deleting the table, only
  eventually its **rate-amount columns** once seeding writes lines directly.

Roles after the refactor:
- `personnel.standard_rates` → **library default** that seeds new per-tour lines. Untouched at runtime;
  never a competing live value.
- `personnel_rates.*` rate columns → **frozen seed/fallback**, dropped in a *later* migration once
  A-W makes new-person add seed `personnel_rate_lines` directly.
- `tour_personnel.rate_amount` → **retire after re-pointing `my-schedule`** at the SSOT; drop later.
- `rate_overrides`, `TourPersonnelDetailSlideOver` → **delete now** (dead).

> ⚠️ This is a *clean* pick for the Payroll/budget path, but it is **not** a simple two-way choice as the
> prompt framed ("`personnel_rates` vs `personnel_rate_lines`"). The real graph is
> `standard_rates` → (seed) → `personnel_rates` cols → (backfill/fallback) → `personnel_rate_lines`,
> **plus** a disconnected `rate_amount` money reader. Recommend A-M/A-W proceed **only after** (a) phase X
> lands or is folded in, and (b) the `rate_amount`/`my-schedule` re-point is explicitly in scope.

---

## 3. The seam — exact paths to re-point (A-W), and what dies

**Seed (new person on tour) → must write `personnel_rate_lines` from `standard_rates`:**
- [`api/tours/[id]/personnel/route.ts:343-354`](../../src/app/api/tours/[id]/personnel/route.ts) — after inserting the `personnel_rates` card, seed the 6 default lines (a1–a6) from `standard_rates` (show_day_rate→a1/a6, off_day_rate→a2, travel_day_rate→a3, per_diem_rate→a4). Stop seeding `show_rate` from `rate_amount`.
- [`api/budget/personnel-rates/route.ts:206-213`](../../src/app/api/budget/personnel-rates/route.ts) — already seeds `personnel_rates` cols from `standard_rates`; extend to also seed lines (or rely on the fallback until edited).

**Writes (editing a tour rate) → already SSOT-correct:** `PayrollRatesSpreadsheet` cells → `PATCH /api/budget/rate-lines`. ✅ No change.

**Reads → already SSOT-correct:** Payroll grid/Summary/DaysMatrix, `reconcileDerivedLines`, `payroll-data`, `artist-summary`. ✅ (b2). 

**Reads to re-point (the remaining divergence):**
- `my-schedule/route.ts:191` — compute crew pay from the SSOT (`computeTotals` over the person's lines × their day counts) instead of `rate_amount * days`. **Money-critical — reconcile before/after.**
- `PersonSlideOver.tsx:70,98` — surface the SSOT rate read-only (or route its edit to `rate-lines`), stop writing a competing `rate_amount`.

**Dead code to delete now (A-W):**
- `src/components/personnel/TourPersonnelDetailSlideOver.tsx` (0 importers).
- `rate_overrides` on `PersonnelRates` type (`types/index.ts:315`) — type-only, remove with the drop migration.

---

## 4. Data risk (rows the backfill must carry)

The b2 backfill (mig 228/229) already copied `personnel_rates.*` → `personnel_rate_lines` for all rows
that existed then. Remaining risk lives in the **divergent** stores. SQL for Adam to run (read-only):

```sql
-- (a) tour_personnel rows whose rate_amount disagrees with the person's line-derived show rate.
--     These are the crew whose "my schedule" pay would change under the SSOT.
select tp.tour_id, count(*) as divergent_rows
from tour_personnel tp
join personnel_rates pr on pr.tour_personnel_id = tp.id
left join personnel_rate_lines l
  on l.personnel_rate_id = pr.id
 and l.rate_type_id = '00000000-0000-0000-0000-0000000000a1'  -- Show
where tp.rate_amount is not null
  and coalesce(l.amount, pr.show_rate, 0) <> tp.rate_amount
group by tp.tour_id
order by divergent_rows desc;

-- (b) personnel_rates cards with NO lines yet (rely on the fallback; A-W seed must cover them).
select pr.tour_id, count(*) as cards_without_lines
from personnel_rates pr
where not exists (select 1 from personnel_rate_lines l where l.personnel_rate_id = pr.id)
group by pr.tour_id
order by cards_without_lines desc;

-- (c) any non-zero rate_overrides actually populated (expected: 0 — it's type-only in code).
--     personnel_tour_assignments has no rate_overrides column in code; confirm in DB:
select column_name from information_schema.columns
where table_name = 'personnel_tour_assignments' and column_name = 'rate_overrides';
```

Report (b) is the backfill A-B must carry (seed lines for card-only people); (a) is the crew-pay set to
reconcile before re-pointing `my-schedule`; (c) confirms surface 5 is safe to drop.

---

## 5. Drop plan (future migration `MMM` — WRITTEN-BUT-NOT-APPLIED, never in this pass)

After A-W is live and verified in production:
1. `ALTER TABLE personnel_rates DROP COLUMN show_rate, off_rate, rehearsal_rate, per_diem, advance_fee;`
   (only once new-person seed + all readers use lines — verify count (b) = 0).
2. `ALTER TABLE tour_personnel DROP COLUMN rate_amount;` (only once `my-schedule` + `PersonSlideOver` re-pointed — verify count (a) reconciled).
3. Remove `rate_overrides` from the `PersonnelRates` TS type (no DB column to drop if (c) empty).
4. Delete `TourPersonnelDetailSlideOver.tsx`.

**Never drop a column in the same migration that backfills from it (Hard rule 3).** Each drop is its own
migration, applied by Adam after sign-off.

---

## 6. Recommendation

- **Approve to proceed** only if you accept the enlarged scope: A-W must (i) do phase X's seed re-point,
  and (ii) re-point the `rate_amount`/`my-schedule` crew-pay reader. Both are money paths.
- **Or** split: land phase X (from `CC_DATA_INTEGRITY_PASS`) first as its own pass, then run A-M/A-W here.
- Migration numbering: next free is **230** (highest on main = 229; verify across active branches before writing).

Awaiting Adam's decision. Part B shipped independently in this pass (see the pass's closing note).

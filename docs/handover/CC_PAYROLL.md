# CC — Payroll: restructure onto the canonical grid + shared rail + fix OPS-17 fee math

Payroll **already exists** (Payroll Sprint, migration 106). Do NOT rebuild it.
The three designed views map to existing components:
- **Rates & totals** ← `PayrollRatesSpreadsheet.tsx`
- **Days matrix** (week tab) ← `PayrollWeekSheet.tsx`
- **Summary** ← `PayrollSummary.tsx`  · container `PayrollView.tsx` · fee calc
  `src/lib/payroll/fees.ts`

Data (no new tables — confirmed in 106): `payroll_entries` (017) =
`(personnel_id, week_start)` + **`day_statuses` JSONB** (per-day type) +
**`advance_fee`**. Rates on `personnel_rates` (show_rate · travel_rate ·
per_diem · **`internal_rate`** — admin-gated, sensitive). Festival override
`routing.acl_per_diem_amount`. Payroll feeds the budget Salary section via
reconcile (`source_entity_type='payroll'`, persisting post-208).

The build = **(a) restructure to the canonical grid + the shared `<RoutingRail>`**
and **(b) fix the OPS-17 fee math**. Design + verified formulas in
`docs/handover/GRID_SURFACES_DESIGN.md` (Payroll section).

## ⛔ Gated: Stage A (map, no code) → review → Stage B

### Stage A — map (NO code) → `docs/handover/PAYROLL_MAP.md`
1. The data path: `payroll_entries.day_statuses` shape (what day-type values),
   `advance_fee`, how `personnel_rates` (show/travel/per_diem/internal) join per
   person, the `acl_per_diem_amount` festival rule.
2. **Where the current fee math lives** (`fees.ts` + callers) and **exactly how
   OPS-17 is wrong** today (it "counts ALL days × show rate, ignores the
   show-vs-travel split") — quote the function.
3. The existing components (`PayrollView/WeekSheet/RatesSpreadsheet/Summary`)
   and how the week axis renders today (CC's rail map: **horizontal week tabs**,
   not a left rail).
4. How payroll reconciles into budget Salary (the per-person line).
5. `internal_rate` admin-gating (server + UI) — must be preserved.
6. Decisions for Adam. Then stop.

### Stage B — build (after the map is approved)
1. **Fee math fix (OPS-17)** in `fees.ts`, to the VERIFIED formula:
   `total_fee = show_rate×show_days + travel_rate×off_travel_days + advance`
   (travel rate is **per-person**, independent — never half-by-band-rule);
   `total_per_diem = pd_rate × (show + travel days)`; **NO TOUR days pay nothing,
   earn no per diem**; apply `acl_per_diem_amount` on festival dates. Verify
   against the sheet numbers (Richie $4,611 · Duncan $1,607 · Jake $2,250 · Adam
   PD $167).
2. **Days matrix on the shared `<RoutingRail>`** — flip `PayrollWeekSheet` from
   horizontal week tabs to the left rail (`grouping='week'`), people across the
   top, cells = day type (Show/Off-Travel/No-Tour). Days always on the left.
3. **Rates & totals** = `PayrollRatesSpreadsheet` re-skinned to the canonical grid
   — every column separate + explicit (show · travel · per-diem · show days ·
   off/travel days · total fee · total per diem · advance · notes). Default
   landing view.
4. **Person rate-card** slide (show/travel/per-diem/advance editable).
5. Canonical grid styling incl. the **section gutter**; keep `PayrollSummary`,
   the budget Salary feed, the branded-PDF path (§P5/P6), and the `internal_rate`
   gating intact.

## Hard rules
- Map both sides; quote the fee function; don't guess. Surface decisions.
- Reuse `<RoutingRail>`; tokens; `next build --webpack`; tsc 0; eslint 0; don't
  regress payroll PDFs, internal_rate gating, or the budget feed.
- **Verify before claiming** — name files/lines; mark build vs needs-live. I
  Chrome-verify the fee math (against the sheet), the rail flip, and the budget
  Salary feed on the preview.
- Land smoke IDs in `docs/smoke-tests/operations.md` (payroll) — close the
  OPS-17 fee-math half.

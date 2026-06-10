# PAYROLL_MAP — Stage A (map only, no code)

> Restructure Payroll onto the canonical grid + the shared `<RoutingRail>`, and
> "fix the OPS-17 fee math." **Headline finding: the OPS-17 base fee split is
> ALREADY fixed and already matches the verified sheet numbers.** The only
> un-done fee-math piece is the `acl_per_diem` festival override (schema-ready,
> never wired) — and it needs a per-date per-diem path the current count-based
> helper can't express. Decisions in §6, then stop.
>
> **Status:** Stage A. Awaiting review + D1–D7 before Stage B.

---

## 0. TL;DR

- **OPS-17a (fee split) = DONE.** `src/lib/payroll/fees.ts` `computeTotalFee` =
  `show×show_rate + offTravel×off_rate + rehearsal×rehearsal_rate + advance`.
  No show-rate fallback for travel days. The "counts ALL days × show rate" bug
  the prompt describes is the OLD behaviour — it's gone.
- **OPS-17b (budget recompute) = DONE.** `reconcileDerivedLines` recomputes
  Salary/Per-Diem from `day_statuses` + the rate card via the SAME helper.
- **Verified numbers reconcile with current code** (Richie $4,611 · Duncan
  $1,607 · Jake $2,250 · Adam PD $167) — see §2. So the live fix is a
  re-verify, not a re-write.
- **The real remaining fee work = `acl_per_diem` festival override** (Stage B
  bullet "apply acl_per_diem_amount on festival dates"). `computeTotalPerDiem`
  takes day COUNTS, so it structurally cannot apply a per-DATE override. This
  needs a per-date per-diem path → **D2**.
- Restructure (rail flip + rates re-skin + rate-card slide) is a UI change over
  an unchanged data layer + reconcile + internal_rate gating + (PDF path — D6).

---

## 1. Data path

### Tables
- **`payroll_entries`** (017): `id, tour_id, workspace_id, personnel_id→
  personnel_rates, week_start DATE, day_statuses JSONB DEFAULT '{}', advance_fee
  NUMERIC, total_fee NUMERIC, total_per_diem NUMERIC, notes, UNIQUE(personnel_id,
  week_start)`. Migration 050 adds `person_id→persons`. **Grain: one row per
  person per week.**
- **`day_statuses`** JSONB = `{ 'YYYY-MM-DD': status }`. Status VALUES:
  `'show' | 'off_travel' | 'rehearsal' | 'no_tour'`. `countDayStatuses` tallies
  show / off_travel / rehearsal; **`no_tour` (and anything unknown) is ignored**
  (pays nothing, earns no per diem). `routing.day_type → status` map: show/
  festival→show, rehearsal→(rehearsal | off_travel — see note), off/travel/press/
  radio/tv→off_travel, else no_tour.
- **`personnel_rates`** (017 + 106): `show_rate, off_rate, rehearsal_rate,
  per_diem, advance_fee, commission, internal_rate (106, SENSITIVE/admin-only),
  person_type, rate_type, role, order_index, tour_personnel_id, roster_personnel_id`.
- **`routing.acl_per_diem_amount`** (106, NUMERIC, nullable): festival per-diem
  override — "non-null = flat per-diem amount overriding both rate + base
  per_diem for every assigned person on this date." **Grep = zero usage today.**
- **Migration 106** (Payroll Sprint §P1): adds `internal_rate`,
  `artists.brand_color` (#FF4500), `routing.acl_per_diem_amount`, + a
  `payroll-pdfs` storage bucket (workspace-scoped RLS). No new payroll tables.

### advance_fee
Stored on `payroll_entries.advance_fee` (per week); falls back to
`personnel_rates.advance_fee`. Added ONCE into total_fee (never multiplied).

---

## 2. The fee math — already correct (QUOTED)

`src/lib/payroll/fees.ts` (the single source of truth; pure, imported by
displays + POST + reconcile):

```ts
export function countDayStatuses(statuses) {        // → { show, offTravel, rehearsal, active }
  for (const v of Object.values(statuses ?? {})) {
    if (v === 'show') show++;
    else if (v === 'off_travel') offTravel++;
    else if (v === 'rehearsal') rehearsal++;
  }
  return { show, offTravel, rehearsal, active: show + offTravel + rehearsal };
}
export function computeTotalFee(rate, counts, advanceFee = 0) {
  return counts.show * num(rate.show_rate)
       + counts.offTravel * num(rate.off_rate)
       + counts.rehearsal * num(rate.rehearsal_rate)
       + num(advanceFee);
}
export function computeTotalPerDiem(rate, counts) { return counts.active * num(rate.per_diem); }
```

**Verified against the sheet** (`GRID_SURFACES_DESIGN.md` L70–74):
- Richie `635.95×2 + 635.95×4 + 794.93 = $4,611` ✓ (show_rate=off_rate here)
- Duncan `401.65×2 + 200.83×4 = $1,607` ✓ (off_rate is Duncan's real travel rate
  — NOT a "half-by-band" rule; it's just his number)
- Jake `450×2 + 450×3 = $2,250` ✓
- Adam PD `33.47 × 5 = $167` ✓ (5 = show + off_travel)

**Call sites all use the helper** (so they can't disagree):
`PayrollSummary.tsx` L7/31-85, `PayrollWeekSheet.tsx` L7/213-223,
`api/budget/payroll/route.ts` L12/23-39 (persists total_fee/total_per_diem),
`reconcileDerivedLines.ts` L29/152-208 (budget Salary/Per-Diem).

### Two real gaps (NOT the "all days × show rate" bug)
1. **`acl_per_diem` not applied.** Per-diem is `active × per_diem` — flat. A
   festival date with `routing.acl_per_diem_amount` set must pay that flat
   amount **for that date** instead of `per_diem`. The helper only sees COUNTS,
   so it can't. Fixing it needs a per-date per-diem path (which dates are
   festival-with-override). → **D2.**
2. **Per-diem includes rehearsal days** (`active = show+offTravel+rehearsal`),
   while the design-doc formula reads `pd × (show + off_travel)`. The verified
   case has no rehearsal, so both agree there. → **D3** (probably keep
   rehearsal — it's a worked day).

---

## 3. Components + week axis (today)

| File | Role | Notes |
|---|---|---|
| `PayrollView.tsx` | container; tabs = **Summary** + one per **week** | native button tabs, no rail; week math from `payroll-utils` (`getWeekStart`/`weekDates`/`formatWeekTabLabel` "WC 18 May") |
| `PayrollWeekSheet.tsx` | **week matrix** | **HORIZONTAL 7-day columns Mon–Sun** (NOT a left rail). `DAY_OPTIONS = show / off_travel / no_tour`; cell = `<InlineEditCell select>`; colours hardcoded Tailwind (emerald/amber/grey — token violation); `saveDayStatus` → POST `/api/budget/payroll` |
| `PayrollRatesSpreadsheet.tsx` | rate cards on **`<SpreadsheetGrid>`** | cols: person · role · employment · rate_type · **show · off · reh. · PD** · (commission — gated by `canSeeCommission`) · notes. Grouped by person_type w/ section headers. **internal_rate NOT shown here.** PATCH `/api/budget/personnel-rates` |
| `PayrollSummary.tsx` | tour-wide totals | role · names · show/travel/PD rates · show-days · off/travel-days · total fee · total PD + footer totals (via the shared helper) |
| page `operations/[tourId]/payroll/page.tsx` | fetch + mount | fetches routing + `tour_personnel` + `payroll_entries(*, personnel_rates(...))`; **auto-seeds missing rate cards** for roster members; mounts `<PayrollView>` |

Props PayrollView: `{ tourId, tourName, currency, routingDates[], personnelRates[], payrollEntries[] }`.

---

## 4. Budget Salary reconcile (must stay unchanged)

`reconcileDerivedLines.ts` `computePayrollDesired` (L152–208):
- reads `personnel_rates` **roster-linked only** (`.not('tour_personnel_id','is',
  null)`) + `payroll_entries(personnel_id, day_statuses, advance_fee)`;
- recomputes per person via `countDayStatuses` + `computeTotalFee`/`PerDiem`
  (NOT the persisted column — guarantees budget == display);
- emits one **Salary** line per roster member (`source_entity_type='payroll'`,
  `source_entity_id = personnel_rates.id`) + a **Per-Diem** line when > 0
  (`'payroll_per_diem'`). Section ensured = SALARY.
- **Never reads `internal_rate`.** Fees are always public rates.

**Invariant:** if I wire `acl_per_diem` (D2), it must flow through the SAME
helper so reconcile + displays + POST all stay equal — else the budget Salary/
Per-Diem diverges from the sheet.

---

## 5. internal_rate gating (must preserve)

- **Server** `api/tours/[id]/personnel/[memberId]/rates/route.ts`: GET returns
  `internal_rate: isAdmin ? rates.internal_rate : null` (L116); PUT only writes
  it `if (r.isAdmin && …)` (L161); non-admin writes dropped silently. Same gate
  in `api/persons/[id]/rates-history/route.ts` (L76). Admin = role admin|manager.
- **UI** `PersonnelRatesSection.tsx`: the "Internal rate" field renders only when
  `isAdmin` (L255-269); history-copy commits it only when admin (L157-161).
- The **rate-card slide** in Stage B must reuse this exact gating (server is the
  real gate; UI just hides). The rates **spreadsheet** does not surface
  internal_rate today — keep it out of any all-staff grid unless admin.

---

## 6. Decisions for Adam (D1–D7) — before Stage B

- **D1 — OPS-17 base math: re-verify, don't re-write.** The split is already
  correct + matches the sheet. Confirm Stage B's fee work is limited to (a)
  `acl_per_diem` (D2) and (b) the rehearsal-PD question (D3), and that "closing
  the OPS-17 fee-math half" = land the smoke test proving the sheet numbers
  (no change to `computeTotalFee`). *(Recommend yes.)*
- **D2 — `acl_per_diem` festival override: wire it now, or defer?** It needs a
  **per-date per-diem path**: for each engaged date, pay `per_diem` normally but
  the festival flat `routing.acl_per_diem_amount` when set. That means adding a
  date-aware per-diem fn (e.g. `computePerDiemByDate(rate, dayStatusesByDate,
  aclByDate)`) used by displays + POST + reconcile — a real change across all
  four sites. Wire now, or ship the restructure first and do `acl_per_diem` as
  its own follow-up? *(Recommend: defer to a focused follow-up — it touches the
  fee contract + reconcile and deserves its own verify pass; the restructure
  doesn't depend on it.)*
- **D3 — per-diem on rehearsal days.** Keep `active = show+offTravel+rehearsal`
  (rehearsal earns PD — it's a worked day), or match the design-doc's `(show +
  off_travel)` and exclude rehearsal? *(Recommend keep — verified case agrees;
  excluding would be a regression for tours with rehearsal PD.)*
- **D4 — "Rates & totals" grid component.** CLAUDE.md says spreadsheets →
  `<SpreadsheetGrid>` (Payroll included), which `PayrollRatesSpreadsheet`
  already uses. Does "re-skin to the canonical grid" mean keep `<SpreadsheetGrid>`
  (re-styled + add the explicit show-days / off-travel-days / total-fee / total-PD
  / advance columns), or port to the budget `<Grid>`? *(Recommend keep
  `<SpreadsheetGrid>` — it's the canonical spreadsheet primitive + already has
  the rate editing, section gutter, admin gate.)*
- **D5 — Days matrix rail flip.** Reuse the Rooming pattern: shared
  `RailNightCell` as the sticky left column + people across + day-type cells
  (show / off_travel / no_tour), grouped by week (week-divider rows, since
  payroll is week-grained). Confirm — and confirm the day axis is **all routing
  dates** (payroll already tabs every week incl. no-tour days) vs nights-away?
  *(Recommend: all routing dates, grouped by week; reuse RailNightCell.)*
- **D6 — Branded-PDF path (§P5/P6).** Migration 106 created the `payroll-pdfs`
  bucket + `artists.brand_color`, but recon found **no PDF export in the payroll
  components**. Is the branded-PDF path built elsewhere (a route/server action)
  I must avoid regressing, or **not built yet** (nothing to preserve)? Please
  point me at it if it exists. *(I'll confirm before claiming it's intact.)*
- **D7 — The 3 views.** Rates & totals (default) · Days matrix (week rail) ·
  Summary (kept). Confirm that set + that PayrollSummary stays as-is.

---

## 7. Hard-rule compliance (Stage A)

- ✅ Both sides mapped; **fee function quoted in full**; the OPS-17 status
  (already-fixed) is evidenced, not guessed; reconcile + gating dependencies
  cited.
- ✅ Identified the real remaining fee gap (`acl_per_diem`) + why the
  count-based helper can't express it.
- ⛔ **No code written.** Stopping for D1–D7 review.

### Stage B smoke IDs (to land with the build — placeholders)
`docs/smoke-tests/operations.md` payroll block:
- **PAY-OPS17** fee math matches the sheet (Richie $4,611 · Duncan $1,607 · Jake
  $2,250 · Adam PD $167) — closes the OPS-17 fee-math half.
- **PAY-01** Days matrix on the shared rail (days left, people across, week
  groups); day-type cells persist (OPS-04-style), survive reload.
- **PAY-02** Rates & totals grid — every column explicit (show · travel · PD ·
  show-days · off/travel-days · total fee · total PD · advance · notes); default view.
- **PAY-03** Person rate-card slide (show/travel/per-diem/advance editable).
- **PAY-04** internal_rate stays admin-only (server + slide) — non-admin can't see/write.
- **PAY-05** budget Salary feed unchanged (per-person lines reconcile == display).
- **PAY-06** branded-PDF path intact (D6).
- **PAY-07** (if D2 = now) `acl_per_diem` festival flat overrides per-diem on festival dates.

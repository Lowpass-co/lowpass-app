# Operations smoke tests

> **Last bulk verification**: 2026-06-07 re-smoke (Adam, preview, AFTER the
> foundation fix). **Keystone RESOLVED** — Payroll, Rooming, and Personnel
> now show the same 5 roster members; remove is no longer destructive; swap
> is clickable.
>
> **Still failing (functional):**
> - OPS-16 — after a swap the displayed name stays the OLD person's name.
> - OPS-17 — **SALARY-population half FIXED & verified** (2026-06-08, live via
>   Chrome on "Simple Plan Support | Fall'26"): after migration **208** widened
>   the `budget_line_items.source_entity_type` CHECK to allow `payroll`/
>   `payroll_per_diem`, the Salary section now materialises all 5 roster members
>   `FROM PAYROLL`. Root cause was the CHECK rejecting payroll inserts +
>   reconcile swallowing the error. **Fee-math half now CLOSED** (Payroll Stage
>   B): `src/lib/payroll/fees.ts` already split by day type
>   (`show×show_rate + offTravel×off_rate + rehearsal×rehearsal_rate + advance`,
>   no show-rate fallback) — the "all days × show rate" bug was already gone.
>   Proven by **PAY-OPS17** below against the real sheet. (Festival
>   `acl_per_diem` override is a separate, deferred follow-up — CC_PAYROLL_ACL.)
> - OPS-04 — rooming→budget lines appear but with no hotel name and no cost;
>   and assigning a room triggers a full page refresh (should be optimistic).
> - OPS-03 / OPS-14 — an off-roster person with their rooms removed still
>   lingers in the "Off-roster / unassigned" group; need to drop them when
>   they hold no rooms, and a delete action for them.
>
> **Big theme (visual, → redesign phase):** Rooming + Payroll + Budget don't
> match the Variant reference — rooming grid is functional but ugly, payroll
> wants the Advance-style week sidebar, the budget has two toolbars split by
> the summary bar (too cluttered), commissions are buried in Settings, the
> swap guard popup needs to be more obvious, and swap should prompt
> what-to-transfer.

Covers the `tour_personnel` roster unification (migration 204) and the
Payroll / Rooming / Personnel surfaces. Format in `README.md`. Prefix: `OPS`.

---

## ⛔ Keystone bug — the three lists are still NOT unified (2026-06-07)

Blocks OPS-01/02/03/04/12/13/14 and the swap tests downstream.

Observed on "Simple Plan Support | Fall'26":
- **Tour Personnel** shows: Dillon Jordan, Megan Clark, Adam Rowley.
- **Rooming** master grid shows: Alexander Weyand, Ben Quinton, Duncan
  Brookfield — a *different* set.
- **Payroll** shows yet another set (Ben Quinton, Alexander Weyand).
- Deleting Duncan's personnel profile does NOT remove him from Rooming
  (persists on refresh).
- Removing one member wiped ALL of Payroll but left Rooming untouched.
- State is non-deterministic: "didn't touch anything, now it's just Duncan
  again."

ROOT CAUSE (confirmed 2026-06-07 against prod data): **Payroll and Rooming
source their people from `personnel_rates` (rate cards), not from
`tour_personnel` (the roster).** Proof — the roster has 5 members, but only
the 2 with a rate card render in Payroll; the 3 real members (Dillon, Megan,
Adam) have `has_rate_card = false` so they're invisible. The Personnel page
reads `tour_personnel` directly, so the lists disagree.

FIX: make `tour_personnel` the row source for every surface — Payroll and
Rooming list ALL roster members, LEFT JOIN rate cards / room assignments for
their data. Fix the data model before any further personnel features.

---

## Roster unification (single source: `tour_personnel`)

#### OPS-01 — Phantom person gone, correct roster
**Result**: ❌ FAIL (2026-06-07) — deleted Duncan still shows in Rooming,
persists on refresh.

#### OPS-02 — Payroll derives from the roster
**Result**: ❌ FAIL — Payroll people (Ben, Alexander) don't match the
roster (Dillon, Megan, Adam).

#### OPS-03 — Rooming derives from the roster
**Result**: ❌ FAIL — Rooming still lists Duncan + other non-roster people.

#### OPS-04 — Budget derived lines match the roster
**Result**: ❌ FAIL — assigned 2 rooms to Duncan; budget shows only generic
"Unassigned Hotel · FROM ROOMING" ×2 @ £0, not his rooms.

---

## A — Add a person from anywhere

#### OPS-05 — Add from Payroll (optimistic)
**Result**: ✅ PASS (2026-06-07). Note: grid not resizable — surname wraps
to two lines. → design follow-up (all grids resizable).

#### OPS-06 — Add from Rooming (optimistic)
**Result**: ✅ PASS. Note: Ben appeared in Rooming after a Payroll-add
(cross-surface state) — verify the Duncan drift is tour-specific and would
NOT recur on a fresh tour.

#### OPS-07 — Added person seeded with a rate card
**Result**: ⚠️ PARTIAL. The single show-rate seeds, but the add slide only
captures very basic fields — no travel rate / per diem / role tag / status.
→ design follow-up (Phase E): richer add + payroll week navigation via a
reused Advance-style routing sidebar (weeks/dates/cities on the left).

#### OPS-08 — Add propagates to all surfaces
**Result**: ✅ PASS.

#### OPS-09 — "Workspace personnel" link
**Result**: ✅ PASS.

#### OPS-10 — Inline "create new person"
**Result**: ✅ PASS. Note: "Create new person" is buried below a long
unscoped list — needs search + a sticky button.

#### OPS-11 — No re-offer of people already on the roster
**Result**: ✅ PASS. Note: prefer greying-out already-assigned people with
an "already assigned to this tour" label rather than hiding them.

---

## B — Remove (cascade + roommate safety)

#### OPS-12 — Remove confirm lists the cascade
**Result**: ❌ FAIL — removing one member wiped ALL of Payroll, left Rooming
untouched; only Personnel updated. Cascade is wrong + destructive.

#### OPS-13 — Remove executes the cascade
**Result**: ❌ FAIL (same as OPS-12).

#### OPS-14 — Shared-room roommate keeps their room
**Result**: 🚧 BLOCKED — state thrashed (everyone gone from Rooming, then
Duncan reappeared). Re-test after the keystone fix.

---

## C — Swap personnel (transfer, no rebuild)

#### OPS-15 — Swap dialog lists transfer counts
**Result**: ❌ FAIL — the swap popover opens but the name list isn't
clickable; dead end. → redesign: rename the button "Swap personnel"; flow
like "copy advance to other days" — pick the replacement from a dropdown,
choose what to transfer, and prompt to manually fill anything NOT
transferred.

#### OPS-16 — Swap transfers rate card + rooms
**Result**: 🚧 BLOCKED (personnel retention unreliable).

#### OPS-17 — Swap re-labels budget lines on reconcile
**Result**: 🚧 BLOCKED.

#### OPS-18 — Swap guard: replacement already on roster
**Result**: ❌ FAIL — names in the swap menu aren't clickable, so the guard
can't be reached.

#### OPS-19 — Swap guard: same person / cross-workspace
**Result**: 🚧 BLOCKED.

---

## Design follow-ups (2026-06-07 smoke → Phase E/F)

- **All grids resizable** (payroll, rooming, personnel) — surnames wrap
  today. Part of the app-wide grid system.
- **Payroll week navigation**: reuse the Advance left routing sidebar —
  group by WEEK with dates + cities on the left; navigate weeks there
  instead of the WC tabs.
- **Add-person slide**: capture the full tour-personnel fields (travel rate,
  per diem, role tag, dates, status), not just one rate.
- **Add-person list**: searchable + sticky "Create new person" button.
- **OPS-11**: grey out already-assigned people with a label, don't hide.
- **Swap UX (OPS-15)**: dropdown + per-field transfer choices + manual-fill
  prompts for fields not carried over.

---

## Known broken (2026-06-07)

- **Keystone**: OPS-01/02/03/04 (lists not unified), OPS-12/13 (remove
  destructive), OPS-14/16/17/19 (blocked by retention), OPS-15/18 (swap menu
  not clickable). All trace to the roster-unification data model — see top.

## Payroll — Stage B (canonical grid + shared rail) — 2026-06-10

> Restructure onto 3 views (Rates & totals · Days matrix · Summary) + the shared
> `<RoutingRail>` night cell, + the OPS-17 proving test. Fee math (fees.ts),
> the budget Salary feed, and internal_rate gating are unchanged.
> `tsc` 0 · `eslint` 0 · `next build --webpack` green at this commit.

#### PAY-OPS17 — fee math matches the real sheet (closes the OPS-17 fee half)
**Do**: `node --experimental-strip-types src/lib/payroll/fees.test.ts`.
**Expect**: 8 checks pass — Richie **$4,611**, Duncan **$1,607** (his real half
travel rate, not a band rule), Jake **$2,250**, Adam PD **$167**, the "no
show-rate fallback" case (300 show / 0 off over 21+10 = £6,300 not £9,300), and
no_tour-ignored / rehearsal-counts. **Status: PASS (code-verified).** Adam
re-confirms the same numbers render in the Rates & totals view live.

#### PAY-01 — Days matrix on the shared rail
**Do**: Payroll → **Days matrix**. 
**Expect**: days run **down the left** as the shared RailNightCell (date · city ·
day-type pill — identical to Advance/Rooming), people across the top, grouped by
**week** (WC dd Mon dividers), **all** routing dates incl. no-tour. Cells =
Show / Off-Travel / No-Tour, **token-coloured** (no hardcoded emerald/amber).
Editing a cell persists (POST /api/budget/payroll), optimistic, survives reload.

#### PAY-02 — Rates & totals (default view)
**Do**: Payroll (default view).
**Expect**: re-skinned `<SpreadsheetGrid>` (raised panel) with every column
explicit: person · role · employment · rate type · **show · off · reh · PD**
rates · **show days · off/travel days · total fee · total PD · advance** ·
notes. The computed columns are read-only and **equal the sheet** (Richie
$4,611…). Rate edits persist (PATCH /api/budget/personnel-rates).
**Needs-live**: Adam confirms visual parity with the budget `<Grid>` (raised
panel / gutter / row styling) — deep cell/header parity lives in SpreadsheetGrid;
flag if it reads off.

#### PAY-03 — Person rate-card slide  *(DEFERRED — see note)*
The dedicated slide (show/travel/per-diem/**advance** editable + internal_rate
admin-gated) is **not in this build**: it must reuse the existing gated editor
(`PersonnelRatesSection`, server-gated), which needs the `tour_personnel`
memberId plumbed into the payroll rates payload (today the row only carries
`roster_personnel_id`). Show/travel/per-diem stay editable **inline** in
PAY-02; **advance editing currently has no home** (the old week sheet was
removed) until PAY-03 lands. Flagged to Adam.

#### PAY-04 — internal_rate stays admin-only
**Do**: As a non-admin, open any payroll surface.
**Expect**: `internal_rate` is never shown or writable in the all-staff Rates
grid (it isn't a column) and the server gate (`rates` route) is untouched.
**Status: code-verified** (no change to the gate).

#### PAY-05 — budget Salary/Per-Diem feed unchanged
**Do**: Set day statuses in the Days matrix, then open Budget → Expenses.
**Expect**: the derived `payroll` Salary + `payroll_per_diem` lines reconcile
exactly as before (same `reconcileDerivedLines` recompute from day_statuses via
the same helper). **Needs-live** (Adam).

#### PAY-06 — Summary unchanged
**Do**: Payroll → **Summary**. **Expect**: identical to before (kept as-is).

> **Deferred follow-ups:** PAY-03 rate-card slide + **advance editing** (needs
> memberId plumbing); `acl_per_diem` festival override (CC_PAYROLL_ACL); branded
> payroll PDF (bucket + brand_color exist, unused — future).

## Retired

(None yet.)

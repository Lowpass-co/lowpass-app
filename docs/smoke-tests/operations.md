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
$4,611…). Rate edits persist (PATCH /api/budget/personnel-rates). **Advance is
editable** (→ `personnel_rates.advance_fee` via the same route; not
internal_rate-sensitive, no gating) and the **Total fee** moves with it live.
*Nuance:* the budget reconcile reads the per-week `payroll_entries.advance_fee`
(synced from the rate card at **generate**), so the budget Salary line picks up
a manual advance edit on the next generate — aligning the two advance sources is
part of PAY-03.
**Needs-live**: Adam confirms visual parity with the budget `<Grid>` (raised
panel / gutter / row styling) — deep cell/header parity lives in SpreadsheetGrid;
flag if it reads off.

#### PAY-03 — Person rate-card slide  *(DEFERRED — narrowed)*
Show / travel / per-diem / **advance** are all editable **inline** in PAY-02
now, so the deferred slide's remaining job is the **internal_rate** admin-gated
field + a focused card. It must reuse the existing server-gated editor
(`PersonnelRatesSection`), which needs the `tour_personnel` memberId plumbed
into the payroll rates payload (today the row only carries `roster_personnel_id`)
— so it stays a focused follow-up. No advance-editing gap anymore.

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

## Payroll persistence + advance unify — 2026-06-21 (PAYROLL_PERSIST_MAP)

> Day-status state is lifted into `<PayrollView>` (it never unmounts on a tab
> switch), so the three views share ONE `usePayrollGrid`. Advance unified onto
> the **rate-card** `personnel_rates.advance_fee` across Days, Summary, AND the
> budget reconcile. (IDs are PAY-07+ — the existing PAY-01/PAY-04 IDs above mean
> other things; these cover the ticket's "PAY-01 persistence" + "PAY-04 ≠".)

#### PAY-07 — Days edits survive a tab switch (was "PAY-01")
**Do**: Edit a day cell in the Days matrix → switch to **Rates** → switch back
to **Days**. **Expect**: the edited cell still shows the new value (no reload);
the edit is not lost on unmount. **Needs-live** (Adam).

#### PAY-08 — Summary == Rates == Days (was "PAY-04")
**Do**: Compare a person's Total fee across Days (Total column), Rates (Total
fee), and Summary. **Expect**: all three agree (same day counts + same rate-card
advance). For someone with a non-zero advance, editing the Rates "Advance"
column moves their Total fee on all three (after the views re-read). **Needs-live**.

#### PAY-09 — MTX-06 frozen Total column
**Do**: Days matrix. **Expect**: a second **frozen** column ("Total", pinned next
to the person name) shows each person's total fee, staying visible while scrolling
the day columns horizontally. (Refreshes on view re-entry — see map caveat.)
**Needs-live** (the sticky-left offset of the 2nd frozen column).

#### PAY-11 — frozen cells stay opaque on scroll (selected row)
**Do**: Select a row (click a day cell), then scroll the day columns horizontally.
**Expect**: the frozen **Person** + **Total** cells stay fully opaque — the
scrolling day cells do NOT bleed through the name, even on the selected/active
(tinted) row. The selection tint is still visible on the frozen cells (composited
over an opaque underlay). **Needs-live** (the scroll). (Fix: opaque `::before`
underlay on frozen body cells in `grid.css`; also covers the rooming matrix.)

#### PAY-10 — OPS-17 still holds + reconcile intact
**Do**: Ben (21 show × £300, 10 travel × £0, advance £0) → Budget Salary line.
**Expect**: still **£6,300**; Salary/Per-Diem reconcile unchanged (advance now
read from the rate card, neutral for Ben). **Needs-live**.

## Polish batch — 2026-06-23 (BUDGET_POLISH_MAP)

#### MTX-03 — rooming room codes are distinct colours
**Do**: Rooming → matrix (and Cards). Assign different codes (SGL, DBL A/B/C/D).
**Expect**: each room code has its **own** token hue (was SGL=blue, every
DBL=violet → indistinguishable). Matrix cell-fill + Cards tint use the SAME
palette (`ROOM_CODE_HUE` in `useRoomingGrid.ts`; `roomCodeTint` derives from
it). Token-clean. **Needs-live**.

#### ROOM-01 — rooming Cards view refreshed
**Do**: Rooming → Cards view.
**Expect**: room cards read canonical — raised surface (`--lp-shadow-sm` +
`--lp-border-strong`), a header with a **hue dot + code badge + occupant count**,
token tints per code. Assign (pool select) / unassign (chip ✕) still work
(unchanged `saveCell` → budget feed intact). **Needs-live**.

#### MTX-05 — payroll Days-matrix headers uncramped
**Do**: Payroll → Days matrix. Read the day-column headers.
**Expect**: week label / date / city / day-type no longer collide — full-width
children with `nowrap` + ellipsis truncate cleanly (city + type get `title`
tooltips), more gap/padding. (`DayHeader` in `PayrollDaysMatrix.tsx`.) Token
colours unchanged. **Needs-live**.

## Retired

(None yet.)

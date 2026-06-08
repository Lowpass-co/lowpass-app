# Operations smoke tests

> **Last bulk verification**: 2026-06-07 re-smoke (Adam, preview, AFTER the
> foundation fix). **Keystone RESOLVED** — Payroll, Rooming, and Personnel
> now show the same 5 roster members; remove is no longer destructive; swap
> is clickable.
>
> **Still failing (functional):**
> - OPS-16 — after a swap the displayed name stays the OLD person's name.
> - OPS-17 — payroll does NOT flow to the budget SALARY section (empty); and
>   the payroll total-fee math is wrong (counts ALL days × show rate, ignores
>   the show-vs-travel-day split).
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

## Retired

(None yet.)

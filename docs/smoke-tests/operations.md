# Operations smoke tests

> **Last bulk verification**: (pending — personnel unification + A/C built
> blind on `feat/personnel-unify`, not yet click-tested)

Covers the `tour_personnel` roster unification (migration 204) and the
Payroll / Rooming / Personnel surfaces that all derive from it. Format in
`docs/smoke-tests/README.md`. Prefix: `OPS`.

Reference tour: **"Warning Support"** (populated). OPS-01 is best checked on
the tour that previously showed the phantom person (Duncan Brookfield).

Run order: do the **auth gate** (AUTH-05..09 in `auth.md`) first — we
changed the route proxy on `main`; if login or saving is broken, stop and
fix that before testing anything below.

---

## Roster unification (single source: `tour_personnel`)

#### OPS-01 — Phantom person gone, correct roster

**Do**: Open a tour's Personnel page (the one that used to list Duncan
Brookfield).

**Expect**: The roster lists only people actually on the tour. Duncan
Brookfield (never on this tour) is absent; Dillon Jordan (who is on it) is
present.

**Last verified**:

#### OPS-02 — Payroll derives from the roster

**Do**: Open the tour's Payroll.

**Expect**: Payroll lists exactly the roster people — not empty, no
phantoms. Each has a rate-card row.

**Last verified**:

#### OPS-03 — Rooming derives from the roster

**Do**: Open the tour's Rooming master grid.

**Expect**: Rooming lists the same roster people as Personnel and Payroll —
one list, no drift between the three.

**Last verified**:

#### OPS-04 — Budget derived lines match the roster

**Do**: Open the tour's Budget tab; find the payroll + per-diem derived
lines.

**Expect**: Derived lines correspond to roster people only — no phantom
names, none missing.

**Last verified**:

---

## A — Add a person from anywhere

#### OPS-05 — Add from Payroll (optimistic, no reload)

**Do**: On Payroll, click **"+ Add person"**, pick an existing workspace
person, confirm.

**Expect**: The new row appears immediately, with no full-page reload. They
land in the **Crew** group (the seeded rate card defaults to
`person_type: 'crew'`).

**Last verified**:

#### OPS-06 — Add from Rooming (optimistic, no reload)

**Do**: On Rooming, click **"+ Add person"**, pick a person.

**Expect**: They appear in the rooming master grid immediately, no reload.

**Last verified**:

#### OPS-07 — Added person is seeded with a rate card

**Do**: After OPS-05, look at the new person's Payroll row.

**Expect**: A rate card exists (auto-seeded). If they're band/principal
rather than crew, the `person_type` on the card can be changed.

**Last verified**:

#### OPS-08 — Add propagates to all surfaces (single source)

**Do**: Add a person on Payroll, then open Rooming and Personnel.

**Expect**: The same person is now present on all three — one roster, no
re-entry needed.

**Last verified**:

#### OPS-09 — "Workspace personnel" link

**Do**: In the add slide-out, click **"Workspace personnel ↗"**.

**Expect**: Navigates to the workspace-wide Personnel page.

**Last verified**:

#### OPS-10 — Inline "create new person"

**Do**: In the add slide-out, create a brand-new person (instead of picking
an existing one), then assign.

**Expect**: A new workspace person is created and added to the tour roster
in one flow (`POST /api/personnel` then assign).

**Last verified**:

#### OPS-11 — No re-offer of people already on the roster

**Do**: Open the add search when several people are already on the tour.

**Expect**: People already on the roster don't appear in the search
(`excludePersonIds` derived from current people).

**Last verified**:

---

## B — Remove (cascade + roommate safety)

#### OPS-12 — Remove confirm lists the cascade

**Do**: On the personnel manage slide-out, remove a roster member.

**Expect**: A confirm dialog names exactly what cascades — their rate card,
N room assignments, M derived budget lines (counts from
`removal-preview`).

**Last verified**:

#### OPS-13 — Remove executes the cascade

**Do**: Confirm the removal.

**Expect**: Person gone from Payroll, Rooming, and Personnel; their rate
card, room assignment, and derived budget lines are removed. The personnel
record itself stays in the workspace library.

**Last verified**:

#### OPS-14 — Shared-room roommate keeps their room

**Do**: Remove one occupant of a shared (Twin/Double) room.

**Expect**: The roommate keeps their assignment — only the removed person's
occupancy clears; the room isn't deleted.

**Last verified**:

---

## C — Swap personnel (transfer, no rebuild)

#### OPS-15 — Swap dialog lists transfer counts

**Do**: On a roster member's manage slide-out, click **"Swap…"**, pick a
replacement.

**Expect**: A confirm dialog lists what transfers (rate card / N rooms / M
budget lines) — reusing the removal-preview counts.

**Last verified**:

#### OPS-16 — Swap transfers rate card + rooms

**Do**: Confirm the swap.

**Expect**: The replacement inherits the rate card and room assignments; the
original is off the roster.

**Last verified**:

#### OPS-17 — Swap re-labels budget lines on reconcile

**Do**: After a swap, open/refresh the Budget tab.

**Expect**: The derived budget lines now show the replacement's name. This
happens on the next budget reconcile (open/refresh) because the lines key on
the rate-card id (`source_entity_id`), which now belongs to the
replacement — not instantly.

**Last verified**:

#### OPS-18 — Swap guard: replacement already on the roster

**Do**: Try to swap to someone already on the tour.

**Expect**: 409 with a clear message; no partial transfer.

**Last verified**:

#### OPS-19 — Swap guard: same person / cross-workspace

**Do**: Try to swap a person for themselves, or for someone outside your
workspace.

**Expect**: Rejected (no-op / blocked); no data change.

**Last verified**:

---

## Known broken

(None recorded yet — A + C are built but unverified. Move any failure you
find here with a one-line failure mode + the file/PR it's tracked in.)

## Retired

(None yet.)

# Claude Code prompt — Personnel unification (REMAINING work)

> Phase 1 (migration 204) + Phase 2 CORE are already shipped — do NOT redo
> them. This is the remainder + the payroll/rooming design. Continue on the
> personnel branch (or a new one off it). Deliver phase-by-phase; verify in
> `npm run dev` (webpack here, runs fine); report honestly; commit nothing.
>
> Heads-up: the working tree also carries uncommitted budget files from a
> prior task — commit/stash those separately so this work stays clean.

## Already DONE (context — don't rebuild)
- **Migration 204:** `tour_personnel_id` FK on `personnel_rates` +
  `room_assignments`, `ON DELETE CASCADE`, lossless backfill.
- Payroll, Rooming, and the Budget reconcile render **only roster-linked
  people**.
- Assigning a person to the roster **seeds a rate card**; deleting cascades
  (clears rate card + room assignments); a **shared-room roommate keeps
  theirs** (per-person rows). So Phase 3's DB behaviour is satisfied — only
  the confirm UI remains.

## Design principles (payroll + rooming)
- **Keep Adam's visual date-grid concept** — people × tour dates (from
  Routing), the at-a-glance grid blocks. Do NOT flatten to a plain
  per-person table. Layer detail into slide-outs, not more columns.
- **Slide-outs are a STANDARD pattern** on every grid — clicking a rooming
  cell/date or a payroll person opens a `SlideOver` with detail + attachments
  (late arrival, rooming diagram, deduction evidence). Build this as the norm.
- Payroll + Rooming stay **separate surfaces** (own tabs).

## Pitfalls
No per-edit `router.refresh()`; reuse the optimistic overlay + portaled
`InlineSelectCell` + `BudgetConfirmDialog`; pure helpers out of `'use
client'`; `.maybeSingle()`. Token-clean. `next build --webpack` green;
eslint 0; show diffs; commit nothing. **Migrations continue at 207** (205 +
206 are already taken: ai_usage_provider_google, storage_artist_assets_tighten).
NOTE: the build is currently broken by a stray untracked `src/middleware.ts`
colliding with `src/proxy.ts` — that must be deleted before any build passes.

## A — Finish Phase 2: add-person slide-out on Payroll + Rooming ✅ DELIVERED (untested)
The add-to-roster flow exists only on the Personnel page. Mount the
`AddPersonnelSlideOver` (refactor to a shared, standalone component) on the
**Payroll and Rooming** surfaces too. Adding there assigns the person to the
roster (seeding their rate card + rooming row) — single source, no drift.
Inside the slide, an **"Add new person to workspace"** button that navigates
to the workspace-wide personnel page to create the person properly, then
back. Use an optimistic update (no `router.refresh`).
- Orphan flag: NOT needed. The lossless 204 backfill put rooming-only people
  (e.g. Duncan) onto the roster — just **remove them via the Personnel page**
  (the cascade handles it). Skip the `needs_review` marker unless asked.

## B — Phase 3: Remove confirm dialog ✅ DONE
Shipped: `GET /api/tours/[id]/personnel/[memberId]/removal-preview` counts the
rate card + room assignments + derived budget lines + flags shared rooms;
`PersonnelManageSlideOver`'s remove modal shows the dynamic description. Don't
redo.

## C — Phase 4: Swap personnel ✅ DELIVERED (untested)
A **"Swap"** action on a roster member → replace with another person (pick
from workspace `persons`, or add new), **transferring rate card + room
assignments + derived budget lines** to the replacement. No rebuild.

## D — Phase 5: Multiple custom rates (migration 208 — NOT 207)
Support **multiple rate types per person**: ship defaults (show / off-travel
/ rehearsal / per-diem / advance) AND let users **add / rename / remove
custom rate lines**, each mapping to the day-type(s) it applies to. Likely a
`personnel_rate_lines` table (migration **208** — 205/206/207 are all taken:
ai_usage, storage_artist_assets, gdpr_requests) or a structured extension of
`personnel_rates`. Principle: guided defaults, full custom control.

## E — Phase 6: Payroll UX (keep the date-grid)
Date-grid (person × tour dates, day-type per day drives base pay) + payout
calc per person:
- **Base pay** with breakdown ("15 days @ $650") = day-grid × rate lines.
  **Per diem total** = days × per-diem.
- **Advance / Surplus** column (renamed from "bonus/extra"), customisable.
- **Deductions** column, customisable — each deduction REQUIRES a note
  (reason) + a responsible user + optionally a receipt attachment. No
  unexplained deductions.
- **Net payout** + **payment status** (Paid / Processing / Pending approval).
- **Pay-cycle selector + "Run Payroll"** action (keep — Adam loves it).
- Show **routing context** (dates / city / venue).
- Per-person **slide-out** for payout detail + deduction evidence.

## F — Phase 7: Rooming UX (keep the date-grid)
Adam's draggable date-grid (people × tour dates, room-type cell per night),
header **name · role · city · day-type · date** (from Routing):
- **Roommate patching:** choosing a shared room type (Twin/DBL) prompts you
  to assign who else is in the room — like the **channel-list sub-snake
  patching** — linking them as a room group. Display **Twin (A) / Twin (B)**
  with the sharer named. Cost counts **once per room**. This is the SAME
  room-group link behind the shared-room delete rule (remove one occupant →
  room + roommate stay).
- Per-cell / per-date **slide-out**: check-in/out, rate/night, conf #,
  late-arrival note, attachments (e.g. rooming diagram).
- Assumed rate + Est total working; columns/rows customisable; clean up the
  messy triple-row header.

## Verify (per phase)
`next build --webpack` green; eslint 0. Confirm add-from-anywhere; remove
confirm lists everything; swap transfers cleanly; multiple rate lines edit;
payroll shows base/per-diem/advance/deductions(+evidence)/net/status + cycle
+ routing context; rooming keeps the date-grid + roommate patching + slide-outs.
Show diffs + line ranges; say honestly what's done.

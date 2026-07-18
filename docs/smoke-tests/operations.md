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

#### PAY-07 — Rate-type edit rebuilds the SSOT lines (CR-02)
**Do**: In the Rates grid, change a person's **Rate type** cell (day rate ↔ split
rate). **Expect**: the change persists AND the totals/derived lines rebuild to the
new layout — `day_rate` emits the single day-rate line and drops the stale
split lines (show/off/rehearsal); `split_rate` restores them. Root cause was the
PATCH route only calling `writeRates` on a rate-amount edit, so a rate-type-only
flip changed the column but not the lines. **Code-verified**: `writeRates` fires
when `updates.rate_type !== undefined`; `fees.test` (15 checks) green. **Needs-live** (Adam).

#### PAY-08 — Days-matrix brush + Fill-all (G2-1)
**Do**: On the one-page Payroll, pick a day-type **brush** (Tour default / Show /
Rehearsal / Travel / Off / Promo·Radio) and paint person-day cells; open **Fill all…**.
**Expect**: click paints the brush (or erases if the cell already carries it);
status abbreviations + tints update; the live **Total** ticks. Promo/Radio bills
the SHOW rate; the override drives pay through the ONE path (day_statuses). Fill-all
warns with the hand-edited count and offers "Fill only untouched" (default) /
"Overwrite everything". Money gate: reconcile.harness override gate green. **Needs-live**.

#### PAY-09 — Personnel is a read-only rate mirror (G2-1)
**Do**: Open `/operations/[tourId]/personnel`; click a **Rate** value.
**Expect**: the page LOADS (no "Loading personnel…" hang — the ops layout no longer
blocks on a live Spotify fetch); the Rate column is display-only; clicking a rate
routes to `/operations/[tourId]/payroll?focus=<cardId>` (edit lives only in Payroll).
No rate-edit form exists outside Payroll. **Needs-live**.

#### PAY-10 — Days-matrix drag fills a RECTANGLE (G2-1b)
**Do**: In the days matrix, press on a cell and drag to another cell (any direction),
then release.
**Expect**: the full **rectangle** between anchor and cursor — every person-row ×
every day-column in the box — fills with the active brush, with a live orange
preview of the box while dragging; release commits. NOT a single diagonal line
(that's the patch matrix's rule). Shift+click still extends a run across the row.
**Code-verified** (rect commit on mouseup); **Needs-live** (Adam re-walks).

#### PAY-11 — Matrix dominates; Rates/Summary collapse (G2-1b)
**Do**: Open Payroll.
**Expect**: the DAYS MATRIX is the primary surface — it fills the available height
(sticky Person/Total/day header row while scrolling rows), 34px rows. **Rates**
and **Summary** are collapsed disclosures (Rates: "N people · click to edit rates &
types"; Summary: read-only) — one click to expand, not co-equal always-open tables.
No repeated per-section heading chrome. Adam's "page is VERY busy / grid is VERY
small" is resolved. **Needs-live**.

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

## Tour creation — 404 root cause fixed (feat/tour-create-modal)

> Adam couldn't create a tour. **Root cause (confirmed, single):** the bare
> `next.config.ts` redirect `/tours/:id → /operations/:id` had an unconstrained
> `:id`, so `/tours/create` matched `:id='create'` and 301'd to `/operations/create`
> → 404. EVERY create entry point (tours-list button + empty-state, AppTopBar,
> ShellTopBarClient, DashboardArtistGate, DashboardTourList, TourPicker, JobModal)
> routes through `/tours/create`, so create was dead app-wide (only the switcher,
> which opens the slide-over directly, escaped it). **No second bug:** the POST
> `/api/tours` route (requires artist_id + name + dates; inserts with
> `workspace_id = profile.workspace_id`), the RLS INSERT policy (migration 004:
> `WITH CHECK workspace_id = get_my_workspace_id()`), and the `TourCreateSlideOver`
> submit were all verified sound.

- **TOUR-CREATE-01 — redirect constrained (create unblocked).** `/tours/:id` now
  matches only a UUID (`:id([0-9a-fA-F-]{36})`), so `/tours/create` no longer
  mis-301s and the create page loads for every entry point. (Proven: regex matches a
  real UUID, rejects `create`; build green.) **301-cache gotcha:** the old permanent
  redirect caches hard — verify in incognito / after clearing the redirect cache.
- **FLAGGED — remaining Part-3 scope not landed here:** the one-modal migration
  (`TourCreateSlideOver` → `<Modal size='lg'>`), repointing all 8 entry points to
  open that modal (needs a shared modal host), retiring the full-page wizard
  (`tours/create/page.tsx` + `TourWizard`), and rehoming `DashboardTourCard`'s
  `?edit=` push to `EditTourSlideOver`. Deferred because (a) safely deleting the
  wizard requires all 8 entry points repointed + a live create/edit to verify, and
  (b) an authenticated end-to-end tour INSERT can't be run headlessly to satisfy the
  "prove created" bar — the redirect fix is the demonstrable, non-regressing
  create-unblock; the modal refactor is a larger follow-up needing live access.

## Tour create/edit modal — one modal, wizard retired (feat/tour-editor-modal)

> ONE `<Modal size="xl">` for create AND edit (`TourEditorModal`), hosted app-wide by
> `TourEditorProvider` + `useTourEditor()` (mounted in `(app)/layout.tsx`, next to the
> other providers). Tabbed **Details | Routing** (active tab underlined in orange);
> Step 1 = Artist (Existing/New for create; locked on edit) · Name · Dates · Region ·
> Currency (NO party-size counts); Step 2 = the Part-2 venue-first RoutingGrid. Minimum
> to create = artist + name + dates (routing skippable). ALL 8 `/tours/create` entry
> points repointed; the full-page wizard (`tours/create/page.tsx` + `TourWizard`) and
> `TourCreateSlideOver` are DELETED (zero real importers, grep-verified). Floor green.
> **UI verified live by Adam** via this script. **Live authenticated create is Adam's
> click** (headless can't auth-INSERT).

Entry points repointed (all now open the modal, none navigate to /tours/create):
switcher (`ArtistTourSwitcherClientWrapper`), tours-list button + empty-state
(`tours/page.tsx` via `NewTourButton`), `AppTopBar`, `ShellTopBarClient`,
`DashboardArtistGate` (`DashboardChooseTour`), `DashboardTourList`, `TourPicker`,
`JobModal`. Edit: `DashboardTourCard` → `openEditTour(id)`.

Adam live-test script (on preview, incognito to dodge the old 301 cache):
- **TOUR-MODAL-01 (opens everywhere):** click New Tour from the switcher, the AppTopBar
  “NEW TOUR”, and the tours-list button → the wide modal opens on the Details tab each
  time. Expected: modal, not a 404 or the old wizard page.
- **TOUR-MODAL-02 (create — minimum):** pick an Existing artist · type a name · set
  start+end dates → “Skip routing & create”. Expected: the tour is created and opens at
  /operations/<id>. (Adam's live click — the auth-INSERT can't run headless.)
- **TOUR-MODAL-03 (create — with routing):** on Details click “Next: routing →” → the
  Routing tab seeds one row per date · venue-search a couple → “Create tour · N days”.
  Expected: tour + routing created; opens Operations.
- **TOUR-MODAL-04 (new artist):** Artist toggle → New → type an artist name + tour
  name + dates → create. Expected: the artist is created (POST /api/artists) then the
  tour under it.
- **TOUR-MODAL-05 (edit — same modal, pre-filled):** on a tour card → ⋯ → Edit tour →
  the SAME modal opens in edit mode, artist locked, Name/Dates/Region/Currency
  pre-filled → change the name → “Save changes”. Expected: PATCH persists; the list
  refreshes.
- **TOUR-MODAL-06 (wizard gone):** manually visiting /tours/create no longer renders a
  wizard (the page is deleted); every “New tour” affordance opens the modal instead.
  Expected: no wizard anywhere; grep shows zero /tours/create links.
- **FLAGGED (not a fork — a scoped follow-up):** the Operations **summary** page still
  uses `EditTourSlideOver` (its drawer) for tour edit (it's the one real importer left).
  Fully retiring that drawer = repoint `OperationsSummaryClient`'s edit trigger to
  `openEditTour(tourId)` + delete `EditTourSlideOver` — a clean 1-file continuation.
  The modal edit already works from the dashboard card.

## Venue-first, library-aware routing grid (feat/routing-venue-search — UI)

> The routing grid is now venue-first + library-aware. Columns reordered to
> **Date · Venue · City · Country · Address · Day** (Notes + Transport retained as
> trailing columns; the between-row TravelBox unchanged). `country` (routing.country,
> mig 103 — previously dropped by the save/load path) is now threaded end-to-end.
> `VenueAutocomplete` is library-first: keystroke → `GET /api/venues/canonical/search`
> (no Places billing); the Google path is invoked ONLY from "Create new" — session
> token + `handleSelect` byte-for-byte (fewer Places calls than before). Floor green.
> **UI verified live by Adam** via this script.

Adam live-test script (on preview, a tour with an existing routing grid):
- **ROUTE-VEN-01 (library search first):** in a Venue cell, type ≥2 chars of a known
  venue → the dropdown shows library matches as `◆ Name — City, Country · cap` (orange
  ◆), NO Google logo/billing. Expected: matches appear from the library.
- **ROUTE-VEN-02 (pick → link + auto-fill):** click a match → Venue fills; City,
  Country, Address auto-fill from the venue; an orange link icon shows to the left of
  the Venue cell (row linked to `canonical_venue_id`). Expected: those cells populate;
  the link marker appears.
- **ROUTE-VEN-03 (manual address, no unlink):** edit the Address cell by hand → the
  text persists AND the orange link marker stays (a manual edit does NOT unlink).
  Save + reload → address + link survive.
- **ROUTE-VEN-04 (no match → create):** type a venue not in the library → click
  “Create ‘<typed>’ as a new venue” → Google suggestions appear; pick one → it fills +
  (on Save) resolves to a canonical venue (via `place_id` → `findOrCreateCanonicalVenue`
  → the library grows). Expected: Google list only on create-new; picked venue fills.
- **ROUTE-VEN-05 (keyboard):** with the dropdown open, ArrowDown/Up moves the
  highlight across matches + the create row; Enter accepts the highlighted item.
  Expected: keyboard selects without the mouse.
- **ROUTE-VEN-06 (country round-trips):** set/auto-fill Country on a row → Save →
  reload → Country persists (the mig-103 column, now threaded through save/load).
- **ROUTE-VEN-07 (no billing regression):** in the Network tab, typing in Venue hits
  `/api/venues/canonical/search` only — `/api/places/autocomplete` fires ONLY after
  clicking “Create new”. Expected: fewer Places calls than before.

## Routing view revamp (feat/routing-revamp)

> RESTYLE to the app's canonical language (Adam's call: keep the bespoke routing
> engine + venue-autocomplete + date-seeding — do NOT migrate to `<SpreadsheetGrid>`).
> Restyle + a functional audit of the CRUD/save path. Verification: static code-path
> audit + build (a live DOM run needs an authenticated tour with routing — not
> exercised headlessly; flagged).

- **ROUTE-UI-01 — token-clean chrome.** The three views (`RoutingGrid` /
  `RoutingCalendar` / `RoutingEditor`) now carry ZERO raw-Tailwind colour classes
  (grepped clean). `travelColor` red/amber/emerald → the lp status palette
  (`--color-lp-error` / `--color-lp-status-needs-review` / `--color-lp-status-complete`),
  applied inline. The save-error banner → `--color-lp-error` + `color-mix`. Cell inputs
  flattened `rounded-xl`→`rounded-lg` to read grid-like. Header (`lp-table-header-text`,
  `bg-lp-bg-secondary`, uppercase tracking), row hover (`hover:bg-lp-surface-hover`) and
  the day-type / transport pills were already canonical + token-based. (Proven: grep
  finds no `text-(red|amber|emerald|…)-\d` in any of the three; build green.)
- **ROUTE-UI-02 — save round-trip carries the full row (audit).** `handleSave`
  (`RoutingEditor.tsx:263`) POSTs `/api/tours/[id]/routing` with every field —
  `date · day_type · city · address · venue_name/website/phone/capacity · notes ·
  latitude · longitude · transport_to_next · place_id · canonical_venue_id` — so an
  edit persists and survives reload. (Verified by reading the payload builder
  272–290; live persist not run headlessly.)
- **ROUTE-UI-03 — venue pick writes lat/lng (audit).** `VenueAutocomplete`'s
  `onPlaceSelect` (`RoutingGrid.tsx:361`) merges `latitude`/`longitude` + `place_id`
  (canonical resolve on save) into the row via the immutable `updateRow`; address is
  only overwritten when the pick returned one. Delete routes through `onDeleteRow` +
  `DeleteConfirmationModal` (single-row). (Verified by reading the handlers; the
  bespoke engine + autocomplete + date-seeding are unchanged, so DEFAULT data renders
  unchanged.)
- Note (pre-existing, out of scope): `RoutingGrid`'s `TravelBox` drive-time effect
  trips a `react-hooks` setState-in-effect eslint error in unchanged code (empty diff
  vs main) — not introduced here; the `next build` floor is green.

## Branded, exact map pins (feat/tour-map-pins)

> The routing maps' Leaflet pins were the stock unpkg blue teardrop (external CDN)
> with a double-anchor drift (`iconAnchor:[12,41]` on a `[60,50]` box + an inner
> `transform: translate(-50%,-100%)` + a variable-width date label above the pin →
> pins sat off-true and crawled on zoom). Both `RoutingMap.tsx` and
> `BudgetRoutingMap.tsx` now use ONE shared branded pin (`src/lib/routing/mapPin.ts`).
> CHECK-FIRST correction: `BudgetRoutingMap` did NOT use the stock marker — it used a
> branded orange **dot** with hardcoded `#FF4500`; now unified + tokenised.
> Verification: module-level functional smoke + build (a live Leaflet render needs an
> authenticated tour with lat/lng — not exercised headlessly).

- **MAP-PIN-01 — branded, inline, no external fetch.** `brandedPinSvg()` is an inline
  SVG teardrop filled with `var(--lp-orange)` (matches the export map's orange
  treatment). No `<img>`, no unpkg/CDN/.png. The dead `defaultIcon` (unpkg `L.icon`)
  was removed; `createTransportDivIcon` tokenised (`white`→`var(--lp-panel)`,
  `#374151`→`var(--lp-text-secondary)`). Show/festival = orange, other days = a muted
  on-brand tint (mirrors renderRouteMap). (Proven: svg + orange token + no external
  URL/img.)
- **MAP-PIN-02 — deterministic tip anchor (drift killed).** `iconSize = PIN_SIZE`
  (the SVG's real px), `iconAnchor = [W/2, H]` = the bottom-centre tip, and the pin
  html has NO `translate()` / transform. The teardrop path tip is drawn exactly at
  (W/2, H) so the anchor lands on it. Leaflet reprojects a fixed px anchor to the
  lat/lng at every zoom → the tip locks to the coordinate. (Proven: anchor math + no
  transform + tip coordinate; simulated constant tip offset across zoom 3/8/14.)
- **MAP-PIN-03 — label can't move the pin.** The date label moved out of the anchored
  pin into a permanent Leaflet `<Tooltip>` (`tooltipAnchor = [0, -H]` = pin top). The
  pin SVG is pure shapes — no `<text>`/`<span>`/font-size baked in — so a
  variable-width label can never shift the anchored tip. (Proven.)

## Retired

(None yet.)

## Rates SSOT — Part A executed (2026-07-03)

- **RATE-01** (needs-live) A person shows ONE tour rate — the Payroll Rates grid
  cell and any rate surfaced elsewhere read the same `personnel_rate_lines` value.
- **RATE-02** (needs-live) Edit a rate in the Payroll grid → budget Salary/Per-Diem
  derived lines update to the same figure (both read the SSOT via `computeTotals`).
- **RATE-03** (needs-live) Add a person to a tour → their card + a1–a5 rate lines
  seed from `personnel.standard_rates`; the Add-person form no longer has a rate
  amount field (only currency/period). The library `standard_rates` is unchanged.
- **RATE-04** (needs-live, after migration 230) Backfill report: run discovery §4
  query (b) → `cards_without_lines` = 0 after 230 applies; no rows lost (230 seeds
  from each card's own legacy columns, so the fallback-computed number is preserved
  exactly — zero money movement).
- **RATE-05** (needs-live) Crew "my schedule" pay now reads the SSOT
  (`personnel_rate_lines`), not `tour_personnel.rate_amount`. Basis unchanged
  (daily rate × days-in-window, day-period gate). Only crew whose stored
  rate_amount disagreed with their SSOT daily fee change — see the crew-pay
  reconcile in RATES_SSOT_DISCOVERY_2026-07-03.md §7. Migration 230 applies
  idempotently; 231 (column drop) is written but NOT applied.

## Data-integrity pass — Payroll grid (Phase P)

- **INT-03** (needs-live) Payroll Rates grid: type a value → Tab → moves to the
  next EDITABLE cell (skips the read-only totals: show/off days, total fee/PD),
  wrapping across rows; focus never leaves the grid; Shift+Tab reverses. Values
  entered by type-then-Tab persist on refresh. A split_rate person's Show /
  Off-Travel / Rehearsal cells each accept + persist distinct values. Confirm no
  regression in Channel List / Budget grids (same SpreadsheetGrid primitive).

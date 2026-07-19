# Routing rail smoke tests

> Shared `<RoutingRail>` — one days-on-the-left rail for every surface that
> indexes by tour day (Advance now; Rooming ×3 next; export/daysheet later).
> Component: `src/components/routing/RoutingRail.tsx`. ID prefix `RAIL`; IDs
> never recycled. See `docs/handover/ROUTING_RAIL_MAP.md` for the Stage A map +
> the D1–D5 decisions this build implements.

## Status snapshot (2026-06-09 — Stage B landed, needs-live)

| ID | Result | Note |
|----|--------|------|
| RAIL-01 | code-verified | renders date · venue/city · day-type pill, token-coloured |
| RAIL-02 | code-verified | selected entry = orange left border + `--lp-surface` bg |
| RAIL-03 | code-verified | `onSelect(routing.id)` fires; caller owns nav vs state |
| RAIL-04 | code-verified | `grouping='week'` buckets by Monday ISO with `WC dd Mon` headers |
| RAIL-05 | **needs-live** | Advance sidebar uses the rail; must look identical (Adam, Chrome) |
| RAIL-06 | code-verified | CSV / custom / empty `day_type` → first-type / `off` token, no crash |

`tsc` 0 · `eslint` 0 · `next build --webpack` green at this commit.

---

## What changed (Stage B)

- **`<RoutingRail>`** (`src/components/routing/RoutingRail.tsx`) — renders the
  list only (caller owns width/search/header/scroll chrome). Props:
  `{ entries: RailEntry[]; selected; onSelect; grouping?: 'night'|'week';
  hrefForEntry?; renderMeta?; showDayTypePill?; ariaLabel? }`.
  `RailEntry = { id, date, city?, venueName?, dayType?, weather?(reserved) }`
  — all real `routing` columns (`id/date/city/venue_name/day_type`).
- **D1** — added `--lp-day-*` aliases in `globals.css` (→ `--color-lp-day-*`,
  mirrors `--lp-orange`); de-duped the day-type colour map into
  `src/lib/routing/dayType.ts` (`DAY_TYPE_TOKEN`, `colourForDayType`,
  `labelForDayType`). `AdvanceOverview.tsx` + `TourOverviewClient.tsx` now
  import from it (local copies deleted).
- **D2** — Advance retrofit only. `AdvanceUpcomingSidebar` swaps its inner
  `<ul>` for `<RoutingRail>`; Advance keeps its progress-bar + overdue meta via
  `renderMeta`, navigates via `hrefForEntry`, stays show-days-only. **Payroll
  untouched** (being rebuilt to the 3-view model in its own pass).
- **D3** — Advance passes `showDayTypePill={false}` (pill-less, look preserved).
- **D4** — `weather?` is a reserved/unwired optional on `RailEntry`.
- **D5** — Advance uses `grouping='night'` (flat). Rooming will too.
- ISO-week helpers live in `src/lib/routing/week.ts` (`getWeekStart`,
  `formatWeekLabel`) — not imported from payroll, so routing has no dependency
  on the soon-to-be-rebuilt payroll surface.

---

## RAIL-01 — Entry content + day-type pill
**Do**: Render a rail with `showDayTypePill` on (default) on any populated tour.
**Expect**: each entry shows the uppercased date (`22 MAY 2025`, `lp-mono`),
the venue (or city fallback), the city as a second line when a venue is present,
and a coloured day-type pill (`var(--lp-day-*)` hue + low-alpha bg). Unknown/
custom/CSV `day_type` falls back to the `off` neutral and the first type's label.

## RAIL-02 — Selected highlight
**Do**: Pass `selected` = one entry's `routing.id`.
**Expect**: that entry has a 2px `var(--lp-orange)` left border + `--lp-surface`
background and its date reads orange; others are transparent.

## RAIL-03 — Selection model (caller-controlled)
**Do**: Use the rail with `hrefForEntry` (nav) vs without (button).
**Expect**: with `hrefForEntry`, entries are `<Link>`s that route + still fire
`onSelect`; without it, entries are `<button>`s that fire `onSelect(id)` only
(no navigation) — for state-driven surfaces like Rooming.

## RAIL-04 — Week grouping
**Do**: Render with `grouping='week'`.
**Expect**: entries bucket into Monday-based ISO weeks, each under a sticky
`WC 18 May` header; order is preserved.

## RAIL-05 — Advance looks identical (live)  ⟵ Adam, Chrome
**Do**: Open `/advance/[tourId]/[routingId]`. Read the left "Upcoming shows"
rail.
**Expect**: visually identical to before the retrofit — same date/venue/city
lines, progress bar, `% complete`, `N overdue`, and the active show's orange
border + tint. No day-type pill (Advance is pill-less). Clicking another show
navigates as before; search + "Copy advance from…" still work.

## RAIL-06 — Day-type degrades gracefully
**Do**: Feed an entry a CSV (`"show,festival"`), a custom type, or empty
`day_type`.
**Expect**: pill colour/label resolve from the FIRST type; unknown/empty →
`off` token; never blank, never a crash.

## Routing save is id-preserving + autosaves (routing route + RoutingEditor)

The root cause behind the earlier BLOCKED INT-01/02 is now FIXED: the routing POST
was delete-all-reinsert (fresh ids) → cascade-wiped budget_income + rider folders +
advances on every save. It is now an id-preserving reconcile, so autosave is safe.

- **ROUTE-01** (needs-live) **The money test / release gate.** Enter budget income
  on a show → edit that tour's routing (venue/city/notes) and save → the income is
  STILL there. Repeat for a show-scoped rider folder/pack + a settlement + rooming
  grid. (Was: all wiped on every routing save.)
- **ROUTE-02** (needs-live) Delete a routing date → ONLY that date's children
  (its income/folders/advance) cascade away; every other date's data is untouched.
  Add a date → new row; existing rows keep their ids + children.
- **ROUTE-03** (needs-live) Autosave: edit a routing cell → wait/refresh (no manual
  Save) → persisted, income intact, "Saved ✓" shown. Delete a day → refresh → stays
  cleared. Editing then Open-advance flushes the save first (edit not lost).
- **INT-01** (needs-live, UNBLOCKED by ROUTE-01/03) Routing persist: edit a cell +
  delete a day → refresh → both stuck, no manual Save, income intact.
- **ROUTE-04** (needs-live) **Advance-data guard (Salvage #4 — NO-OP with proof).**
  Fill an advance form on a show (sections + field data) → edit that tour's routing
  (change the venue/notes on a DIFFERENT date, and on the SAME date) and save → the
  advance instance + form config + intake links on every kept date are intact.
  Proof this needs no new code: `src/app/api/tours/[id]/routing/route.ts:179-182`
  upserts on `(tour_id, date)`; `ON CONFLICT DO UPDATE` never rewrites the primary
  key, so a kept date preserves `routing.id` and every `routing_id`-keyed advance
  child survives. The DELETE (lines 188-204) only removes dates dropped from the
  payload, so their advance children cascade — correct. The Part 1 reconcile already
  is the guard; item 4 landed no code change.
- **INT-02** (needs-live, UNBLOCKED) Routing→Advance: edit routing → Open Advance
  from the row menu → the edit is saved (flush-before-nav).

## Routing grid keyboard + venue search (CC_ROUTING_KEYBOARD) — 2026-07-19

Adam's no-mouse flow: click a row → ARROWS change day type → TAB → type venue →
results filter as you type → TAB commits the highlighted result and moves on.
Root cause of the 3× report: the day-type popup auto-focused its search box (in a
portal) so TAB cycled the portal's option buttons and never left the cell. Fix:
day-type ↑/↓ cycle the type IN PLACE (no popup); a shared `focusAdjacentCell`
(`src/lib/keyboard/cellNav.ts`) guarantees TAB exits from any popup-focused state
(portals marked `data-lp-dropdown` are skipped as Tab targets).

Verified with a headless keyboard smoke walking the exact sequence (assertions
pasted in the bank report). All green:

#### KEY-04 — day type ↑/↓ change in place, no popup
Focus the day-type cell, ArrowDown ×2 → value cycles `'' → show → off` IN PLACE,
popup stays closed. (measured: value `off`, popupClosed `true`)

#### KEY-05 — TAB leaves the day-type cell
The next focusable cell after the day-type trigger is the venue input — TAB is
never consumed by the day-type control. (measured: nextAfterDayType `venue`)

#### KEY-06 — venue: results FIRST, create-new LAST, TAB commits the highlight
Type "man" → after the debounce the FIRST list item is a venue result
("Manchester Arena"), the LAST item is "Create new". TAB commits the highlighted
result (canonical FK set) AND moves to the next cell. (measured: first item
`result`, last `create-new`, committed FK `v1`, focus → `city`)

#### KEY-07 — venue: free text on TAB (FK null) still moves on
Type "zzzq" (no library match) → list shows only create-new. TAB commits the raw
text as a free-text venue (FK null, per CC_VENUE_SSOT) and moves to the next cell.
(measured: committed name `zzzq`, FK `null`, focus → `city`)

**Shared-behaviour check**: payroll days matrix (arrows + Enter only, no popup),
channel-list select cells (`MicDiSelectCell` — no Tab handler / focus trap), and
`SpreadsheetGrid` (Tab = intentional next-editable-cell nav) do NOT swallow Tab.
Routing was the only offender.

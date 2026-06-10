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

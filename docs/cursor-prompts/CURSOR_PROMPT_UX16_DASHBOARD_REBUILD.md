# UX16 — Dashboard Rebuild

> Tour Overview + Today screen onto `<TimelineDashboard>` (UX07). Today-anchored, scrollable rolling timeline. Replaces the current dashboard with a Daysheets-inspired calendar view.

---

## 0. Context for Cursor

Read first:

1. `docs/cursor-prompts/UX_OVERHAUL_ROADMAP.md`.
2. UX07 — TimelineDashboard component spec.
3. `docs/daysheets-walkthrough.md` if present — feel reference.
4. UX02–UX15 (must be merged).

---

## 1. Pages in scope

| Route | Purpose |
|-------|---------|
| `/dashboard` | Post-login landing; can show all tours overview or single active tour. Pick: **single active tour if there is one, else tour picker.** |
| `/tours/[id]` | Tour overview — the main "what's happening" screen for a tour |
| `/today` (new, optional) | A focused "what's happening today" view. Only build if existing dashboard has separate Today logic; else skip. |

---

## 2. Hard rules

1. Use `<TimelineDashboard>` from UX07 as the primary content surface.
2. Today is anchored at left; user scrolls right for future days, left for past.
3. Rows are configurable per dashboard; default for tour overview: Shows / Hotels / Flights / Tasks.
4. Cards on the timeline open the right slide-over (PersonSlideOver / HotelSlideOver / FlightSlideOver / ShowSlideOver / etc) on click.
5. Dashboard is **read-mostly**. No primary editing. (Add a "+ Quick add" affordance for a task or note, that's it.)
6. Lint + typecheck clean.

---

## 3. Step 1 — Tour Overview at `/tours/[id]`

### 3.1 Layout

PageShell with `archetype: 'dashboard'`. LeftRail variant `dashboard` with links to:
- Overview (this page; active)
- Routing
- Advance
- Budget
- Personnel
- Rooming
- Files
- Channel List
- Rider Packs

### 3.2 Content (above the timeline)

A summary header strip:
- Tour name + status pill (active / archived / draft)
- Date range (start - end, days remaining if active)
- Quick stats chips: # shows, # personnel, total budget (with currency)
- Quick action buttons: Add show, Add personnel, Add file, Open in CommandPalette

Below the header, a scrolling rolling timeline that anchors on today.

### 3.3 Timeline rows

- **Shows**: TimelineItem per show, span = show date (single day for now). Card content: city + venue + day type colour. Click → ShowSlideOver.
- **Hotels**: TimelineItem per Hotel record, span = check_in_at → check_out_at. Card content: hotel name + room count. Click → first room's RoomSlideOver.
- **Flights**: TimelineItem per Flight, single day = depart date. Card content: airline + flight # + route. Click → FlightSlideOver.
- **Tasks** (if any tasks/reminders entity exists; if not, drop this row): TimelineItem per task, single day. Click → task slide-over (or ad-hoc).

### 3.4 Today panel (optional sticky)

When today is in view, render a sticky right-side mini panel showing today's items for quick reference. Or just rely on the highlighted today column.

Decision: **just the highlighted column**, no sticky panel. Keep it simple.

---

## 4. Step 2 — Top-level `/dashboard`

If no active tour exists or the user has multiple active tours:
- Show a tour picker (DataTable of tours, click → `/tours/[id]`)
- Optionally include a "this week across all tours" mini-timeline if multiple tours are active

If exactly one active tour: redirect to `/tours/[activeId]` to land the user where they need to be.

This is mostly routing logic; the heavy lifting is the tour overview built in Step 1.

---

## 5. Step 3 — Mobile fallback

TimelineDashboard's mobile fallback (vertical day list) is the primary mobile dashboard. Verify it works.

---

## 6. Verification

1. Lint + typecheck clean
2. Tour overview loads with timeline scrolled to today
3. Today's column highlighted
4. Cards on each row render correctly
5. Card click opens correct slide-over
6. Mobile view: vertical day list with cards stacked
7. Visual aesthetic: clean, modern, reminiscent of Daysheets without copying it
8. Performance: 365-day tour smooth-scrolling
9. Quick-action buttons in header trigger correct flows

---

## 7. Acceptance criteria

- [ ] `/tours/[id]` uses PageShell + dashboard archetype + TimelineDashboard
- [ ] `/dashboard` routing logic handles 0 / 1 / many active tours
- [ ] All four row types render
- [ ] Slide-over wiring works for cards
- [ ] Mobile fallback works
- [ ] Lint + typecheck clean
- [ ] No new deps

---

## 8. Out of scope

- ❌ Don't add Tasks entity if it doesn't exist; defer
- ❌ Don't add weather or external integrations (defer)
- ❌ Don't redesign Advance / pack editor — UX17

---

## 9. Commit plan

Two commits:
1. `UX16: Tour overview onto TimelineDashboard`
2. `UX16: Dashboard routing logic + mobile fallback`

# CC — ROUTING GRID KEYBOARD + VENUE SEARCH (third report of this bug — build to the exact flow). SINGLE OWNER.

Adam has now reported this three times; G1-C's keyboard contract did not cover the routing grid's day-type and venue cells. Treat the flow below as the acceptance test, not a description.

## THE FLOW ADAM TYPES (this must work end to end, no mouse)

```
click into a row  →  ARROWS change the day type  →  TAB  →  type venue letters
   →  results filter as you type  →  TAB locks in the highlighted result and moves on  →  …
```

## OBSERVED BROKEN BEHAVIOUR (production, 2026-07-18)
1. **Day type**: TAB opens the day-type dropdown, then TAB cycles through the day-type OPTIONS, and never moves to the next cell. Tab is being consumed by the dropdown.
2. **Venue**: typing shows **"add as new venue"** FIRST and only searches after Enter — create-new leads, results lag.
3. **Venue**: cannot TAB out of the venue field at all.

## REQUIRED BEHAVIOUR

**Day-type cell (`DayTypeCombobox`)**
- Focus = the cell is active with a visible ring. The list does NOT auto-open on focus/Tab.
- **↑/↓ change the selected day type in place** (cycling the options) WITHOUT opening a popup. Value commits as it changes.
- Optional: Enter or Alt+↓ opens the full list for mouse/scan use; Esc closes it and returns focus to the cell.
- **TAB always leaves the cell** and moves to the next editable cell in the row (venue). TAB is never consumed by the control — if a list is open, TAB closes it, commits the highlighted value, and moves on.

**Venue cell (`VenueAutocomplete`)**
- Typing ≥1 char triggers a **debounced (200–250ms) search that runs as you type** — no Enter required.
- **Results render FIRST, ranked. "Create '<x>' as a new venue" is the LAST item in the list, always.** Never the first, never before results have had a chance to return. While the query is in flight show a quiet "Searching…" row rather than jumping to create-new.
- ↑/↓ move the highlight through results; the first result is highlighted by default once results land.
- **TAB commits the highlighted result** (sets the canonical FK) **and moves to the next cell**. If nothing is highlighted (no results, free text), TAB commits the raw typed text as a free-text venue (FK null — this is explicitly supported per CC_VENUE_SSOT) and moves on.
- Enter also commits + stays; Esc reverts the cell to its previous value and keeps focus.
- **TAB must always exit** — under no circumstance can focus be trapped in this field.

**Grid-wide (applies to every cell in the routing grid)**
- TAB = next cell · Shift+TAB = previous cell · at row end, wrap to the next row's first editable cell.
- Arrows = navigate/adjust WITHIN the focused control (or move between cells when the control has no internal arrow behaviour).
- Enter = commit and stay · Esc = revert cell.
- No control may swallow TAB. This is the house rule from `docs/design-tokens.md` §13 — the routing grid is currently violating it.

## HOW TO VERIFY (do this, don't assume)
Write a keyboard smoke that walks the exact sequence: focus row → ArrowDown ×2 (day type changes, no popup) → Tab (focus is now the venue input) → type "man" → wait for results → assert first item is a venue result and the LAST item is create-new → Tab → assert the venue committed AND focus moved to the next cell. Then do it with a nonsense string ("zzzq") and assert Tab commits free text and still moves on. Paste the assertions in the report. Smokes KEY-04..07.

Also re-check the other two grids for the same TAB-swallowing pattern (payroll days matrix, channel list) — the fix should be a shared behaviour, not a one-off patch.

Gates: floor green, no money paths touched, git evidence per the hard rule.
